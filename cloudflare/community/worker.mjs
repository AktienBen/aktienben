const siteOrigin = "https://aktienben.github.io";
const browserIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const articlePattern = /^[a-z0-9-]{1,64}$/;

const headers = {
  "Access-Control-Allow-Origin": siteOrigin,
  "Cache-Control": "no-store"
};

function json(value, status = 200) {
  return Response.json(value, { status, headers });
}

async function verifyChallenge(token, action, env) {
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token })
  });
  if (!result.ok) throw new Error("Turnstile verification unavailable");
  const challenge = await result.json();
  return challenge.success && challenge.hostname === new URL(siteOrigin).hostname
    && challenge.action === action;
}

async function countLikes(db, article) {
  return db.prepare("SELECT COUNT(*) FROM likes WHERE article = ?").bind(article).first("COUNT(*)");
}

async function readArticle(db, article) {
  const [likes, comments] = await Promise.all([
    countLikes(db, article),
    db.prepare(
      "SELECT name, message, created_at FROM comments WHERE article = ? AND approved = 1 ORDER BY id DESC LIMIT 50"
    ).bind(article).all()
  ]);
  return json({ likes, comments: comments.results });
}

async function updateLike(db, article, browserId, liked) {
  const change = liked
    ? "INSERT OR IGNORE INTO likes (article, browser_id) VALUES (?, ?)"
    : "DELETE FROM likes WHERE article = ? AND browser_id = ?";
  await db.prepare(change).bind(article, browserId).run();
  return json({ likes: await countLikes(db, article), liked });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const [, prefix, article, action, extra] = pathname.split("/");
    const allowed = (env.ARTICLE_IDS ?? "").split(",").map(id => id.trim());
    if (prefix !== "articles" || extra !== undefined || !articlePattern.test(article ?? "") || !allowed.includes(article)) {
      return json({ error: "not_found" }, 404);
    }

    if (request.headers.get("Origin") !== siteOrigin) {
      return json({ error: "forbidden" }, 403);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...headers,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "3600"
        }
      });
    }

    try {
      if (request.method === "GET" && action === undefined) return await readArticle(env.DB, article);
      if (request.method !== "POST" || !["like", "comment"].includes(action)) {
        return json({ error: "not_found" }, 404);
      }

      // Cap the body even when a client omits Content-Length.
      if (!request.body || !request.headers.get("Content-Type")?.startsWith("application/json")) {
        return json({ error: "invalid_request" }, 400);
      }
      const reader = request.body.getReader();
      const decoder = new TextDecoder();
      let size = 0;
      let body = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16384) {
          await reader.cancel();
          return json({ error: "too_large" }, 413);
        }
        body += decoder.decode(value, { stream: true });
      }
      let input;
      try {
        input = JSON.parse(body + decoder.decode());
      } catch {
        return json({ error: "invalid_request" }, 400);
      }
      if (!input || typeof input !== "object") return json({ error: "invalid_request" }, 400);

      if (action === "like") {
        if (typeof input.browserId !== "string" || !browserIdPattern.test(input.browserId) || typeof input.liked !== "boolean") {
          return json({ error: "invalid_like" }, 400);
        }
        if (!await verifyChallenge(input.token, action, env)) return json({ error: "challenge_failed" }, 403);
        return await updateLike(env.DB, article, input.browserId.toLowerCase(), input.liked);
      }

      const name = typeof input.name === "string" ? input.name.trim() : "";
      const message = typeof input.message === "string" ? input.message.trim() : "";
      if (name.length > 80 || !message || message.length > 2000) {
        return json({ error: "invalid_comment" }, 400);
      }
      if (!await verifyChallenge(input.token, action, env)) return json({ error: "challenge_failed" }, 403);
      const comment = { name: name || "Anonym", message };
      await env.DB.prepare("INSERT INTO comments (article, name, message, approved) VALUES (?, ?, ?, 1)")
        .bind(article, comment.name, comment.message).run();
      return json({ comment }, 201);
    } catch {
      return json({ error: "temporarily_unavailable" }, 503);
    }
  }
};
