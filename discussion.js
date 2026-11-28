export function addDiscussion(container, article, { endpoint, siteKey }) {
  if (container.querySelector("[data-discussion]")) return;

  const section = document.createElement("section");
  section.dataset.discussion = "";
  section.innerHTML = '<button type="button" class="button">Likes und Kommentare anzeigen</button>';
  container.append(section);
  const open = section.querySelector("button");
  const url = new URL("articles/" + encodeURIComponent(article), endpoint.replace(/\/?$/, "/"));

  async function load() {
    open.disabled = true;
    try {
      const initial = await send(url);
      showDiscussion(initial);
    } catch {
      open.textContent = "Likes und Kommentare erneut laden";
      open.disabled = false;
    }
  }

  function showDiscussion(initial) {
    section.innerHTML = `
      <button type="button" class="button" data-like aria-pressed="false"></button>
      <h3>Kommentare</h3>
      <div data-comments></div>
      <form class="contact-form">
        <label>Name (optional)<input name="name" maxlength="80" placeholder="Anonym"></label>
        <label>Kommentar<textarea name="message" required maxlength="2000" rows="4"></textarea></label>
        <div data-challenge></div>
        <button type="submit" class="button">Kommentar senden</button>
      </form>
      <p role="status"></p>
    `;

    const status = section.querySelector("[role=status]");
    const comments = section.querySelector("[data-comments]");
    const like = section.querySelector("[data-like]");
    const form = section.querySelector("form");
    const submit = form.querySelector("button");
    const challenge = section.querySelector("[data-challenge]");
    const likeKey = "aktienben:liked:" + article;
    let liked = readLocal(likeKey) === "yes";

    function displayLikes(total) {
      like.setAttribute("aria-pressed", String(liked));
      like.textContent = "Gefällt mir (" + total + ")";
    }

    displayLikes(initial.likes);
    if (!initial.comments.length) comments.textContent = "Noch keine Kommentare.";
    for (const item of initial.comments) {
      const comment = document.createElement("article");
      const name = document.createElement("strong");
      const message = document.createElement("p");
      name.textContent = item.name;
      message.textContent = item.message;
      message.style.whiteSpace = "pre-wrap";
      comment.append(name, message);
      comments.append(comment);
    }

    async function write(action, data, success) {
      like.disabled = submit.disabled = true;
      status.textContent = "";
      try {
        const token = await getToken(challenge, siteKey, action);
        const response = await send(new URL(url.href + "/" + action), { ...data, token });
        success(response);
      } catch {
        status.textContent = "Die Aktion konnte nicht gespeichert werden. Bitte versuche es erneut.";
      } finally {
        like.disabled = submit.disabled = false;
      }
    }

    like.addEventListener("click", () => {
      const key = "aktienben:browser";
      const browserId = readLocal(key) || crypto.randomUUID();
      if (!writeLocal(key, browserId)) {
        status.textContent = "Der Browser muss lokale Speicherung für Likes erlauben.";
        return;
      }
      void write("like", { browserId, liked: !liked }, data => {
        liked = data.liked;
        writeLocal(likeKey, liked ? "yes" : "no");
        displayLikes(data.likes);
      });
    });

    form.addEventListener("submit", event => {
      event.preventDefault();
      const data = new FormData(form);
      void write("comment", { name: data.get("name"), message: data.get("message") }, () => {
        form.reset();
        status.textContent = "Dein Kommentar wurde eingereicht und wartet auf Freigabe.";
      });
    });
  }

  open.addEventListener("click", load);
}

function readLocal(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeLocal(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

async function send(url, body) {
  const response = await fetch(url, body && {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error("Discussion API unavailable");
  return response.json();
}

let turnstileReady;
function loadTurnstile() {
  turnstileReady ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.onload = () => window.turnstile.ready(() => resolve(window.turnstile));
    script.onerror = () => {
      turnstileReady = undefined;
      script.remove();
      reject(new Error("Turnstile unavailable"));
    };
    document.head.append(script);
  });
  return turnstileReady;
}

async function getToken(element, sitekey, action) {
  const turnstile = await loadTurnstile();
  let widget;
  try {
    return await new Promise((resolve, reject) => {
      const failed = () => reject(new Error("Verification failed"));
      widget = turnstile.render(element, {
        sitekey, action, execution: "execute", appearance: "interaction-only",
        callback: resolve, "error-callback": failed, "expired-callback": failed, "timeout-callback": failed
      });
      turnstile.execute(widget);
    });
  } finally {
    if (widget !== undefined) turnstile.remove(widget);
  }
}
