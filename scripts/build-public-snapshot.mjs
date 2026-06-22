#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const graphPath = join(root, "outputs", "global-work-kb", "tag-cloud.html");
const assetPath = join(root, "assets", "tag-cloud-snapshot.json");

function hashNumber(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
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

function radiusFor(node) {
  const weight = Math.max(1, Number(node.weight || 1));
  if (node.type === "memory") return 15;
  if (node.type === "cluster") return Math.min(24, 11 + Math.log10(weight + 1) * 3);
  if (node.type === "tag") return Math.min(13, 4 + Math.log10(weight + 1) * 2.8);
  if (node.type === "project") return Math.min(10, 3.8 + Math.log10(weight + 1) * 2.2);
  if (node.type === "raw" || node.type === "session") return 2.4;
  return 6;
}

if (!existsSync(graphPath)) {
  console.log("No private workdb graph found; keeping existing public snapshot.");
  process.exit(0);
}

const html = readFileSync(graphPath, "utf8");
const match = html.match(/const graph = ([\s\S]*?);\nconst canvas/);
if (!match) throw new Error("Could not extract graph JSON from generated tag-cloud.html.");

const graph = JSON.parse(match[1]);
const clusters = graph.clusters || [];
const satelliteCount = Math.max(1, clusters.length - 1);
const clusterCenters = new Map();

clusters.forEach((cluster, index) => {
  if (index === 0) {
    clusterCenters.set(cluster.id, { x: -0.16, y: 0.04 });
    return;
  }
  const angle = -Math.PI / 2 + (index - 1) * (Math.PI * 2 / satelliteCount);
  const radius = 0.47 + (index % 2) * 0.06;
  clusterCenters.set(cluster.id, { x: Math.cos(angle) * radius + 0.03, y: Math.sin(angle) * radius });
});

const snapshotNodes = graph.nodes.map((node, index) => {
  const center = clusterCenters.get(node.cluster) || clusterCenters.get("other-work") || { x: 0, y: 0 };
  const angle = hashNumber(node.id + ":angle") * Math.PI * 2;
  const spreadByType = node.type === "tag" ? 0.085 : node.type === "project" ? 0.15 : node.type === "raw" ? 0.2 : node.type === "session" ? 0.23 : 0.16;
  const spread = spreadByType * (0.45 + hashNumber(node.id + ":radius") * 0.85);
  const isCluster = node.type === "cluster";
  const isMemory = node.type === "memory";
  return {
    i: index,
    k: publicGraphKey(node.id),
    t: node.type,
    c: node.color || clusters.find((cluster) => cluster.id === node.cluster)?.color || "#cfcfc9",
    x: Number((isCluster ? center.x : isMemory ? center.x - 0.015 : center.x + Math.cos(angle) * spread).toFixed(4)),
    y: Number((isCluster ? center.y : isMemory ? center.y + 0.005 : center.y + Math.sin(angle) * spread).toFixed(4)),
    r: Number(radiusFor(node).toFixed(2))
  };
});

const nodeIndexById = new Map(graph.nodes.map((node, index) => [node.id, index]));
const snapshotEdges = (graph.edges || [])
  .map((edge) => ({ s: nodeIndexById.get(edge.source), t: nodeIndexById.get(edge.target) }))
  .filter((edge) => Number.isFinite(edge.s) && Number.isFinite(edge.t))
  .slice(0, 900);

const snapshot = {
  generatedAt: new Date().toISOString(),
  counts: {
    nodes: snapshotNodes.length,
    edges: snapshotEdges.length,
    files: graph.counts?.totalFiles || 0,
    clusters: clusters.length
  },
  nodes: snapshotNodes,
  edges: snapshotEdges
};

mkdirSync(dirname(assetPath), { recursive: true });
writeFileSync(assetPath, JSON.stringify(snapshot), "utf8");
console.log(`Wrote assets/tag-cloud-snapshot.json with ${snapshotNodes.length} nodes and ${snapshotEdges.length} edges.`);
