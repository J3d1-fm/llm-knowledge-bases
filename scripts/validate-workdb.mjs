import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputRoot = join(root, "outputs", "global-work-kb");
const graphPath = join(outputRoot, "tag-cloud.html");
const failures = [];

if (!existsSync(join(outputRoot, "db.json"))) {
  failures.push("Missing workdb output db.json. Run: npm run workdb -- build");
}

if (!existsSync(graphPath)) {
  failures.push("Missing workdb graph output tag-cloud.html. Run: npm run workdb -- build");
}

if (!failures.length) {
  const html = readFileSync(graphPath, "utf8");
  const graphMatch = html.match(/const graph = ([\s\S]*?);\nconst canvas/);
  if (!graphMatch) failures.push("Generated graph HTML does not expose embedded graph JSON.");
  else {
    const graph = JSON.parse(graphMatch[1]);
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    const missingEdges = graph.edges.filter((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target));
    const clusterNodes = graph.nodes.filter((node) => node.type === "cluster");
    const tagNodes = graph.nodes.filter((node) => node.type === "tag");
    const nodesWithoutCluster = graph.nodes.filter((node) => node.type !== "cluster" && !node.cluster);

    if (!Array.isArray(graph.clusters) || graph.clusters.length < 3) failures.push("Graph has fewer than 3 theme clusters.");
    if (clusterNodes.length !== graph.clusters.length) failures.push("Graph cluster node count does not match graph.clusters.");
    if (tagNodes.length < 10) failures.push("Graph has fewer than 10 tag nodes.");
    if (missingEdges.length) failures.push(`Graph has ${missingEdges.length} edges with missing endpoints.`);
    if (nodesWithoutCluster.length) failures.push(`Graph has ${nodesWithoutCluster.length} non-cluster nodes without cluster membership.`);
    if (!Number.isFinite(graph.counts?.totalFiles) || graph.counts.totalFiles < graph.nodes.length) {
      failures.push("Graph counts do not expose the full indexed file total.");
    }
  }

  const requiredSnippets = [
    ["function magnifiedPosition"],
    ["function runAnalysisFromGraph"],
    ["data-action=\"run-analysis\"", "data-action=\\\"run-analysis\\\"", "[data-action='run-analysis']"],
    ["analysis-result"],
    ["id=\"inspector\" hidden"],
    ["id=\"clusterRail\""],
    ["function scheduleDraw"],
    ["const MIN_ZOOM = 0.08"],
    ["data-graph-zoom", "graphZoom"],
    ["window.__workGraphDebug"],
    ["Fit all"],
    ["analyze-cluster"],
    ["analyze-tag"]
  ];
  for (const alternatives of requiredSnippets) {
    if (!alternatives.some((snippet) => html.includes(snippet))) {
      failures.push(`Generated graph is missing required snippet: ${alternatives[0]}`);
    }
  }
  if (html.includes("class=\"panel details\"")) {
    failures.push("Generated graph still contains the legacy always-visible details panel.");
  }
  if (html.includes("Math.max(0.44") || html.includes("Math.max(0.62")) {
    failures.push("Generated graph still contains the old zoom floor that prevents a full zoom-out.");
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Workdb graph validation passed.");
