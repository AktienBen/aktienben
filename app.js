const discussionSettings = {
  endpoint: "https://aktienben-community.kontakt-aktienben.workers.dev/",
  siteKey: "0x4AAAAAAGXDJUTM0vLAzDr6"
};

async function mountDiscussion(articleBody, articleId) {
  if (!articleBody || !articleId) return;

  try {
    const { addDiscussion } = await import("./discussion.js?v=602bff8a");
    if (articleBody.isConnected) addDiscussion(articleBody, articleId, discussionSettings);
  } catch (error) {
    console.warn("Der Kommentarbereich konnte nicht geladen werden.", error);
  }
}


const sortedArticles = [...articles].sort(
  (a, b) => b.date.localeCompare(a.date)
);

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function formatDate(date) {
  return new Date(date + "T12:00:00").toLocaleDateString(
    "de-DE",
    { day: "2-digit", month: "long", year: "numeric" }
  );
}

function cover(article) {
  const image = article.image
    ? `<img src="${escapeHTML(article.image)}"
             alt="${escapeHTML(article.company)}"
             loading="lazy">`
    : "";

  return `
    <div class="cover">
      ${image}
      ${!article.image
        ? `<span class="cover-label">${escapeHTML(article.ticker)}</span>`
        : ""}
    </div>
  `;
}

function articleHref(article) {
  return article.page || ("analysen.html#" + encodeURIComponent(article.id));
}

function card(article) {
  return `
    <a class="card" href="${escapeHTML(articleHref(article))}">
      ${cover(article)}
      <div class="card-content">
        <span class="meta">
          ${escapeHTML(article.ticker)} · ${formatDate(article.date)}
        </span>
        <h3>${escapeHTML(article.title)}</h3>
        <p>${escapeHTML(article.excerpt)}</p>
        <span class="text-link">Analyse lesen ↗</span>
      </div>
    </a>
  `;
}

function renderChart(block) {
  const max = Math.max(...block.values, 1);

  const rows = block.labels.map((label, index) => {
    const value = block.values[index];
    const width = Math.max(0, Math.min(100, value / max * 100));

    return `
      <div class="chart-row">
        <span>${escapeHTML(label)}</span>
        <div class="chart-track">
          <div class="chart-bar" style="width:${width}%"></div>
        </div>
        <span class="chart-value">
          ${escapeHTML(value)} ${escapeHTML(block.unit || "")}
        </span>
      </div>
    `;
  }).join("");

  return `
    <h3>${escapeHTML(block.heading)}</h3>
    <div class="chart" role="img"
         aria-label="${escapeHTML(block.heading)}">
      ${rows}
      <p class="chart-note">${escapeHTML(block.note || "")}</p>
    </div>
  `;
}

function renderBlock(block) {
  // Statisch hinterlegter, redaktioneller HTML-Inhalt (Cloudflare).
  if (block.type === "formatted") return block.html;
  if (block.type === "text") {
    return `
      <section>
        <h3>${escapeHTML(block.heading)}</h3>
        <p>${escapeHTML(block.text)}</p>
      </section>
    `;
  }

  if (block.type === "image") {
    if (!block.src) return "";

    return `
      <figure class="article-figure">
        <img src="${escapeHTML(block.src)}"
             alt="${escapeHTML(block.caption || "Finanzgrafik")}"
             loading="lazy">
        <figcaption>${escapeHTML(block.caption || "")}</figcaption>
      </figure>
    `;
  }

  if (block.type === "chart") return renderChart(block);

  return "";
}

function analysisItem(article) {
  return `
    <details class="analysis-item" id="${escapeHTML(article.id)}">
      <summary>
        ${cover(article)}
        <div class="analysis-summary">
          <span class="meta">
            ${escapeHTML(article.ticker)} · ${formatDate(article.date)}
          </span>
          <h3>${escapeHTML(article.title)}</h3>
          <p>${escapeHTML(article.excerpt)}</p>
        </div>
        <span class="toggle" aria-hidden="true">+</span>
      </summary>

      <div class="article-body">
        ${article.content.map(renderBlock).join("")}
        ${article.id === "cloudflare" ? "" : `<p class="chart-note">${article.id === "servicenow" ? "Disclaimer: Keine Anlageberatung. Alle Inhalte dienen ausschließlich Informationszwecken. Das ist meine Recherchearbeit. Investitionen erfolgen auf eigene Verantwortung und sind mit Risiken verbunden." : "Hinweis: Keine Anlageberatung. Alle Angaben sind eigenständig zu überprüfen."}</p>`}
      </div>
    </details>
  `;
}

function openFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;

  const target = document.getElementById(id);
  if (target && target.tagName === "DETAILS") {
    target.open = true;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function initHome() {
  const featured = document.getElementById("featured");
  const recent = document.getElementById("recent");

  if (!featured || !sortedArticles.length) return;

  const latest = sortedArticles[0];

  featured.innerHTML = `
    <div class="featured-card">
      ${cover(latest)}
      <div class="featured-content">
        <span class="meta">
          ${escapeHTML(latest.ticker)} · ${formatDate(latest.date)}
        </span>
        <h3>${escapeHTML(latest.title)}</h3>
        <p>${escapeHTML(latest.excerpt)}</p>
        <a class="button"
           href="${escapeHTML(articleHref(latest))}">
          Vollständige Analyse ↗
        </a>
      </div>
    </div>
  `;

  recent.innerHTML = sortedArticles.slice(1, 5).map(card).join("");
}

function initAnalyses() {
  const list = document.getElementById("analysis-list");
  const search = document.getElementById("search");
  if (!list) return;

  function render(query = "") {
    const term = query.trim().toLocaleLowerCase("de-DE");

    const matches = sortedArticles.filter(article =>
      [article.company, article.ticker, article.title, article.excerpt]
        .some(value => value.toLocaleLowerCase("de-DE").includes(term))
    );

    list.innerHTML = matches.length
      ? matches.map(analysisItem).join("")
      : `<p class="empty">Keine passenden Analysen gefunden.</p>`;

    // Immer nur eine Analyse gleichzeitig geöffnet
    list.querySelectorAll("details").forEach(details => {
      details.addEventListener("toggle", () => {
        if (!details.open) return;
        void mountDiscussion(details.querySelector(".article-body"), details.id);

        list.querySelectorAll("details").forEach(other => {
          if (other !== details) other.open = false;
        });
      });
    });

    openFromHash();
  }

  render();

  search?.addEventListener("input", event => {
    render(event.target.value);
  });

  window.addEventListener("hashchange", openFromHash);
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".year").forEach(element => {
    element.textContent = new Date().getFullYear();
  });

  if (document.body.dataset.page === "home") initHome();
  if (document.body.dataset.page === "analysen") initAnalyses();

  if (document.body.dataset.page === "article") {
    const page = location.pathname.split("/").pop();
    const article = articles.find(article => article.page === page);
    void mountDiscussion(document.querySelector("main .article-body"), article?.id);
  }
});
