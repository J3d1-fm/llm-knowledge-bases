import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = window.LKB_FIREBASE_CONFIG;
const accessConfig = window.LKB_ACCESS_CONFIG || {};
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const provider = new GoogleAuthProvider();
const db = getFirestore(firebaseApp);

const authGate = document.querySelector("#authGate");
const knowledgeShell = document.querySelector("#knowledgeShell");
const sessionState = document.querySelector("#sessionState");
const signOutButton = document.querySelector("#signOutButton");
const signInButton = document.querySelector("#signInButton");
const authNote = document.querySelector("#authNote");
const summaryGrid = document.querySelector("#summaryGrid");
const vaultTitle = document.querySelector("#vaultTitle");
const vaultSummary = document.querySelector("#vaultSummary");
const listEyebrow = document.querySelector("#listEyebrow");
const listTitle = document.querySelector("#listTitle");
const kbList = document.querySelector("#kbList");
const detailPanel = document.querySelector("#detailPanel");
const kbSearch = document.querySelector("#kbSearch");

let activeView = "articles";
let activeItemId = null;
let currentUser = null;
let knowledgeBase = null;

const viewLabels = {
  articles: ["Articles", "Compiled wiki"],
  sources: ["Sources", "Raw and derived source coverage"],
  checks: ["Health checks", "Integrity queue"],
  outputs: ["Outputs", "Filed research artifacts"]
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function emailAllowed(email) {
  const allowed = accessConfig.allowedEmails || [];
  return allowed.length === 0 || allowed.includes(email);
}

function showGate() {
  authGate.hidden = false;
  knowledgeShell.hidden = true;
  sessionState.textContent = "Signed out";
  signOutButton.hidden = true;
}

async function showWorkspace(user) {
  authGate.hidden = true;
  knowledgeShell.hidden = false;
  sessionState.textContent = user.email || "Signed in";
  signOutButton.hidden = false;
  summaryGrid.innerHTML = `<article class="kb-stat"><span>Status</span><strong>Loading</strong></article>`;
  knowledgeBase = await loadKnowledgeBase();
  renderWorkspace();
}

async function loadKnowledgeBase() {
  const vaultRef = doc(db, "vaults", "main");
  const vaultSnapshot = await getDoc(vaultRef);
  if (!vaultSnapshot.exists()) {
    throw new Error("Knowledge vault was not found in Firestore.");
  }

  const [articles, sources, checks, outputs] = await Promise.all([
    loadCollection("articles"),
    loadCollection("sources"),
    loadCollection("checks"),
    loadCollection("outputs")
  ]);

  return {
    meta: vaultSnapshot.data(),
    articles,
    sources,
    checks,
    outputs
  };
}

async function loadCollection(name) {
  const querySnapshot = await getDocs(collection(db, "vaults", "main", name));
  return querySnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

function getCollection(view) {
  return knowledgeBase[view] || [];
}

function getItemTitle(item) {
  return item.title || item.id;
}

function getItemSummary(item) {
  return item.summary || item.finding || "";
}

function itemMatches(item, query) {
  if (!query) return true;
  const haystack = JSON.stringify(item).toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function renderWorkspace() {
  vaultTitle.textContent = knowledgeBase.meta.title;
  vaultSummary.textContent = knowledgeBase.meta.summary;
  renderSummary();
  renderList();
}

function renderSummary() {
  const meta = knowledgeBase.meta;
  const stats = [
    ["Articles", meta.articleCount],
    ["Sources", meta.sourceCount],
    ["Outputs", meta.outputCount],
    ["Integrity", `${meta.integrityScore}%`]
  ];

  summaryGrid.innerHTML = stats.map(([label, value]) => `
    <article class="kb-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `).join("");
}

function renderList() {
  const [eyebrow, title] = viewLabels[activeView];
  const query = kbSearch.value.trim();
  const items = getCollection(activeView).filter((item) => itemMatches(item, query));
  listEyebrow.textContent = eyebrow;
  listTitle.textContent = title;

  if (!activeItemId || !items.some((item) => item.id === activeItemId)) {
    activeItemId = items[0]?.id || null;
  }

  kbList.innerHTML = items.length ? items.map((item) => {
    const activeClass = item.id === activeItemId ? " is-active" : "";
    const meta = item.type || item.kind || item.severity || item.status || "";
    return `
      <button class="kb-list-item${activeClass}" type="button" data-id="${escapeHtml(item.id)}">
        <span>${escapeHtml(meta)}</span>
        <strong>${escapeHtml(getItemTitle(item))}</strong>
        <small>${escapeHtml(getItemSummary(item))}</small>
      </button>
    `;
  }).join("") : `<p class="empty-state">No matching items.</p>`;

  kbList.querySelectorAll(".kb-list-item").forEach((button) => {
    button.addEventListener("click", () => {
      activeItemId = button.dataset.id;
      renderList();
    });
  });

  renderDetail(items.find((item) => item.id === activeItemId));
}

function renderTagList(tags = []) {
  if (!tags.length) return "";
  return `<div class="tag-row">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>`;
}

function renderLinkedArticles(ids = []) {
  if (!ids.length) return "";
  const articles = ids.map((id) => knowledgeBase.articles.find((article) => article.id === id)).filter(Boolean);
  if (!articles.length) return "";
  return `
    <section class="detail-section">
      <h3>Linked concepts</h3>
      <div class="linked-grid">
        ${articles.map((article) => `
          <button class="linked-item" type="button" data-link-id="${escapeHtml(article.id)}">
            ${escapeHtml(article.title)}
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function renderSourceRefs(ids = []) {
  if (!ids.length) return "";
  const sources = ids.map((id) => knowledgeBase.sources.find((source) => source.id === id)).filter(Boolean);
  if (!sources.length) return "";
  return `
    <section class="detail-section">
      <h3>Source coverage</h3>
      <ul class="source-list">
        ${sources.map((source) => `<li><strong>${escapeHtml(source.title)}</strong><span>${escapeHtml(source.status)}</span></li>`).join("")}
      </ul>
    </section>
  `;
}

function renderDetail(item) {
  if (!item) {
    detailPanel.innerHTML = `<p class="empty-state">Select an item to inspect it.</p>`;
    return;
  }

  if (activeView === "articles") {
    detailPanel.innerHTML = `
      <p class="eyebrow">${escapeHtml(item.type)} · ${escapeHtml(item.confidence)} confidence</p>
      <h2>${escapeHtml(item.title)}</h2>
      <p class="detail-summary">${escapeHtml(item.summary)}</p>
      ${renderTagList(item.tags)}
      <section class="detail-section">
        <h3>Compiled article</h3>
        ${item.body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
      </section>
      ${renderLinkedArticles(item.links)}
      ${renderSourceRefs(item.sources)}
    `;
  }

  if (activeView === "sources") {
    detailPanel.innerHTML = `
      <p class="eyebrow">${escapeHtml(item.kind)} · ${escapeHtml(item.status)}</p>
      <h2>${escapeHtml(item.title)}</h2>
      <p class="detail-summary">${escapeHtml(item.summary)}</p>
      ${renderLinkedArticles(item.usedBy)}
    `;
  }

  if (activeView === "checks") {
    detailPanel.innerHTML = `
      <p class="eyebrow">${escapeHtml(item.severity)} severity · ${escapeHtml(item.status)}</p>
      <h2>${escapeHtml(item.title)}</h2>
      <p class="detail-summary">${escapeHtml(item.finding)}</p>
      <section class="detail-section">
        <h3>Scope</h3>
        <p>${escapeHtml(item.scope)}</p>
      </section>
      <section class="detail-section">
        <h3>Next action</h3>
        <p>${escapeHtml(item.nextAction)}</p>
      </section>
    `;
  }

  if (activeView === "outputs") {
    detailPanel.innerHTML = `
      <p class="eyebrow">${escapeHtml(item.type)} · ${escapeHtml(item.status)}</p>
      <h2>${escapeHtml(item.title)}</h2>
      <p class="detail-summary">${escapeHtml(item.summary)}</p>
      <section class="detail-section">
        <h3>Path</h3>
        <p><code>${escapeHtml(item.path)}</code></p>
      </section>
    `;
  }

  detailPanel.querySelectorAll("[data-link-id]").forEach((button) => {
    button.addEventListener("click", () => {
      activeView = "articles";
      activeItemId = button.dataset.linkId;
      updateNavState();
      renderList();
    });
  });
}

function updateNavState() {
  document.querySelectorAll(".kb-nav-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === activeView);
  });
}

document.querySelectorAll(".kb-nav-button").forEach((button) => {
  button.addEventListener("click", () => {
    activeView = button.dataset.view;
    activeItemId = null;
    updateNavState();
    renderList();
  });
});

kbSearch.addEventListener("input", renderList);

signInButton.addEventListener("click", async () => {
  authNote.textContent = "Opening Google sign-in...";
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    authNote.textContent = `Sign-in failed: ${error.code || error.message}`;
  }
});

signOutButton.addEventListener("click", async () => {
  await signOut(auth);
  showGate();
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUser = null;
    showGate();
    return;
  }

  if (!emailAllowed(user.email)) {
    await signOut(auth);
    authNote.textContent = "This Google account is not allowed for this workspace.";
    return;
  }

  currentUser = user;
  try {
    await showWorkspace(user);
  } catch (error) {
    authNote.textContent = error.message;
    showGate();
  }
});
