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
const cloudStatus = document.querySelector("#cloudStatus");
const vaultTitle = document.querySelector("#vaultTitle");
const vaultSummary = document.querySelector("#vaultSummary");
const listEyebrow = document.querySelector("#listEyebrow");
const listTitle = document.querySelector("#listTitle");
const kbList = document.querySelector("#kbList");
const detailPanel = document.querySelector("#detailPanel");
const kbSearch = document.querySelector("#kbSearch");

let activeView = "workdb";
let activeItemId = null;
let currentUser = null;
let knowledgeBase = null;

const viewLabels = {
  articles: ["Articles", "Compiled wiki"],
  workdb: ["Work DB", "Remote-safe work context"],
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
  signInButton.hidden = false;
  sessionState.hidden = true;
  sessionState.textContent = "";
  signOutButton.hidden = true;
}

async function showWorkspace(user) {
  authGate.hidden = true;
  knowledgeShell.hidden = false;
  sessionState.textContent = user.email || "Signed in";
  sessionState.hidden = false;
  signInButton.hidden = true;
  signOutButton.hidden = false;
  activeView = "workdb";
  activeItemId = null;
  updateNavState();
  summaryGrid.innerHTML = `<article class="kb-stat"><span>Status</span><strong>Loading</strong></article>`;
  renderCloudStatus("loading");
  knowledgeBase = await loadKnowledgeBase();
  renderWorkspace();
}

async function loadKnowledgeBase() {
  const vaultRef = doc(db, "vaults", "main");
  const vaultSnapshot = await getDoc(vaultRef);
  if (!vaultSnapshot.exists()) {
    throw new Error("Knowledge vault was not found in Firestore.");
  }

  const [articles, workdbContext, sources, checks, outputs] = await Promise.all([
    loadCollection("articles"),
    loadCollection("workdbContext"),
    loadCollection("sources"),
    loadCollection("checks"),
    loadCollection("outputs")
  ]);

  if (!workdbContext.length) {
    throw new Error("Firestore Work DB context is empty. Run npm run seed:firestore after rebuilding the local Work DB.");
  }

  if (!workdbContext.some((item) => item.kind === "summary")) {
    throw new Error("Firestore Work DB context is missing its summary document.");
  }

  return {
    meta: vaultSnapshot.data(),
    articles,
    workdb: workdbContext,
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
  const items = knowledgeBase[view] || [];
  if (view !== "workdb") return items;
  const rank = { summary: 0, cluster: 1, project: 2, tag: 3, external: 4 };
  return items.slice().sort((left, right) => {
    return (rank[left.kind] ?? 9) - (rank[right.kind] ?? 9)
      || Number(right.fileCount || right.recordCount || right.count || 0) - Number(left.fileCount || left.recordCount || left.count || 0)
      || getItemTitle(left).localeCompare(getItemTitle(right));
  });
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
  updateNavState();
  renderSummary();
  renderCloudStatus("ready");
  renderList();
}

function renderSummary() {
  const meta = knowledgeBase.meta;
  const workSummary = knowledgeBase.workdb.find((item) => item.kind === "summary") || {};
  const stats = [
    ["Articles", meta.articleCount],
    ["Work files", meta.workdbFileCount || workSummary.fileCount || 0],
    ["Projects", meta.workdbProjectCount || workSummary.projectCount || 0],
    ["Integrity", `${meta.integrityScore}%`]
  ];

  summaryGrid.innerHTML = stats.map(([label, value]) => `
    <article class="kb-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `).join("");
}

function renderCloudStatus(state, error = null) {
  if (!cloudStatus) return;

  if (state === "loading") {
    cloudStatus.innerHTML = `
      <article class="cloud-status-card">
        <span>Cloud DB</span>
        <strong>Loading Firestore</strong>
        <p>Checking the authenticated vault and Work DB context.</p>
      </article>
    `;
    return;
  }

  if (state === "error") {
    cloudStatus.innerHTML = `
      <article class="cloud-status-card is-error">
        <span>Cloud DB</span>
        <strong>Unavailable</strong>
        <p>${escapeHtml(error?.message || "Firestore workspace failed to load.")}</p>
      </article>
    `;
    return;
  }

  const meta = knowledgeBase.meta;
  const workSummary = knowledgeBase.workdb.find((item) => item.kind === "summary") || {};
  const workDocs = knowledgeBase.workdb.length;
  const privacyMode = meta.workdbPrivacyMode || workSummary.privacyMode || "remote-index-no-paths-no-snippets-no-file-content";
  const defaultCommand = (workSummary.localCommands || []).find((command) => command.includes("context"))
    || "npm run workdb -- context \"query\" --limit 12";

  cloudStatus.innerHTML = [
    ["Cloud DB", "Connected", `${workDocs} Work DB docs loaded from Firestore after Google sign-in.`, "is-ok"],
    ["Privacy", "Remote-safe", privacyMode, "is-ok"],
    ["Codex Context", "Ready", defaultCommand, "is-command"]
  ].map(([label, title, body, className]) => `
    <article class="cloud-status-card ${className}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(body)}</p>
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
    const meta = activeView === "workdb"
      ? [item.kind, item.clusterLabel].filter(Boolean).join(" · ")
      : item.type || item.kind || item.severity || item.status || "";
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

function renderMetricGrid(metrics = []) {
  if (!metrics.length) return "";
  return `
    <div class="mini-metric-grid">
      ${metrics.map(([label, value]) => `
        <div class="mini-metric">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderCommandBlock(commands = []) {
  const rows = Array.isArray(commands) ? commands.filter(Boolean) : [commands].filter(Boolean);
  if (!rows.length) return "";
  return `
    <section class="detail-section">
      <h3>Codex follow-up</h3>
      <div class="command-list">
        ${rows.map((command) => `
          <button class="command-copy" type="button" data-command="${escapeHtml(command)}">
            <code>${escapeHtml(command)}</code>
            <span>Copy</span>
          </button>
        `).join("")}
      </div>
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

  if (activeView === "workdb") {
    const metrics = [
      ["Kind", item.kind],
      item.fileCount !== undefined ? ["Files", item.fileCount] : null,
      item.projectCount !== undefined ? ["Projects", item.projectCount] : null,
      item.recordCount !== undefined ? ["Records", item.recordCount] : null,
      item.codexSessionCount !== undefined ? ["Codex sessions", item.codexSessionCount] : null,
      item.claudeSessionCount !== undefined ? ["Claude records", item.claudeSessionCount] : null
    ].filter(Boolean);
    const commands = [
      item.cloudCommand,
      ...(item.cloudCommands || []),
      ...(item.localCommands || []),
      item.localCommand,
      item.localSearchCommand
    ].filter(Boolean);
    detailPanel.innerHTML = `
      <p class="eyebrow">${escapeHtml(item.kind)}${item.clusterLabel ? ` · ${escapeHtml(item.clusterLabel)}` : ""}</p>
      <h2>${escapeHtml(item.title)}</h2>
      <p class="detail-summary">${escapeHtml(item.summary)}</p>
      ${renderTagList(item.tags)}
      ${renderMetricGrid(metrics)}
      <section class="detail-section">
        <h3>Remote safety boundary</h3>
        <p>${escapeHtml(item.privacyMode || item.provenance || "Remote copy excludes local paths, snippets, file content, and git remotes.")}</p>
      </section>
      ${item.hasSensitiveSignals ? `
        <section class="detail-section warning-section">
          <h3>Sensitive source signal</h3>
          <p>This project has local sensitive markers. The remote record keeps only the flag and excludes exact paths, snippets, and secret-like tags.</p>
        </section>
      ` : ""}
      ${renderCommandBlock(commands)}
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

  detailPanel.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", async () => {
      const command = button.dataset.command || "";
      try {
        await navigator.clipboard.writeText(command);
        button.querySelector("span").textContent = "Copied";
      } catch {
        button.querySelector("span").textContent = "Select";
      }
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
  authNote.textContent = "";
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error(error);
    authNote.textContent = "Sign-in failed.";
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
    authNote.textContent = "Access denied.";
    return;
  }

  currentUser = user;
  try {
    await showWorkspace(user);
  } catch (error) {
    console.error(error);
    renderCloudStatus("error", error);
    authNote.textContent = "Workspace unavailable.";
    showGate();
  }
});
