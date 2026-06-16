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
const workdbMap = document.querySelector(".workdb-map");
const workdbSnapshot = document.querySelector("#workdbSnapshot");
const workdbMapStats = document.querySelector("#workdbMapStats");
const workdbMapInspector = document.querySelector("#workdbMapInspector");
const workdbMapInspectorMeta = document.querySelector("#workdbMapInspectorMeta");
const workdbMapInspectorTitle = document.querySelector("#workdbMapInspectorTitle");
const workdbMapInspectorBody = document.querySelector("#workdbMapInspectorBody");
const workdbMapInspectorAction = document.querySelector("#workdbMapInspectorAction");

let activeView = "workdb";
let activeItemId = null;
let currentUser = null;
let knowledgeBase = null;
let workdbSnapshotData = null;
let workdbSnapshotStarted = false;
let workdbNodeRecords = [];
let workdbRenderPoints = [];
let selectedWorkdbNodeIndex = null;
let hoveredWorkdbNodeIndex = null;

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
  updateViewState();
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
  updateViewState();
  startWorkdbSnapshot();
  renderSummary();
  renderCloudStatus("ready");
  renderList();
}

function fallbackWorkdbSnapshot() {
  const nodes = [];
  const edges = [];
  const colors = ["#f2f2f2", "#95b8ff", "#f4c46d", "#78ddc4", "#d7a7ff", "#ff9e7d", "#b0b0b0"];
  for (let cluster = 0; cluster < colors.length; cluster += 1) {
    const angle = -Math.PI / 2 + cluster * (Math.PI * 2 / colors.length);
    const cx = Math.cos(angle) * 0.36;
    const cy = Math.sin(angle) * 0.28;
    const centerIndex = nodes.length;
    nodes.push({ i: centerIndex, t: "cluster", c: colors[cluster], x: cx, y: cy, r: 11 });
    for (let index = 0; index < 22; index += 1) {
      const dotAngle = index * 2.399 + cluster;
      const radius = 0.04 + (index % 8) * 0.011;
      const dotIndex = nodes.length;
      nodes.push({
        i: dotIndex,
        t: index % 5 === 0 ? "project" : "tag",
        c: colors[cluster],
        x: cx + Math.cos(dotAngle) * radius,
        y: cy + Math.sin(dotAngle) * radius,
        r: index % 5 === 0 ? 4.4 : 2.8
      });
      edges.push({ s: centerIndex, t: dotIndex });
    }
  }
  return { counts: { nodes: nodes.length, edges: edges.length }, nodes, edges };
}

async function loadWorkdbSnapshot() {
  try {
    const response = await fetch("assets/tag-cloud-snapshot.json", { cache: "no-store" });
    if (!response.ok) throw new Error("snapshot unavailable");
    return await response.json();
  } catch {
    return fallbackWorkdbSnapshot();
  }
}

function buildWorkdbNodeRecords(snapshot) {
  const source = getCollection("workdb");
  const byKind = new Map();
  for (const item of source) {
    if (!byKind.has(item.kind)) byKind.set(item.kind, []);
    byKind.get(item.kind).push(item);
  }
  const cursor = new Map();
  const kindForType = {
    memory: "summary",
    cluster: "cluster",
    tag: "tag",
    project: "project",
    external: "external"
  };

  return (snapshot.nodes || []).map((node) => {
    const kind = kindForType[node.t];
    if (!kind) return null;
    const items = byKind.get(kind) || [];
    if (kind === "summary") return items[0] || null;
    const index = cursor.get(kind) || 0;
    cursor.set(kind, index + 1);
    return items[index] || null;
  });
}

function workdbPoint(node, width, height, timestamp) {
  const scale = Math.min(width, height) * 0.82;
  const offsetX = width * 0.52;
  const offsetY = height * 0.51;
  const angle = Math.sin(timestamp / 150000 * Math.PI * 2) * (Math.PI / 180 * 2.4);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = node.x * cos - node.y * sin;
  const y = node.x * sin + node.y * cos;
  return { x: offsetX + x * scale, y: offsetY + y * scale };
}

function workdbRadius(node) {
  return Math.max(1.3, node.r * (node.t === "cluster" ? 0.4 : 0.32));
}

function drawWorkdbSnapshot(canvas, snapshot, timestamp) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
  }

  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const nodes = snapshot.nodes || [];
  workdbRenderPoints = nodes.map((node, index) => ({
    index,
    node,
    point: workdbPoint(node, width, height, timestamp),
    radius: workdbRadius(node)
  }));

  ctx.lineWidth = 1;
  for (const edge of (snapshot.edges || []).slice(0, 1000)) {
    const source = workdbRenderPoints[edge.s];
    const target = workdbRenderPoints[edge.t];
    if (!source || !target) continue;
    ctx.strokeStyle = "rgba(236, 240, 234, 0.085)";
    ctx.beginPath();
    ctx.moveTo(source.point.x, source.point.y);
    ctx.lineTo(target.point.x, target.point.y);
    ctx.stroke();
  }

  for (const item of workdbRenderPoints) {
    const { index, node, point, radius } = item;
    const isActive = index === selectedWorkdbNodeIndex;
    const isHovered = index === hoveredWorkdbNodeIndex;
    ctx.globalAlpha = isActive ? 0.98 : isHovered ? 0.84 : node.t === "cluster" ? 0.76 : 0.56;
    ctx.fillStyle = node.c || "#d7d7d2";
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius + (isActive ? 1.6 : isHovered ? 1 : 0), 0, Math.PI * 2);
    ctx.fill();
  }

  for (const item of workdbRenderPoints) {
    if (item.index !== selectedWorkdbNodeIndex && item.index !== hoveredWorkdbNodeIndex) continue;
    ctx.globalAlpha = item.index === selectedWorkdbNodeIndex ? 0.9 : 0.55;
    ctx.strokeStyle = item.index === selectedWorkdbNodeIndex ? "rgba(107, 242, 220, 0.95)" : "rgba(244, 241, 232, 0.76)";
    ctx.lineWidth = item.index === selectedWorkdbNodeIndex ? 2 : 1.4;
    ctx.beginPath();
    ctx.arc(item.point.x, item.point.y, item.radius + 7, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function findWorkdbNodeAt(clientX, clientY) {
  if (!workdbSnapshot || !workdbRenderPoints.length) return null;
  const rect = workdbSnapshot.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  let best = null;
  for (const item of workdbRenderPoints) {
    const dx = item.point.x - x;
    const dy = item.point.y - y;
    const distance = Math.hypot(dx, dy);
    const hitRadius = Math.max(10, item.radius + 8);
    if (distance <= hitRadius && (!best || distance < best.distance)) {
      best = { index: item.index, distance };
    }
  }
  return best?.index ?? null;
}

function renderWorkdbMapInspector(index) {
  if (!workdbMapInspector || index === null || index === undefined) return;
  const node = workdbSnapshotData?.nodes?.[index];
  const record = workdbNodeRecords[index];
  const fallback = knowledgeBase?.workdb?.find((item) => item.kind === "summary");
  const actionRecord = record || fallback || null;

  workdbMapInspector.hidden = false;
  workdbMapInspectorMeta.textContent = record
    ? `${record.kind || node?.t || "node"} node`
    : `${node?.t || "index"} node`;
  workdbMapInspectorTitle.textContent = record
    ? getItemTitle(record)
    : "Private index point";
  workdbMapInspectorBody.textContent = record
    ? getItemSummary(record)
    : "This point exists in the private graph snapshot. The public graph keeps raw names out of the browser asset.";
  workdbMapInspectorAction.hidden = !actionRecord;
  workdbMapInspectorAction.textContent = record ? "Open record" : "Open summary";
  workdbMapInspectorAction.dataset.recordId = actionRecord?.id || "";
}

function hideWorkdbMapInspector() {
  if (!workdbMapInspector) return;
  workdbMapInspector.hidden = true;
  if (workdbMapInspectorAction) {
    workdbMapInspectorAction.dataset.recordId = "";
  }
}

function openWorkdbRecord(recordId, scroll = false) {
  if (!recordId) return;
  activeView = "workdb";
  activeItemId = recordId;
  if (kbSearch.value.trim()) {
    kbSearch.value = "";
  }
  updateViewState();
  renderList();
  if (scroll) {
    detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function syncWorkdbMapSelection(recordId) {
  const index = workdbNodeRecords.findIndex((record) => record?.id === recordId);
  selectedWorkdbNodeIndex = index >= 0 ? index : null;
}

function selectWorkdbNode(index) {
  if (index === null || index === undefined) return;
  selectedWorkdbNodeIndex = index;
  renderWorkdbMapInspector(index);
  const record = workdbNodeRecords[index];
  if (record) {
    openWorkdbRecord(record.id);
  }
}

function moveWorkdbNodeSelection(step) {
  const mappedIndexes = workdbNodeRecords
    .map((record, index) => record ? index : null)
    .filter((index) => index !== null);
  if (!mappedIndexes.length) return;

  const current = mappedIndexes.indexOf(selectedWorkdbNodeIndex);
  const nextPosition = current >= 0
    ? (current + step + mappedIndexes.length) % mappedIndexes.length
    : step > 0 ? 0 : mappedIndexes.length - 1;
  selectWorkdbNode(mappedIndexes[nextPosition]);
}

function bindWorkdbMapEvents() {
  if (!workdbSnapshot || workdbSnapshot.dataset.bound === "true") return;
  workdbSnapshot.dataset.bound = "true";

  workdbSnapshot.addEventListener("mousemove", (event) => {
    const index = findWorkdbNodeAt(event.clientX, event.clientY);
    hoveredWorkdbNodeIndex = index;
    workdbSnapshot.classList.toggle("is-clickable", index !== null);
  });

  workdbSnapshot.addEventListener("mouseleave", () => {
    hoveredWorkdbNodeIndex = null;
    workdbSnapshot.classList.remove("is-clickable");
  });

  workdbSnapshot.addEventListener("click", (event) => {
    selectWorkdbNode(findWorkdbNodeAt(event.clientX, event.clientY));
  });

  workdbSnapshot.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      moveWorkdbNodeSelection(1);
      event.preventDefault();
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      moveWorkdbNodeSelection(-1);
      event.preventDefault();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      const index = hoveredWorkdbNodeIndex ?? selectedWorkdbNodeIndex ?? 0;
      selectWorkdbNode(index);
      event.preventDefault();
    }
  });
}

async function startWorkdbSnapshot() {
  if (!workdbSnapshot || workdbSnapshotStarted) return;
  workdbSnapshotStarted = true;
  workdbSnapshotData = await loadWorkdbSnapshot();
  workdbNodeRecords = buildWorkdbNodeRecords(workdbSnapshotData);
  syncWorkdbMapSelection(activeItemId);
  if (selectedWorkdbNodeIndex !== null) {
    renderWorkdbMapInspector(selectedWorkdbNodeIndex);
  }
  bindWorkdbMapEvents();
  if (workdbMapStats) {
    const counts = workdbSnapshotData.counts || {};
    workdbMapStats.textContent = `${counts.nodes || workdbSnapshotData.nodes?.length || 0} nodes · ${counts.edges || workdbSnapshotData.edges?.length || 0} links`;
  }
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  function frame(timestamp) {
    if (!workdbMap?.hidden) {
      drawWorkdbSnapshot(workdbSnapshot, workdbSnapshotData, reduceMotion ? 0 : timestamp);
    }
    window.requestAnimationFrame(frame);
  }
  window.requestAnimationFrame(frame);
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
  if (activeView === "workdb") {
    syncWorkdbMapSelection(activeItemId);
    if (workdbNodeRecords.length && selectedWorkdbNodeIndex !== null) {
      renderWorkdbMapInspector(selectedWorkdbNodeIndex);
    } else if (workdbNodeRecords.length) {
      hideWorkdbMapInspector();
    }
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
      updateViewState();
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

function updateViewState() {
  updateNavState();
  if (workdbMap) {
    workdbMap.hidden = activeView !== "workdb";
  }
}

document.querySelectorAll(".kb-nav-button").forEach((button) => {
  button.addEventListener("click", () => {
    activeView = button.dataset.view;
    activeItemId = null;
    updateViewState();
    renderList();
  });
});

kbSearch.addEventListener("input", renderList);

workdbMapInspectorAction?.addEventListener("click", () => {
  openWorkdbRecord(workdbMapInspectorAction.dataset.recordId, true);
});

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
