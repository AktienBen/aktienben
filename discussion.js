export function addDiscussion(container, article, { endpoint, siteKey }) {
  if (container.querySelector("[data-discussion]")) return;

  const section = document.createElement("section");
  section.className = "discussion";
  section.dataset.discussion = "";
  section.innerHTML = `
    <div class="discussion-likes">
      <button type="button" class="discussion-thumb-button" data-like aria-label="Gefällt mir" aria-pressed="false" disabled>
        <svg class="discussion-thumb" viewBox="0 0 24 24" width="23" height="23" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 10 11 3a2.5 2.5 0 0 1 2.5 2.5V9H19a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 17.6 20H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3Z"/>
        </svg>
      </button>
      <output data-like-count aria-label="Anzahl der Likes">–</output>
    </div>
    <div class="discussion-comments">
      <h3>Kommentare</h3>
      <p data-comments-message>Kommentare werden geladen …</p>
      <button type="button" class="discussion-like" data-retry hidden>Erneut laden</button>
      <ul class="discussion-list" data-comments></ul>
      <form class="contact-form">
        <label>Name (optional)<input name="name" maxlength="80" placeholder="Anonym"></label>
        <label>Kommentar<textarea name="message" required maxlength="2000" rows="4"></textarea></label>
        <div data-challenge></div>
        <button type="submit" class="button" disabled>Kommentar senden</button>
      </form>
      <p role="status"></p>
    </div>
  `;
  container.append(section);

  const status = section.querySelector("[role=status]");
  const comments = section.querySelector("[data-comments]");
  const commentsMessage = section.querySelector("[data-comments-message]");
  const retry = section.querySelector("[data-retry]");
  const like = section.querySelector("[data-like]");
  const likeCount = section.querySelector("[data-like-count]");
  const form = section.querySelector("form");
  const submit = form.querySelector("button");
  const challenge = section.querySelector("[data-challenge]");
  const url = new URL("articles/" + encodeURIComponent(article), endpoint.replace(/\/?$/, "/"));
  const likeKey = "aktienben:liked:" + article;
  let liked = readLocal(likeKey) === "yes";
  let writing = false;

  function displayLikes(total) {
    like.setAttribute("aria-pressed", String(liked));
    likeCount.textContent = String(total);
  }

  async function load() {
    retry.hidden = true;
    commentsMessage.textContent = "Kommentare werden geladen …";
    try {
      const data = await send(url);
      displayLikes(data.likes);
      comments.replaceChildren(...data.comments.map(createComment));
      commentsMessage.hidden = data.comments.length > 0;
      commentsMessage.textContent = "Noch keine Kommentare.";
      like.disabled = liked;
      submit.disabled = false;
    } catch {
      commentsMessage.textContent = "Kommentare konnten nicht geladen werden.";
      retry.hidden = false;
    }
  }

  async function write(action, data, success) {
    if (writing) return;
    writing = like.disabled = submit.disabled = true;
    status.textContent = "";
    try {
      const token = await getToken(challenge, siteKey, action);
      const response = await send(new URL(url.href + "/" + action), { ...data, token });
      success(response);
    } catch {
      status.textContent = "Die Aktion konnte nicht gespeichert werden. Bitte versuche es erneut.";
    } finally {
      writing = false;
      like.disabled = liked;
      submit.disabled = false;
    }
  }

  like.addEventListener("click", () => {
    if (liked) return;
    const key = "aktienben:browser";
    const browserId = readLocal(key) || crypto.randomUUID();
    if (!writeLocal(key, browserId)) {
      status.textContent = "Der Browser muss lokale Speicherung für Likes erlauben.";
      return;
    }

    void write("like", { browserId, liked: true }, data => {
      liked = data.liked;
      writeLocal(likeKey, "yes");
      displayLikes(data.likes);
    });
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    if (submit.disabled) return;

    const data = new FormData(form);
    void write("comment", { name: data.get("name"), message: data.get("message") }, response => {
      form.reset();
      if (!response.comment) {
        status.textContent = "Dein Kommentar wurde eingereicht.";
        return;
      }

      comments.prepend(createComment(response.comment));
      commentsMessage.hidden = true;
      status.textContent = "Dein Kommentar wurde veröffentlicht.";
    });
  });

  retry.addEventListener("click", () => void load());
  void load();
}

function createComment(item) {
  const comment = document.createElement("li");
  const name = document.createElement("strong");
  const message = document.createElement("p");
  name.textContent = item.name;
  message.textContent = item.message;
  message.style.whiteSpace = "pre-wrap";
  comment.append(name, message);
  return comment;
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
    const callback = "aktienBenTurnstileLoaded";
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=" + callback;

    function cleanup() {
      clearTimeout(timeout);
      delete window[callback];
    }

    function fail() {
      cleanup();
      script.remove();
      reject(new Error("Turnstile unavailable"));
    }

    const timeout = setTimeout(fail, 15000);
    window[callback] = () => {
      cleanup();
      resolve(window.turnstile);
    };
    script.onerror = fail;
    document.head.append(script);
  }).catch(error => {
    turnstileReady = undefined;
    throw error;
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
        sitekey, action, appearance: "interaction-only",
        callback: resolve, "error-callback": failed, "expired-callback": failed, "timeout-callback": failed
      });
    });
  } finally {
    if (widget !== undefined) turnstile.remove(widget);
  }
}
