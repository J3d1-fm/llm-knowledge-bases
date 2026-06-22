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
const workdbGraphControls = document.querySelectorAll("[data-workdb-graph-action]");

let activeView = "workdb";
let activeItemId = null;
let currentUser = null;
let knowledgeBase = null;
let workdbSnapshotData = null;
let workdbSnapshotStarted = false;
let workdbNodeRecords = [];
let workdbGraphCache = null;
let workdbAgentEdges = [];
let workdbRenderPoints = [];
let selectedWorkdbNodeIndex = null;
let hoveredWorkdbNodeIndex = null;
let workdbGraphZoom = 1;
let workdbGraphPanX = 0;
let workdbGraphPanY = 0;
let workdbGraphHasFit = false;
let workdbGraphIsPanning = false;
let workdbGraphPointer = null;
let workdbGraphPointers = new Map();
let workdbGraphPinch = null;
let workdbGraphPreventClick = false;
let workdbGraphSuppressClickUntil = 0;
let workdbGraphLastSize = null;
let workdbGraphUserMoved = false;
let workdbGraphFrame = 0;
let workdbGraphLens = "map";
let workdbResizeObserver = null;

const WORKDB_GRAPH_MIN_ZOOM = 0.42;
const WORKDB_GRAPH_MAX_ZOOM = 6;
const WORKDB_GRAPH_FIT_PADDING = 48;
const KNOWLEDGE_CACHE_VERSION = "v0.12.5";
const KNOWLEDGE_CACHE_TTL_MS = 4 * 60 * 1000;
const WORKDB_GRAPH_LOD = [
  { maxNodes: 80, maxEdges: 140, minZoom: 0 },
  { maxNodes: 150, maxEdges: 260, minZoom: 0.72 },
  { maxNodes: 260, maxEdges: 480, minZoom: 1.05 },
  { maxNodes: 420, maxEdges: 740, minZoom: 1.45 },
  { maxNodes: Infinity, maxEdges: Infinity, minZoom: 2.05 }
];

const AGENT_SIGNAL_GROUPS = [
  { key: "instructions", label: "Instruction reuse", tags: ["agent", "codex", "claude", "memory", "session", "skill", "tasks", "tracker"] },
  { key: "automation", label: "Automation reuse", tags: ["automation", "telegram", "notifier", "schedule", "workflow"] },
  { key: "data", label: "Data/report reuse", tags: ["analytics", "dashboard", "data", "drive-zone", "pdmx", "proas", "reports"] },
  { key: "cloud", label: "Cloud/auth reuse", tags: ["account", "auth", "cloud-auth", "firebase", "gcloud", "github", "google", "oauth"] },
  { key: "product", label: "Product context reuse", tags: ["app", "budget", "digital", "ios", "piano", "product", "racers", "web"] }
];

const AGENT_EDGE_COLORS = {
  instructions: "rgba(107, 242, 220, 0.78)",
  automation: "rgba(244, 196, 109, 0.72)",
  data: "rgba(149, 184, 255, 0.72)",
  cloud: "rgba(215, 167, 255, 0.72)",
  product: "rgba(255, 158, 125, 0.68)",
  shared: "rgba(244, 241, 232, 0.42)"
};

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
  resetWorkdbGraphRuntime();
  authGate.hidden = false;
  knowledgeShell.hidden = true;
  signInButton.hidden = false;
  sessionState.hidden = true;
  sessionState.textContent = "";
  signOutButton.hidden = true;
}

function knowledgeCacheKey() {
  return `lkb-knowledge:${currentUser?.email || "anonymous"}:${KNOWLEDGE_CACHE_VERSION}`;
}

function readKnowledgeCache() {
  try {
    const raw = window.sessionStorage?.getItem(knowledgeCacheKey());
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached?.data || Date.now() - Number(cached.savedAt || 0) > KNOWLEDGE_CACHE_TTL_MS) return null;
    if (!Array.isArray(cached.data.workdb) || !cached.data.workdb.length) return null;
    if (!cached.data.workdb.some((item) => item.kind === "summary")) return null;
    return cached.data;
  } catch {
    return null;
  }
}

function writeKnowledgeCache(data) {
  try {
    window.sessionStorage?.setItem(knowledgeCacheKey(), JSON.stringify({
      savedAt: Date.now(),
      data
    }));
  } catch {
    // Session cache is an optimization only; Firestore remains the source of truth.
  }
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
  const liveMeta = vaultSnapshot.data();

  const workdbSummaryRef = doc(db, "vaults", "main", "workdbContext", "summary-workdb");
  const workdbSummarySnapshot = await getDoc(workdbSummaryRef);
  if (!workdbSummarySnapshot.exists()) {
    throw new Error("Firestore Work DB context is missing its summary document.");
  }

  const cached = readKnowledgeCache();
  if (cached) {
    return {
      ...cached,
      meta: liveMeta
    };
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

  const loaded = {
    meta: liveMeta,
    articles,
    workdb: workdbContext,
    sources,
    checks,
    outputs
  };
  writeKnowledgeCache(loaded);
  return loaded;
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

function publicGraphKey(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

function normalizedClusterId(value) {
  if (value === "apps-products") return "products-apps";
  return value || "";
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
  const byNodeKey = new Map();
  const usedRecords = new Set();
  for (const item of source) {
    if (!byKind.has(item.kind)) byKind.set(item.kind, []);
    byKind.get(item.kind).push(item);
    for (const key of workdbRecordGraphKeys(item)) {
      if (!byNodeKey.has(key)) byNodeKey.set(key, item);
    }
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
    if (node.k && byNodeKey.has(node.k)) {
      const keyedRecord = byNodeKey.get(node.k);
      usedRecords.add(keyedRecord);
      return keyedRecord;
    }
    const kind = kindForType[node.t];
    if (!kind) return null;
    const items = byKind.get(kind) || [];
    if (kind === "summary") {
      const summary = items[0] || null;
      if (summary) usedRecords.add(summary);
      return summary;
    }
    let index = cursor.get(kind) || 0;
    while (items[index] && usedRecords.has(items[index])) {
      index += 1;
    }
    cursor.set(kind, index + 1);
    const record = items[index] || null;
    if (record) usedRecords.add(record);
    return record;
  });
}

function workdbRecordGraphKeys(record) {
  const ids = [];
  if (record.kind === "summary") ids.push("memory:lens");
  if (record.kind === "cluster") {
    ids.push(`cluster:${record.clusterId}`);
    ids.push(`cluster:${normalizedClusterId(record.clusterId)}`);
  }
  if (record.kind === "project" && record.projectId) ids.push(`project:${record.projectId}`);
  if (record.kind === "tag" && record.tag) ids.push(`tag:${record.tag}`);
  if (record.kind === "external" && record.externalId) ids.push(`external:${record.externalId}`);
  return [...new Set(ids.filter(Boolean).map(publicGraphKey))];
}

function resetWorkdbGraphRuntime() {
  if (workdbGraphFrame) {
    window.cancelAnimationFrame?.(workdbGraphFrame);
    workdbGraphFrame = 0;
  }
  workdbSnapshotStarted = false;
  workdbSnapshotData = null;
  workdbNodeRecords = [];
  workdbGraphCache = null;
  workdbAgentEdges = [];
  workdbRenderPoints = [];
  selectedWorkdbNodeIndex = null;
  hoveredWorkdbNodeIndex = null;
  workdbGraphZoom = 1;
  workdbGraphPanX = 0;
  workdbGraphPanY = 0;
  workdbGraphHasFit = false;
  workdbGraphIsPanning = false;
  workdbGraphPointer = null;
  workdbGraphPointers.clear();
  workdbGraphPinch = null;
  workdbGraphPreventClick = false;
  workdbGraphSuppressClickUntil = 0;
  workdbGraphLastSize = null;
  workdbGraphUserMoved = false;
  workdbGraphLens = "map";
  workdbMap?.setAttribute("data-lens", "map");
  workdbGraphControls.forEach((control) => {
    const isMap = control.dataset.workdbGraphAction === "lens-map";
    const isAgent = control.dataset.workdbGraphAction === "lens-agent";
    if (isMap || isAgent) {
      control.classList.toggle("is-active", isMap);
      control.setAttribute("aria-pressed", String(isMap));
    }
    if (control.dataset.workdbGraphAction === "expand") {
      control.setAttribute("aria-pressed", "false");
      control.textContent = "Expand";
    }
  });
  workdbMap?.classList.remove("is-expanded");
  workdbSnapshot?.classList.remove("is-panning", "is-clickable");
  if (workdbMapInspector) {
    workdbMapInspector.hidden = true;
    workdbMapInspector.classList.remove("is-anchored");
    workdbMapInspector.removeAttribute("style");
  }
  if (workdbMapStats) workdbMapStats.textContent = "Loading map";
  document.documentElement.dataset.workdbGraphZoom = "";
  document.documentElement.dataset.workdbGraphLens = "";
  document.documentElement.dataset.workdbVisibleNodes = "";
  document.documentElement.dataset.workdbVisibleEdges = "";
  document.documentElement.dataset.workdbTotalNodes = "";
}

function clampWorkdbZoom(value) {
  return Math.max(WORKDB_GRAPH_MIN_ZOOM, Math.min(WORKDB_GRAPH_MAX_ZOOM, value));
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function workdbBaseScale(width, height) {
  return Math.min(width, height) * 0.82;
}

function workdbRotatedPoint(node, timestamp) {
  const angle = Math.sin(timestamp / 150000 * Math.PI * 2) * (Math.PI / 180 * 2.4);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: node.x * cos - node.y * sin,
    y: node.x * sin + node.y * cos
  };
}

function workdbPoint(node, width, height, timestamp) {
  const scale = workdbBaseScale(width, height);
  const point = workdbRotatedPoint(node, timestamp);
  return {
    x: width / 2 + workdbGraphPanX + point.x * scale * workdbGraphZoom,
    y: height / 2 + workdbGraphPanY + point.y * scale * workdbGraphZoom
  };
}

function workdbRadius(node) {
  return Math.max(1.3, node.r * (node.t === "cluster" ? 0.4 : 0.32) * Math.sqrt(workdbGraphZoom));
}

function workdbPointNearViewport(point, width, height, padding = 72) {
  return point.x >= -padding
    && point.x <= width + padding
    && point.y >= -padding
    && point.y <= height + padding;
}

function workdbNodeImportance(node, index) {
  const typeWeight = {
    memory: 120,
    cluster: 112,
    project: 84,
    external: 78,
    repo: 72,
    cloud: 68,
    firebase: 68,
    tag: 56,
    system: 46,
    session: 42,
    raw: 34
  }[node.t] || 30;
  return typeWeight + Number(node.r || 0) * 4 - index * 0.002;
}

function workdbNodeMinZoom(node) {
  if (node.t === "memory" || node.t === "cluster") return 0;
  if (node.t === "project" || node.t === "external" || node.t === "repo" || node.t === "cloud" || node.t === "firebase") {
    if (node.r >= 10) return 0.62;
    if (node.r >= 7) return 0.92;
    return 1.25;
  }
  if (node.t === "tag") {
    if (node.r >= 11) return 0.78;
    if (node.r >= 8) return 1.08;
    if (node.r >= 5) return 1.48;
    return 2.05;
  }
  if (node.r >= 7) return 1.15;
  if (node.r >= 4) return 1.62;
  return 2.3;
}

function workdbLodBudget() {
  return WORKDB_GRAPH_LOD
    .slice()
    .reverse()
    .find((level) => workdbGraphZoom >= level.minZoom) || WORKDB_GRAPH_LOD[0];
}

function prepareWorkdbGraphCache(snapshot) {
  const cachedNodes = (snapshot.nodes || []).map((node, index) => ({
    node,
    index,
    importance: workdbNodeImportance(node, index),
    minZoom: workdbNodeMinZoom(node)
  }));
  return {
    nodes: cachedNodes,
    rankedNodes: cachedNodes.slice().sort((left, right) => right.importance - left.importance),
    edges: (snapshot.edges || []).map((edge, index) => ({
      index,
      source: edge.s,
      target: edge.t
    }))
  };
}

function normalizedRecordTags(record) {
  const values = [
    ...(Array.isArray(record?.tags) ? record.tags : []),
    record?.clusterId,
    record?.clusterLabel,
    record?.kind,
    record?.externalId,
    record?.tag
  ].filter(Boolean);
  return [...new Set(values.map((value) => String(value).toLowerCase().replaceAll(/\s+/g, "-")))];
}

function recordWeight(record) {
  return Number(record?.fileCount || record?.recordCount || record?.projectCount || record?.count || 1);
}

function agentSignalForTags(tags) {
  const tagSet = new Set(tags);
  let best = { key: "shared", label: "Shared context", score: 0 };
  for (const group of AGENT_SIGNAL_GROUPS) {
    const score = group.tags.filter((tag) => tagSet.has(tag)).length;
    if (score > best.score) best = { key: group.key, label: group.label, score };
  }
  return best;
}

function scoreAgentRelation(left, right) {
  const leftTags = normalizedRecordTags(left.record);
  const rightTags = normalizedRecordTags(right.record);
  const rightTagSet = new Set(rightTags);
  const sharedTags = leftTags.filter((tag) => rightTagSet.has(tag));
  const sameCluster = Boolean(left.record?.clusterId && left.record.clusterId === right.record?.clusterId);
  if (!sharedTags.length && !sameCluster) return null;
  if (left.record?.kind === "tag" && right.record?.kind === "tag") return null;

  const signal = agentSignalForTags(sharedTags);
  let score = sharedTags.length * 14 + (sameCluster ? 16 : 0);
  score += Math.log10(Math.max(10, recordWeight(left.record))) * 4;
  score += Math.log10(Math.max(10, recordWeight(right.record))) * 4;
  if (left.record?.kind === "cluster" || right.record?.kind === "cluster") score += 8;
  if (left.record?.kind === "project" || right.record?.kind === "project") score += 5;
  if (signal.key === "instructions") score += 7;

  return {
    source: left.index,
    target: right.index,
    score,
    sharedTags: sharedTags.slice(0, 4),
    signalKey: signal.key,
    signalLabel: signal.label
  };
}

function buildWorkdbAgentEdges() {
  const records = workdbNodeRecords
    .map((record, index) => ({ record, index }))
    .filter((item) => item.record && item.record.kind !== "summary");
  const edges = [];
  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      const relation = scoreAgentRelation(records[leftIndex], records[rightIndex]);
      if (relation) edges.push(relation);
    }
  }
  return edges
    .sort((left, right) => right.score - left.score)
    .slice(0, 220);
}

function workdbGraphBounds(snapshot) {
  const nodes = snapshot.nodes || [];
  if (!nodes.length) return { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5 };
  return nodes.reduce((bounds, node) => {
    const pad = Math.max(0.018, Number(node.r || 1) / 900);
    return {
      minX: Math.min(bounds.minX, node.x - pad),
      maxX: Math.max(bounds.maxX, node.x + pad),
      minY: Math.min(bounds.minY, node.y - pad),
      maxY: Math.max(bounds.maxY, node.y + pad)
    };
  }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
}

function fitWorkdbGraph(width, height, snapshot, force = false) {
  if (!snapshot || (!force && workdbGraphHasFit)) return;
  const bounds = workdbGraphBounds(snapshot);
  const baseScale = workdbBaseScale(width, height);
  const boundsWidth = Math.max(0.01, bounds.maxX - bounds.minX);
  const boundsHeight = Math.max(0.01, bounds.maxY - bounds.minY);
  const availableWidth = Math.max(120, width - WORKDB_GRAPH_FIT_PADDING * 2);
  const availableHeight = Math.max(120, height - WORKDB_GRAPH_FIT_PADDING * 2);
  workdbGraphZoom = clampWorkdbZoom(Math.min(
    availableWidth / (boundsWidth * baseScale),
    availableHeight / (boundsHeight * baseScale),
    1.18
  ));
  workdbGraphPanX = -((bounds.minX + bounds.maxX) / 2) * baseScale * workdbGraphZoom;
  workdbGraphPanY = -((bounds.minY + bounds.maxY) / 2) * baseScale * workdbGraphZoom;
  workdbGraphHasFit = true;
  workdbGraphUserMoved = false;
  scheduleWorkdbGraphDraw();
}

function resetWorkdbGraph(width, height, snapshot) {
  workdbGraphZoom = 1;
  const bounds = workdbGraphBounds(snapshot);
  const baseScale = workdbBaseScale(width, height);
  workdbGraphPanX = -((bounds.minX + bounds.maxX) / 2) * baseScale;
  workdbGraphPanY = -((bounds.minY + bounds.maxY) / 2) * baseScale;
  workdbGraphHasFit = true;
  workdbGraphUserMoved = false;
  scheduleWorkdbGraphDraw();
}

function zoomWorkdbGraphAt(width, height, canvasX, canvasY, factor) {
  const previousZoom = workdbGraphZoom;
  const nextZoom = clampWorkdbZoom(previousZoom * factor);
  if (nextZoom === previousZoom) return;
  const anchorX = canvasX - width / 2 - workdbGraphPanX;
  const anchorY = canvasY - height / 2 - workdbGraphPanY;
  const ratio = nextZoom / previousZoom;
  workdbGraphPanX = canvasX - width / 2 - anchorX * ratio;
  workdbGraphPanY = canvasY - height / 2 - anchorY * ratio;
  workdbGraphZoom = nextZoom;
  workdbGraphUserMoved = true;
  scheduleWorkdbGraphDraw();
}

function visibleWorkdbRenderPoints(nodes, width, height, timestamp) {
  const budget = workdbLodBudget();
  const forced = new Set([selectedWorkdbNodeIndex, hoveredWorkdbNodeIndex].filter((index) => index !== null && index !== undefined));
  const cache = workdbGraphCache || prepareWorkdbGraphCache({ nodes, edges: [] });
  const ranked = cache.rankedNodes
    .filter((item) => {
      return forced.has(item.index)
        || workdbGraphZoom >= item.minZoom;
    })
    .slice(0, budget.maxNodes);
  const visible = new Set(ranked.map((item) => item.index));
  forced.forEach((index) => visible.add(index));

  return cache.nodes.map((item) => {
    const point = visible.has(item.index) ? workdbPoint(item.node, width, height, timestamp) : null;
    const isVisible = Boolean(point && (forced.has(item.index) || workdbPointNearViewport(point, width, height, 140)));
    return {
      index: item.index,
      node: item.node,
      visible: isVisible,
      importance: item.importance,
      point: isVisible ? point : null,
      radius: isVisible ? workdbRadius(item.node) : 0
    };
  });
}

function updateWorkdbGraphState(visibleNodeCount, visibleEdgeCount) {
  if (workdbMapStats) {
    if (workdbGraphLens === "agent") {
      workdbMapStats.textContent = `${visibleNodeCount} visible nodes · ${visibleEdgeCount} agent reuse routes`;
    } else {
      const counts = workdbSnapshotData?.counts || {};
      workdbMapStats.textContent = `${counts.nodes || workdbSnapshotData?.nodes?.length || 0} nodes · ${counts.edges || workdbSnapshotData?.edges?.length || 0} links`;
    }
  }
  document.documentElement.dataset.workdbGraphZoom = String(Number(workdbGraphZoom.toFixed(3)));
  document.documentElement.dataset.workdbGraphLens = workdbGraphLens;
  document.documentElement.dataset.workdbVisibleNodes = String(visibleNodeCount);
  document.documentElement.dataset.workdbVisibleEdges = String(visibleEdgeCount);
  document.documentElement.dataset.workdbTotalNodes = String(workdbSnapshotData?.nodes?.length || 0);
}

function drawWorkdbBaseEdges(ctx, budget, width, height) {
  const edges = workdbGraphCache?.edges || [];
  const maxEdges = workdbGraphLens === "agent" ? Math.min(100, budget.maxEdges) : budget.maxEdges;
  let visibleEdgeCount = 0;
  ctx.lineWidth = workdbGraphLens === "agent" ? 0.7 : 1;
  for (const edge of edges) {
    const source = workdbRenderPoints[edge.source];
    const target = workdbRenderPoints[edge.target];
    if (!source?.visible || !target?.visible) continue;
    if (!workdbPointNearViewport(source.point, width, height) || !workdbPointNearViewport(target.point, width, height)) continue;
    if (visibleEdgeCount >= maxEdges) continue;
    const edgeStrength = Math.min(source.importance, target.importance);
    if (workdbGraphZoom < 0.78 && edgeStrength < 86) continue;
    if (workdbGraphZoom < 1.08 && edgeStrength < 70) continue;
    visibleEdgeCount += 1;
    ctx.strokeStyle = workdbGraphLens === "agent"
      ? "rgba(236, 240, 234, 0.045)"
      : workdbGraphZoom < 0.78 ? "rgba(236, 240, 234, 0.12)" : "rgba(236, 240, 234, 0.082)";
    ctx.beginPath();
    ctx.moveTo(source.point.x, source.point.y);
    ctx.lineTo(target.point.x, target.point.y);
    ctx.stroke();
  }
  return visibleEdgeCount;
}

function drawWorkdbAgentEdges(ctx, width, height) {
  if (workdbGraphLens !== "agent") return 0;
  const maxEdges = workdbGraphZoom < 0.9 ? 28 : workdbGraphZoom < 1.45 ? 62 : 120;
  let visibleEdgeCount = 0;
  for (const edge of workdbAgentEdges) {
    const source = workdbRenderPoints[edge.source];
    const target = workdbRenderPoints[edge.target];
    if (!source?.visible || !target?.visible) continue;
    if (!workdbPointNearViewport(source.point, width, height) || !workdbPointNearViewport(target.point, width, height)) continue;
    if (visibleEdgeCount >= maxEdges) break;
    visibleEdgeCount += 1;
    const dx = target.point.x - source.point.x;
    const dy = target.point.y - source.point.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const bend = Math.min(46, Math.max(12, distance * 0.08));
    const normalX = -dy / distance;
    const normalY = dx / distance;
    const centerX = (source.point.x + target.point.x) / 2 + normalX * bend;
    const centerY = (source.point.y + target.point.y) / 2 + normalY * bend;
    ctx.globalAlpha = workdbGraphZoom < 0.9 ? 0.64 : 0.8;
    ctx.lineWidth = Math.max(1, Math.min(2.4, edge.score / 42));
    ctx.strokeStyle = AGENT_EDGE_COLORS[edge.signalKey] || AGENT_EDGE_COLORS.shared;
    ctx.beginPath();
    ctx.moveTo(source.point.x, source.point.y);
    ctx.quadraticCurveTo(centerX, centerY, target.point.x, target.point.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return visibleEdgeCount;
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
  if (!workdbGraphHasFit || !workdbGraphLastSize || Math.abs(workdbGraphLastSize.width - width) > 6 || Math.abs(workdbGraphLastSize.height - height) > 6) {
    if (!workdbGraphUserMoved) {
      fitWorkdbGraph(width, height, snapshot, true);
    }
    workdbGraphLastSize = { width, height };
  }

  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const nodes = snapshot.nodes || [];
  workdbRenderPoints = visibleWorkdbRenderPoints(nodes, width, height, timestamp);
  const visibleCount = workdbRenderPoints.filter((item) => item.visible).length;
  const budget = workdbLodBudget();
  const baseEdgeCount = drawWorkdbBaseEdges(ctx, budget, width, height);
  const agentEdgeCount = drawWorkdbAgentEdges(ctx, width, height);
  const visibleEdgeCount = workdbGraphLens === "agent" ? agentEdgeCount : baseEdgeCount;

  for (const item of workdbRenderPoints) {
    if (!item.visible) continue;
    const { index, node, point, radius } = item;
    const isActive = index === selectedWorkdbNodeIndex;
    const isHovered = index === hoveredWorkdbNodeIndex;
    ctx.globalAlpha = isActive ? 0.98 : isHovered ? 0.86 : node.t === "cluster" || node.t === "memory" ? 0.86 : workdbGraphLens === "agent" ? 0.72 : 0.62;
    ctx.fillStyle = node.c || "#d7d7d2";
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius + (isActive ? 1.6 : isHovered ? 1 : 0), 0, Math.PI * 2);
    ctx.fill();
  }

  for (const item of workdbRenderPoints) {
    if (!item.visible || (item.index !== selectedWorkdbNodeIndex && item.index !== hoveredWorkdbNodeIndex)) continue;
    ctx.globalAlpha = item.index === selectedWorkdbNodeIndex ? 0.9 : 0.55;
    ctx.strokeStyle = item.index === selectedWorkdbNodeIndex ? "rgba(107, 242, 220, 0.95)" : "rgba(244, 241, 232, 0.76)";
    ctx.lineWidth = item.index === selectedWorkdbNodeIndex ? 2 : 1.4;
    ctx.beginPath();
    ctx.arc(item.point.x, item.point.y, item.radius + 7, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  updateWorkdbGraphState(visibleCount, visibleEdgeCount);
  positionWorkdbMapInspector(selectedWorkdbNodeIndex);
}

function findWorkdbNodeAt(clientX, clientY) {
  if (!workdbSnapshot || !workdbRenderPoints.length) return null;
  const rect = workdbSnapshot.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  let best = null;
  for (const item of workdbRenderPoints) {
    if (!item.visible || !item.point) continue;
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

function workdbAgentRelationsForIndex(index, limit = 3) {
  return workdbAgentEdges
    .filter((edge) => edge.source === index || edge.target === index)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function reusablePriority(record) {
  const kind = record?.kind || "";
  if (kind === "cluster") return 5;
  if (kind === "external") return 4;
  if (kind === "tag") return 3;
  if (kind === "summary") return 2;
  if (kind === "project") return 1;
  return 0;
}

function agentRelationDirection(edge) {
  const sourceRecord = workdbNodeRecords[edge.source];
  const targetRecord = workdbNodeRecords[edge.target];
  const sourcePriority = reusablePriority(sourceRecord);
  const targetPriority = reusablePriority(targetRecord);
  if (sourcePriority > targetPriority) return { fromIndex: edge.source, toIndex: edge.target };
  if (targetPriority > sourcePriority) return { fromIndex: edge.target, toIndex: edge.source };
  if (recordWeight(sourceRecord) >= recordWeight(targetRecord)) return { fromIndex: edge.source, toIndex: edge.target };
  return { fromIndex: edge.target, toIndex: edge.source };
}

function agentHintForRecord(record) {
  const tags = normalizedRecordTags(record);
  const tagSet = new Set(tags);
  if (["skill", "memory", "session", "codex", "claude", "tracker"].some((tag) => tagSet.has(tag))) {
    return "Best reuse: start with this memory/instruction context before opening task-specific files.";
  }
  if (["automation", "telegram", "notifier", "workflow"].some((tag) => tagSet.has(tag))) {
    return "Best reuse: compare automation flow, notification contract, and task state before rebuilding scripts.";
  }
  if (["data", "dashboard", "analytics", "reports"].some((tag) => tagSet.has(tag))) {
    return "Best reuse: lift the analysis/reporting pattern and verify source freshness before touching raw exports.";
  }
  if (["github", "google", "gcloud", "firebase", "cloud-auth", "account"].some((tag) => tagSet.has(tag))) {
    return "Best reuse: reuse the account, auth, deploy, and validation context before changing cloud setup.";
  }
  return "Best reuse: use this as a routing node, then open the local Work DB context only when exact files are needed.";
}

function agentInspectorText(index, record) {
  if (!record) return "Private graph point. Agent lens keeps names and file content out of this browser asset.";
  if (workdbGraphLens !== "agent") return getItemSummary(record);

  const relation = workdbAgentRelationsForIndex(index, 1)[0];
  if (!relation) return agentHintForRecord(record);
  const direction = agentRelationDirection(relation);
  const peerIndex = direction.fromIndex === index ? direction.toIndex : direction.fromIndex;
  const peerRecord = workdbNodeRecords[peerIndex];
  const peerTitle = peerRecord ? getItemTitle(peerRecord) : "nearby context";
  const via = relation.sharedTags.length ? ` via ${relation.sharedTags.join(", ")}` : "";
  const verb = direction.fromIndex === index ? "Reuse into" : "Reuse from";
  return `${relation.signalLabel}: ${verb} ${peerTitle}${via}.`;
}

function positionWorkdbMapInspector(index) {
  if (!workdbMapInspector || workdbMapInspector.hidden || index === null || index === undefined) return;
  const stage = workdbSnapshot?.parentElement;
  const item = workdbRenderPoints.find((point) => point.index === index && point.visible && point.point);
  if (!stage || !item) {
    workdbMapInspector.classList.remove("is-anchored");
    return;
  }

  const inset = 12;
  const stageWidth = stage.clientWidth;
  const stageHeight = stage.clientHeight;
  const inspectorWidth = Math.min(workdbMapInspector.offsetWidth || 280, Math.max(180, stageWidth - inset * 2));
  const inspectorHeight = Math.min(workdbMapInspector.offsetHeight || 120, Math.max(90, stageHeight - inset * 2));
  let left = item.point.x + 16;
  if (left + inspectorWidth > stageWidth - inset) left = item.point.x - inspectorWidth - 16;
  if (left < inset) {
    left = clampNumber(item.point.x - inspectorWidth / 2, inset, Math.max(inset, stageWidth - inspectorWidth - inset));
  }
  let top = item.point.y - inspectorHeight - 14;
  if (top < inset) top = item.point.y + 14;
  top = clampNumber(top, inset, Math.max(inset, stageHeight - inspectorHeight - inset));

  workdbMapInspector.style.left = `${Math.round(left)}px`;
  workdbMapInspector.style.top = `${Math.round(top)}px`;
  workdbMapInspector.style.right = "auto";
  workdbMapInspector.style.bottom = "auto";
  workdbMapInspector.classList.add("is-anchored");
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
    ? agentInspectorText(index, record)
    : "This point exists in the private graph snapshot. The public graph keeps raw names out of the browser asset.";
  workdbMapInspectorAction.hidden = !actionRecord;
  workdbMapInspectorAction.textContent = record ? "Open record" : "Open summary";
  workdbMapInspectorAction.dataset.recordId = actionRecord?.id || "";
  positionWorkdbMapInspector(index);
  scheduleWorkdbGraphDraw();
}

function hideWorkdbMapInspector() {
  if (!workdbMapInspector) return;
  workdbMapInspector.hidden = true;
  workdbMapInspector.classList.remove("is-anchored");
  workdbMapInspector.removeAttribute("style");
  if (workdbMapInspectorAction) {
    workdbMapInspectorAction.dataset.recordId = "";
  }
  scheduleWorkdbGraphDraw();
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
  scheduleWorkdbGraphDraw();
}

function selectWorkdbNode(index) {
  if (index === null || index === undefined) {
    selectedWorkdbNodeIndex = null;
    hideWorkdbMapInspector();
    return;
  }
  selectedWorkdbNodeIndex = index;
  renderWorkdbMapInspector(index);
  const record = workdbNodeRecords[index];
  if (record) {
    openWorkdbRecord(record.id);
  }
  scheduleWorkdbGraphDraw();
}

function moveWorkdbNodeSelection(step) {
  const visibleMappedIndexes = workdbRenderPoints
    .filter((point) => point.visible && workdbNodeRecords[point.index])
    .map((point) => point.index);
  const mappedIndexes = (visibleMappedIndexes.length ? visibleMappedIndexes : workdbNodeRecords
    .map((record, index) => record ? index : null))
    .filter((index) => index !== null);
  if (!mappedIndexes.length) return;

  const current = mappedIndexes.indexOf(selectedWorkdbNodeIndex);
  const nextPosition = current >= 0
    ? (current + step + mappedIndexes.length) % mappedIndexes.length
    : step > 0 ? 0 : mappedIndexes.length - 1;
  selectWorkdbNode(mappedIndexes[nextPosition]);
}

function workdbCanvasLocalPoint(clientX, clientY) {
  const rect = workdbSnapshot.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
    width: rect.width,
    height: rect.height
  };
}

function workdbPointerList() {
  return [...workdbGraphPointers.values()];
}

function workdbPointerCenter(points) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
}

function workdbPointerDistance(points) {
  if (points.length < 2) return 1;
  return Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
}

function startWorkdbPinch() {
  const points = workdbPointerList();
  if (points.length < 2 || !workdbSnapshot) return;
  const centerClient = workdbPointerCenter(points);
  const local = workdbCanvasLocalPoint(centerClient.x, centerClient.y);
  workdbGraphPinch = {
    distance: workdbPointerDistance(points),
    centerX: local.x,
    centerY: local.y,
    zoom: workdbGraphZoom,
    panX: workdbGraphPanX,
    panY: workdbGraphPanY,
    width: local.width,
    height: local.height
  };
}

function updateWorkdbPinch() {
  if (!workdbGraphPinch || !workdbSnapshot) return;
  const points = workdbPointerList();
  if (points.length < 2) return;
  const centerClient = workdbPointerCenter(points);
  const local = workdbCanvasLocalPoint(centerClient.x, centerClient.y);
  const nextZoom = clampWorkdbZoom(workdbGraphPinch.zoom * (workdbPointerDistance(points) / workdbGraphPinch.distance));
  const ratio = nextZoom / workdbGraphPinch.zoom;
  const anchorX = workdbGraphPinch.centerX - workdbGraphPinch.width / 2 - workdbGraphPinch.panX;
  const anchorY = workdbGraphPinch.centerY - workdbGraphPinch.height / 2 - workdbGraphPinch.panY;
  workdbGraphPanX = local.x - local.width / 2 - anchorX * ratio;
  workdbGraphPanY = local.y - local.height / 2 - anchorY * ratio;
  workdbGraphZoom = nextZoom;
  workdbGraphUserMoved = true;
  workdbGraphPreventClick = true;
  workdbGraphSuppressClickUntil = Date.now() + 450;
  positionWorkdbMapInspector(selectedWorkdbNodeIndex);
  scheduleWorkdbGraphDraw();
}

function bindWorkdbMapEvents() {
  if (!workdbSnapshot || workdbSnapshot.dataset.bound === "true") return;
  workdbSnapshot.dataset.bound = "true";

  workdbSnapshot.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    workdbGraphPointers.set(event.pointerId, {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY
    });
    if (workdbGraphPointers.size >= 2) {
      workdbGraphIsPanning = false;
      workdbGraphPointer = null;
      startWorkdbPinch();
    } else {
      workdbGraphIsPanning = true;
      workdbGraphPreventClick = false;
      workdbGraphPointer = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY
      };
    }
    try {
      workdbSnapshot.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointer events in QA do not always register as capturable browser pointers.
    }
    workdbSnapshot.classList.add("is-panning");
  });

  workdbSnapshot.addEventListener("pointermove", (event) => {
    if (workdbGraphPointers.has(event.pointerId)) {
      workdbGraphPointers.set(event.pointerId, {
        id: event.pointerId,
        startX: workdbGraphPointers.get(event.pointerId).startX,
        startY: workdbGraphPointers.get(event.pointerId).startY,
        x: event.clientX,
        y: event.clientY
      });
    }
    if (workdbGraphPointers.size >= 2) {
      updateWorkdbPinch();
      event.preventDefault();
      return;
    }
    if (workdbGraphIsPanning && workdbGraphPointer?.id === event.pointerId) {
      const dx = event.clientX - workdbGraphPointer.x;
      const dy = event.clientY - workdbGraphPointer.y;
      const totalDx = event.clientX - workdbGraphPointer.startX;
      const totalDy = event.clientY - workdbGraphPointer.startY;
      if (Math.hypot(totalDx, totalDy) > 1.5) {
        workdbGraphPreventClick = true;
        workdbGraphSuppressClickUntil = Date.now() + 350;
        workdbGraphUserMoved = true;
      }
      workdbGraphPanX += dx;
      workdbGraphPanY += dy;
      workdbGraphPointer.x = event.clientX;
      workdbGraphPointer.y = event.clientY;
      positionWorkdbMapInspector(selectedWorkdbNodeIndex);
      scheduleWorkdbGraphDraw();
      event.preventDefault();
      return;
    }
    const index = findWorkdbNodeAt(event.clientX, event.clientY);
    if (hoveredWorkdbNodeIndex !== index) {
      hoveredWorkdbNodeIndex = index;
      scheduleWorkdbGraphDraw();
    }
    workdbSnapshot.classList.toggle("is-clickable", index !== null);
  });

  function finishPointer(event) {
    workdbGraphPointers.delete(event.pointerId);
    if (workdbGraphPointer?.id === event.pointerId) {
      workdbGraphIsPanning = false;
      workdbGraphPointer = null;
    }
    if (workdbGraphPointers.size >= 2) {
      startWorkdbPinch();
    } else {
      workdbGraphPinch = null;
      const remaining = workdbPointerList()[0];
      if (remaining) {
        workdbGraphPointer = {
          id: remaining.id,
          startX: remaining.x,
          startY: remaining.y,
          x: remaining.x,
          y: remaining.y
        };
        workdbGraphIsPanning = true;
      } else {
        workdbGraphIsPanning = false;
        workdbSnapshot.classList.remove("is-panning");
      }
    }
    try {
      workdbSnapshot.releasePointerCapture?.(event.pointerId);
    } catch {
      // Matching guard for synthetic pointer events used by visual QA.
    }
  }

  workdbSnapshot.addEventListener("pointerup", finishPointer);
  workdbSnapshot.addEventListener("pointercancel", finishPointer);

  workdbSnapshot.addEventListener("mouseleave", () => {
    hoveredWorkdbNodeIndex = null;
    workdbSnapshot.classList.remove("is-clickable");
    scheduleWorkdbGraphDraw();
  });

  workdbSnapshot.addEventListener("click", (event) => {
    if (workdbGraphPreventClick || Date.now() < workdbGraphSuppressClickUntil) {
      workdbGraphPreventClick = false;
      return;
    }
    selectWorkdbNode(findWorkdbNodeAt(event.clientX, event.clientY));
  });

  workdbSnapshot.addEventListener("dblclick", (event) => {
    const rect = workdbSnapshot.getBoundingClientRect();
    zoomWorkdbGraphAt(rect.width, rect.height, event.clientX - rect.left, event.clientY - rect.top, 1.55);
    event.preventDefault();
  });

  workdbSnapshot.addEventListener("wheel", (event) => {
    const rect = workdbSnapshot.getBoundingClientRect();
    const factor = event.deltaY > 0 ? 0.86 : 1.16;
    zoomWorkdbGraphAt(rect.width, rect.height, event.clientX - rect.left, event.clientY - rect.top, factor);
    event.preventDefault();
  }, { passive: false });

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
      return;
    }
    if (event.key === "+" || event.key === "=" || event.key === "-") {
      const rect = workdbSnapshot.getBoundingClientRect();
      zoomWorkdbGraphAt(rect.width, rect.height, rect.width / 2, rect.height / 2, event.key === "-" ? 0.86 : 1.16);
      event.preventDefault();
      return;
    }
    if (event.key === "0") {
      const rect = workdbSnapshot.getBoundingClientRect();
      resetWorkdbGraph(rect.width, rect.height, workdbSnapshotData);
      event.preventDefault();
      return;
    }
    if (event.key.toLowerCase() === "f") {
      const rect = workdbSnapshot.getBoundingClientRect();
      fitWorkdbGraph(rect.width, rect.height, workdbSnapshotData, true);
      event.preventDefault();
    }
  });
}

function bindWorkdbGraphControls() {
  workdbGraphControls.forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      if (!workdbSnapshot || !workdbSnapshotData) return;
      const rect = workdbSnapshot.getBoundingClientRect();
      const action = button.dataset.workdbGraphAction;
      if (action === "lens-map" || action === "lens-agent") {
        workdbGraphLens = action === "lens-agent" ? "agent" : "map";
        workdbMap?.setAttribute("data-lens", workdbGraphLens);
        workdbGraphControls.forEach((control) => {
          const active = control.dataset.workdbGraphAction === `lens-${workdbGraphLens}`;
          if (control.dataset.workdbGraphAction?.startsWith("lens-")) {
            control.classList.toggle("is-active", active);
            control.setAttribute("aria-pressed", String(active));
          }
        });
        if (action === "lens-map") {
          fitWorkdbGraph(rect.width, rect.height, workdbSnapshotData, true);
        }
        if (selectedWorkdbNodeIndex !== null) renderWorkdbMapInspector(selectedWorkdbNodeIndex);
        scheduleWorkdbGraphDraw();
      }
      if (action === "expand" && workdbMap) {
        const expanded = !workdbMap.classList.contains("is-expanded");
        workdbMap.classList.toggle("is-expanded", expanded);
        button.setAttribute("aria-pressed", String(expanded));
        button.textContent = expanded ? "Dock" : "Expand";
        workdbGraphLastSize = null;
        if (!workdbGraphUserMoved) fitWorkdbGraph(rect.width, rect.height, workdbSnapshotData, true);
        scheduleWorkdbGraphDraw();
      }
    });
  });
}

function scheduleWorkdbGraphDraw() {
  if (!workdbSnapshot || !workdbSnapshotData || workdbGraphFrame) return;
  workdbGraphFrame = window.requestAnimationFrame(() => {
    workdbGraphFrame = 0;
    if (!workdbMap?.hidden) {
      drawWorkdbSnapshot(workdbSnapshot, workdbSnapshotData, 0);
    }
  });
}

async function startWorkdbSnapshot() {
  if (!workdbSnapshot || workdbSnapshotStarted) return;
  workdbSnapshotStarted = true;
  workdbSnapshotData = await loadWorkdbSnapshot();
  workdbNodeRecords = buildWorkdbNodeRecords(workdbSnapshotData);
  workdbGraphCache = prepareWorkdbGraphCache(workdbSnapshotData);
  workdbAgentEdges = buildWorkdbAgentEdges();
  syncWorkdbMapSelection(activeItemId);
  if (selectedWorkdbNodeIndex !== null) {
    renderWorkdbMapInspector(selectedWorkdbNodeIndex);
  }
  bindWorkdbMapEvents();
  bindWorkdbGraphControls();
  if (!workdbResizeObserver) {
    if (window.ResizeObserver) {
      workdbResizeObserver = new ResizeObserver(() => {
        workdbGraphLastSize = null;
        scheduleWorkdbGraphDraw();
      });
      workdbResizeObserver.observe(workdbSnapshot);
    } else {
      window.addEventListener("resize", () => {
        workdbGraphLastSize = null;
        scheduleWorkdbGraphDraw();
      });
      workdbResizeObserver = { observe() {} };
    }
  }
  scheduleWorkdbGraphDraw();
  if (activeView === "workdb") {
    renderList();
  }
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

function renderAgentReuseSection(item) {
  if (!item || !workdbAgentEdges.length) return "";
  const itemIndex = workdbNodeRecords.findIndex((record) => record?.id === item.id);
  if (itemIndex < 0) return "";
  const relations = workdbAgentRelationsForIndex(itemIndex, 4);
  if (!relations.length) return "";
  return `
    <section class="detail-section">
      <h3>Agent lens</h3>
      <ul class="agent-reuse-list">
        ${relations.map((relation) => {
          const direction = agentRelationDirection(relation);
          const fromRecord = workdbNodeRecords[direction.fromIndex];
          const toRecord = workdbNodeRecords[direction.toIndex];
          const fromTitle = fromRecord ? getItemTitle(fromRecord) : "Reusable context";
          const toTitle = toRecord ? getItemTitle(toRecord) : "Target context";
          const via = relation.sharedTags.length ? `via ${relation.sharedTags.join(", ")}` : "via shared cluster";
          return `
            <li>
              <span>${escapeHtml(relation.signalLabel)}</span>
              <strong>${escapeHtml(fromTitle)} -> ${escapeHtml(toTitle)}</strong>
              <small>${escapeHtml(via)}</small>
            </li>
          `;
        }).join("")}
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
      ${renderAgentReuseSection(item)}
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
  if (activeView === "workdb") scheduleWorkdbGraphDraw();
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
  try {
    window.sessionStorage?.removeItem(knowledgeCacheKey());
  } catch {
    // Ignore cache cleanup failures during sign-out.
  }
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
