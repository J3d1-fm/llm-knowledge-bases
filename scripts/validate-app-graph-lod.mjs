import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const snapshot = JSON.parse(readFileSync(join(root, "assets", "tag-cloud-snapshot.json"), "utf8"));
const nodes = snapshot.nodes || [];
const edges = snapshot.edges || [];
const failures = [];

const lod = [
  { maxNodes: 80, maxEdges: 140, minZoom: 0 },
  { maxNodes: 150, maxEdges: 260, minZoom: 0.72 },
  { maxNodes: 260, maxEdges: 480, minZoom: 1.05 },
  { maxNodes: 420, maxEdges: 740, minZoom: 1.45 },
  { maxNodes: Infinity, maxEdges: Infinity, minZoom: 2.05 }
];

function nodeImportance(node, index) {
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

function nodeMinZoom(node) {
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

function lodBudget(zoom) {
  return lod.slice().reverse().find((level) => zoom >= level.minZoom) || lod[0];
}

function visibleGraph(zoom) {
  const budget = lodBudget(zoom);
  const ranked = nodes
    .map((node, index) => ({ node, index, importance: nodeImportance(node, index) }))
    .filter((item) => zoom >= nodeMinZoom(item.node))
    .sort((left, right) => right.importance - left.importance)
    .slice(0, budget.maxNodes);
  const visible = new Set(ranked.map((item) => item.index));
  const rankedByIndex = new Map(ranked.map((item) => [item.index, item]));
  let visibleEdges = 0;
  for (const edge of edges) {
    if (!visible.has(edge.s) || !visible.has(edge.t)) continue;
    if (visibleEdges >= budget.maxEdges) continue;
    const source = rankedByIndex.get(edge.s);
    const target = rankedByIndex.get(edge.t);
    const edgeStrength = Math.min(source?.importance || 0, target?.importance || 0);
    if (zoom < 0.78 && edgeStrength < 86) continue;
    if (zoom < 1.08 && edgeStrength < 70) continue;
    visibleEdges += 1;
  }
  return { nodes: visible.size, edges: visibleEdges, totalNodes: nodes.length, totalEdges: edges.length };
}

const far = visibleGraph(0.7);
const mid = visibleGraph(1.16);
const near = visibleGraph(6);

if (!nodes.length || !edges.length) {
  failures.push("Graph snapshot must contain nodes and edges.");
}

if (!(far.nodes > 0 && far.nodes < far.totalNodes)) {
  failures.push(`Far zoom must render a non-empty subset, got ${far.nodes}/${far.totalNodes}.`);
}

if (!(mid.nodes > far.nodes && mid.edges > far.edges)) {
  failures.push(`Zooming in must reveal more graph detail, got far ${far.nodes}/${far.edges} and mid ${mid.nodes}/${mid.edges}.`);
}

if (!(near.nodes === near.totalNodes)) {
  failures.push(`Near zoom must allow the full graph, got ${near.nodes}/${near.totalNodes}.`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Graph LOD validation passed: far ${far.nodes}/${far.totalNodes} nodes, mid ${mid.nodes}, near ${near.nodes}.`);
