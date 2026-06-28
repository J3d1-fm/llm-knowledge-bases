#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRemoteWorkdbContext } from "./remote-workdb-context.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const graphSnapshotPath = join(root, "assets", "tag-cloud-snapshot.json");
const projectId = process.env.FIREBASE_PROJECT_ID || "llm-knowledge-bases";
const databaseId = "(default)";
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
const forbiddenFieldNames = new Set(["path", "relativePath", "snippet", "remote", "content"]);
const forbiddenStringParts = ["/Users/", "file://", "AIza", "BEGIN PRIVATE KEY"];
const commandNames = new Set(["context", "search", "summary", "status", "list", "diff", "checks", "help"]);
const managedCollections = ["workdbContext", "articles", "sources", "checks", "outputs"];
const valueFlagNames = new Set(["limit", "kind"]);

function parseFlags(rawArgs) {
  const flags = { _: [] };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith("--")) {
      flags._.push(arg);
      continue;
    }
    const [key, inlineValue] = arg.slice(2).split("=");
    if (inlineValue !== undefined) flags[key] = inlineValue;
    else if (valueFlagNames.has(key) && rawArgs[index + 1] && !rawArgs[index + 1].startsWith("--")) {
      flags[key] = rawArgs[index + 1];
      index += 1;
    } else flags[key] = true;
  }
  return flags;
}

function parseCommand(rawArgs) {
  const flags = parseFlags(rawArgs);
  const first = flags._[0];
  const command = commandNames.has(first) ? first : flags._.length ? "context" : "summary";
  const terms = commandNames.has(first) ? flags._.slice(1) : flags._;
  return { command: command === "status" ? "summary" : command, query: terms.join(" ").trim(), flags };
}

function parseLimit(value, fallback = 12) {
  if (value === undefined) return fallback;
  if (value === true) throw new Error("--limit requires a positive integer value.");
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer.");
  return limit;
}

function getAccessToken() {
  const envToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN || process.env.FIRESTORE_ACCESS_TOKEN || process.env.GCLOUD_ACCESS_TOKEN;
  if (envToken) return envToken.trim();
  return execFileSync("gcloud", ["auth", "print-access-token"], {
    encoding: "utf8"
  }).trim();
}

function firestoreValueToJs(value) {
  if (!value || typeof value !== "object") return undefined;
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(firestoreValueToJs);
  if ("mapValue" in value) {
    return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => {
      return [key, firestoreValueToJs(item)];
    }));
  }
  return undefined;
}

function firestoreDocumentToJs(document) {
  return {
    id: document.name.split("/").pop(),
    _createTime: document.createTime,
    _updateTime: document.updateTime,
    ...Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => {
      return [key, firestoreValueToJs(value)];
    }))
  };
}

async function requestFirestore(token, path) {
  const response = await fetch(`${baseUrl}/${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": projectId
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Firestore request failed for ${path}: ${response.status} ${body}`);
  }

  return response.json();
}

async function listCollection(token, collectionPath) {
  const docs = [];
  let pageToken = "";
  do {
    const path = pageToken
      ? `${collectionPath}?pageSize=100&pageToken=${encodeURIComponent(pageToken)}`
      : `${collectionPath}?pageSize=100`;
    const body = await requestFirestore(token, path);
    docs.push(...(body.documents || []).map(firestoreDocumentToJs));
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return docs;
}

function walk(value, visitor, path = []) {
  visitor(value, path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visitor, [...path, String(index)]));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      visitor(key, [...path, key]);
      walk(item, visitor, [...path, key]);
    }
  }
}

function assertRemoteSafe(items, label = "Remote Work DB context") {
  const failures = [];
  for (const item of items) {
    for (const key of Object.keys(item)) {
      if (forbiddenFieldNames.has(key)) failures.push(`${item.id}.${key}`);
    }
    walk(item, (value, path) => {
      if (typeof value === "string") {
        for (const forbidden of forbiddenStringParts) {
          if (value.includes(forbidden)) failures.push(`${item.id}:${path.join(".")} contains ${forbidden}`);
        }
      }
      if (typeof value === "string" && path.length && forbiddenFieldNames.has(value)) {
        failures.push(`${item.id}:${path.join(".")} contains forbidden field name value`);
      }
    });
  }
  if (failures.length) {
    throw new Error(`${label} failed privacy check:\n${failures.join("\n")}`);
  }
}

function normalizeTerms(query) {
  return String(query || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function itemText(item) {
  return [
    item.kind,
    item.title,
    item.summary,
    item.clusterLabel,
    item.clusterId,
    item.externalId,
    ...(item.tags || [])
  ].filter(Boolean).join(" ").toLowerCase();
}

function scoreItem(item, query, terms) {
  const haystack = itemText(item);
  if (!terms.length) return item.kind === "summary" ? 1 : 0;
  let score = haystack.includes(query) ? 14 : 0;
  for (const term of terms) {
    if (!term) continue;
    const matches = haystack.split(term).length - 1;
    if (matches) score += matches * 2;
    if (String(item.title || "").toLowerCase().includes(term)) score += 5;
    if ((item.tags || []).includes(term)) score += 6;
    if (String(item.clusterLabel || "").toLowerCase().includes(term)) score += 3;
  }
  if (item.kind === "project") score += 4;
  if (item.kind === "cluster") score += 2;
  return score;
}

function rankItems(items, query, limit) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const terms = normalizeTerms(normalizedQuery);
  return items
    .map((item) => ({ ...item, score: scoreItem(item, normalizedQuery, terms) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      return right.score - left.score
        || itemMetric(right) - itemMetric(left)
        || String(left.title || left.id).localeCompare(String(right.title || right.id));
    })
    .slice(0, limit);
}

function commandList(item) {
  return [
    item.cloudCommand,
    ...(item.cloudCommands || []),
    item.localCommand,
    item.localSearchCommand,
    ...(item.localCommands || [])
  ].filter(Boolean);
}

function itemMetric(item) {
  return Number(item.fileCount || item.recordCount || item.count || item.projectCount || 0);
}

function formatMetric(value) {
  return value === undefined || value === null || value === "" ? "n/a" : String(value);
}

function formatNumber(value) {
  if (value === undefined || value === null || value === "") return "n/a";
  return new Intl.NumberFormat("en-US").format(Number(value));
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function sortedWorkdbItems(items) {
  const rank = { summary: 0, cluster: 1, project: 2, tag: 3, external: 4 };
  return items.slice().sort((left, right) => {
    return (rank[left.kind] ?? 9) - (rank[right.kind] ?? 9)
      || itemMetric(right) - itemMetric(left)
      || String(left.title || left.id).localeCompare(String(right.title || right.id));
  });
}

function readGraphSnapshot() {
  if (!existsSync(graphSnapshotPath)) return null;
  try {
    return JSON.parse(readFileSync(graphSnapshotPath, "utf8"));
  } catch {
    return null;
  }
}

function compactGraphSnapshot() {
  const snapshot = readGraphSnapshot();
  if (!snapshot) return null;
  const counts = snapshot.counts || {};
  return {
    generatedAt: snapshot.generatedAt || null,
    counts: {
      nodes: counts.nodes ?? (Array.isArray(snapshot.nodes) ? snapshot.nodes.length : undefined),
      edges: counts.edges ?? (Array.isArray(snapshot.edges) ? snapshot.edges.length : undefined),
      files: counts.files,
      clusters: counts.clusters
    }
  };
}

async function loadCloudDb(options = {}) {
  const includeCollections = options.includeCollections !== false;
  const token = getAccessToken();
  const metaBody = await requestFirestore(token, "vaults/main");
  const meta = firestoreDocumentToJs(metaBody);
  const workdbContext = await listCollection(token, "vaults/main/workdbContext");
  assertRemoteSafe(workdbContext);

  if (!includeCollections) return { meta, workdbContext };

  const collections = {};
  await Promise.all(managedCollections
    .filter((name) => name !== "workdbContext")
    .map(async (name) => {
      collections[name] = await listCollection(token, `vaults/main/${name}`);
    }));
  assertRemoteSafe(collections.checks || [], "Firestore checks output");

  return { meta, workdbContext, collections };
}

function buildMarkdown({ query, meta, items, ranked, limit }) {
  const summary = items.find((item) => item.kind === "summary") || {};
  const clusters = ranked.filter((item) => item.kind === "cluster").slice(0, 5);
  const projects = ranked.filter((item) => item.kind === "project").slice(0, 8);
  const tags = ranked.filter((item) => item.kind === "tag").slice(0, 10);
  const externals = ranked.filter((item) => item.kind === "external").slice(0, 5);
  const commands = ranked.flatMap(commandList).filter(Boolean).slice(0, 12);

  const lines = [
    `# Cloud Work DB Context: ${query}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    `Project: ${projectId}`,
    "",
    "This pack is fetched from live Firestore. It is remote-safe and intentionally excludes local paths, snippets, file content, and git remotes.",
    "",
    "## Cloud Snapshot",
    "",
    `- title: ${meta.title || "LLM Knowledge Bases"}`,
    `- Firestore updated: ${formatMetric(meta._updateTime)}`,
    `- Work DB generated: ${formatMetric(meta.workdbGeneratedAt || summary.generatedAt)}`,
    `- work files: ${formatMetric(meta.workdbFileCount || summary.fileCount)}`,
    `- projects: ${formatMetric(meta.workdbProjectCount || summary.projectCount)}`,
    `- Codex sessions: ${formatMetric(summary.codexSessionCount)}`,
    `- Claude records: ${formatMetric(summary.claudeSessionCount)}`,
    `- workdb docs: ${items.length}`,
    `- privacy mode: ${meta.workdbPrivacyMode || summary.privacyMode || "remote-index-no-paths-no-snippets-no-file-content"}`,
    "",
    "## Top Matches",
    "",
    ...(ranked.length ? ranked.map((item) => {
      const metrics = [
        item.fileCount !== undefined ? `${item.fileCount} files` : "",
        item.projectCount !== undefined ? `${item.projectCount} projects` : "",
        item.recordCount !== undefined ? `${item.recordCount} records` : "",
        item.count !== undefined ? `${item.count} indexed items` : ""
      ].filter(Boolean).join(", ");
      return `- [${item.kind}] ${item.title} (score ${Math.round(item.score)})${metrics ? ` - ${metrics}` : ""}\n  - cluster: ${item.clusterLabel || item.clusterId || "n/a"}\n  - tags: ${(item.tags || []).slice(0, 10).join(", ") || "none"}\n  - summary: ${item.summary || "n/a"}`;
    }) : ["- none"]),
    "",
    "## Clusters",
    "",
    ...(clusters.length ? clusters.map((item) => `- ${item.title}: ${item.summary}`) : ["- none"]),
    "",
    "## Projects",
    "",
    ...(projects.length ? projects.map((item) => `- ${item.title}: ${item.summary}`) : ["- none"]),
    "",
    "## Tags",
    "",
    ...(tags.length ? tags.map((item) => `- ${item.title}: ${item.recordCount || 0}`) : ["- none"]),
    "",
    "## External Inventory",
    "",
    ...(externals.length ? externals.map((item) => `- ${item.title}: ${item.summary}`) : ["- none"]),
    "",
    "## Follow-up Commands",
    "",
    ...(commands.length ? commands.map((command) => `- ${command}`) : [
      `- npm run workdb:cloud -- "${query}" --limit ${limit}`,
      `- npm run workdb -- context "${query}" --limit ${limit}`
    ])
  ];

  return `${lines.join("\n")}\n`;
}

function renderItemLine(item) {
  const metrics = [
    item.fileCount !== undefined ? `${formatNumber(item.fileCount)} files` : "",
    item.recordCount !== undefined ? `${formatNumber(item.recordCount)} records` : "",
    item.projectCount !== undefined ? `${formatNumber(item.projectCount)} projects` : "",
    item.count !== undefined ? `${formatNumber(item.count)} items` : ""
  ].filter(Boolean).join(", ");
  return `- [${item.kind}] ${item.title}${metrics ? ` - ${metrics}` : ""}\n  - cluster: ${item.clusterLabel || item.clusterId || "n/a"}\n  - summary: ${item.summary || "n/a"}`;
}

function renderSummary({ meta, workdbContext, collections }) {
  const summary = workdbContext.find((item) => item.kind === "summary") || {};
  const snapshot = readGraphSnapshot();
  const byKind = countBy(workdbContext, "kind");
  const checks = collections?.checks || [];
  const checkSummary = checks.reduce((acc, item) => {
    const key = `${item.severity || "unknown"}:${item.status || "unknown"}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const topProjects = sortedWorkdbItems(workdbContext).filter((item) => item.kind === "project").slice(0, 8);
  const topTags = sortedWorkdbItems(workdbContext).filter((item) => item.kind === "tag").slice(0, 10);

  return [
    "# Cloud Work DB Summary",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Firebase project: ${projectId}`,
    "",
    "## Live Firestore",
    "",
    `- vault: ${meta.title || "n/a"}`,
    `- Firestore document updated: ${formatMetric(meta._updateTime)}`,
    `- Work DB generated: ${formatMetric(meta.workdbGeneratedAt || summary.generatedAt)}`,
    `- Work DB docs: ${formatNumber(workdbContext.length)}`,
    `- Work files: ${formatNumber(meta.workdbFileCount || summary.fileCount)}`,
    `- Projects: ${formatNumber(meta.workdbProjectCount || summary.projectCount)}`,
    `- Codex sessions: ${formatNumber(summary.codexSessionCount)}`,
    `- Claude records: ${formatNumber(summary.claudeSessionCount)}`,
    `- GitHub repos: ${formatNumber(summary.githubRepoCount)}`,
    `- GCloud projects: ${formatNumber(summary.gcloudProjectCount)}`,
    `- Firebase projects: ${formatNumber(summary.firebaseProjectCount)}`,
    `- Integrity score: ${formatMetric(meta.integrityScore)}%`,
    `- Privacy mode: ${meta.workdbPrivacyMode || summary.privacyMode || "n/a"}`,
    "",
    "## Managed Collections",
    "",
    `- workdbContext: ${formatNumber(workdbContext.length)}`,
    ...Object.entries(collections || {}).map(([name, items]) => `- ${name}: ${formatNumber(items.length)}`),
    "",
    "## Work DB Kinds",
    "",
    ...Object.entries(byKind).sort().map(([kind, count]) => `- ${kind}: ${formatNumber(count)}`),
    "",
    "## Public Graph Snapshot",
    "",
    snapshot
      ? `- generated: ${snapshot.generatedAt || "n/a"}\n- nodes: ${formatNumber(snapshot.counts?.nodes)}\n- edges: ${formatNumber(snapshot.counts?.edges)}\n- files: ${formatNumber(snapshot.counts?.files)}\n- clusters: ${formatNumber(snapshot.counts?.clusters)}`
      : "- assets/tag-cloud-snapshot.json not found",
    "",
    "## Health Checks",
    "",
    ...(Object.keys(checkSummary).length ? Object.entries(checkSummary).sort().map(([key, count]) => `- ${key}: ${formatNumber(count)}`) : ["- none loaded"]),
    "",
    "## Top Projects",
    "",
    ...(topProjects.length ? topProjects.map(renderItemLine) : ["- none"]),
    "",
    "## Top Tags",
    "",
    ...(topTags.length ? topTags.map(renderItemLine) : ["- none"]),
    "",
    "## Next Commands",
    "",
    "- npm run workdb:cloud -- diff",
    "- npm run workdb:cloud -- list project --limit 20",
    "- npm run workdb:cloud -- search \"Drive Zone\" --limit 12",
    "- npm run workdb:cloud -- checks"
  ].join("\n") + "\n";
}

function renderSearch({ query, ranked }) {
  return [
    `# Cloud Work DB Search: ${query}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    ...(ranked.length ? ranked.map(renderItemLine) : ["- no matches"])
  ].join("\n") + "\n";
}

function renderList({ kind, items, limit }) {
  const filtered = kind === "all" ? items : items.filter((item) => item.kind === kind);
  const listed = sortedWorkdbItems(filtered).slice(0, limit);
  return [
    `# Cloud Work DB List: ${kind}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    `Showing: ${formatNumber(listed.length)} of ${formatNumber(filtered.length)}`,
    "",
    ...(listed.length ? listed.map(renderItemLine) : ["- none"])
  ].join("\n") + "\n";
}

function renderChecks(checks) {
  const sorted = checks.slice().sort((left, right) => {
    const severityRank = { High: 0, Medium: 1, Low: 2 };
    return (severityRank[left.severity] ?? 9) - (severityRank[right.severity] ?? 9)
      || String(left.status || "").localeCompare(String(right.status || ""))
      || String(left.title || "").localeCompare(String(right.title || ""));
  });
  return [
    "# Cloud Work DB Checks",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    ...(sorted.length ? sorted.map((item) => {
      return `- [${item.severity || "unknown"} / ${item.status || "unknown"}] ${item.title || item.id}\n  - scope: ${item.scope || "n/a"}\n  - finding: ${item.finding || "n/a"}\n  - next: ${item.nextAction || "n/a"}`;
    }) : ["- none"])
  ].join("\n") + "\n";
}

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map(stableSortObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value)
    .filter((key) => !key.startsWith("_") && key !== "score")
    .sort()
    .map((key) => [key, stableSortObject(value[key])]));
}

function canonicalItem(item) {
  return JSON.stringify(stableSortObject(item));
}

function indexById(items) {
  return new Map(items.map((item) => [item.id, item]));
}

function diffItems(liveItems, localItems) {
  const liveById = indexById(liveItems);
  const localById = indexById(localItems);
  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];

  for (const [id, localItem] of localById) {
    const liveItem = liveById.get(id);
    if (!liveItem) {
      added.push(localItem);
      continue;
    }
    if (canonicalItem(localItem) === canonicalItem(liveItem)) unchanged.push(localItem);
    else changed.push({ id, live: liveItem, local: localItem });
  }

  for (const [id, liveItem] of liveById) {
    if (!localById.has(id)) removed.push(liveItem);
  }

  return {
    added: sortedWorkdbItems(added),
    removed: sortedWorkdbItems(removed),
    changed: changed.sort((left, right) => {
      return itemMetric(right.local) - itemMetric(left.local)
        || String(left.local.title || left.id).localeCompare(String(right.local.title || right.id));
    }),
    unchanged: sortedWorkdbItems(unchanged)
  };
}

function serializeDiff(diff, limit, includeAll = false) {
  const take = (items) => includeAll ? items : items.slice(0, limit);
  return {
    counts: {
      unchanged: diff.unchanged.length,
      changed: diff.changed.length,
      localOnly: diff.added.length,
      liveOnly: diff.removed.length
    },
    directions: {
      localOnly: "Present in the local generated bundle and would be added to Firestore on next seed.",
      liveOnly: "Present only in live Firestore and would disappear from Firestore on next seed."
    },
    limited: !includeAll,
    limit: includeAll ? null : limit,
    unchanged: take(diff.unchanged),
    changed: take(diff.changed),
    localOnly: take(diff.added),
    liveOnly: take(diff.removed)
  };
}

function diffMetricLine(label, liveValue, localValue) {
  const marker = String(liveValue) === String(localValue) ? "same" : "changed";
  return `- ${label}: live ${formatNumber(liveValue)} / local ${formatNumber(localValue)} (${marker})`;
}

function renderChangedLine(item) {
  const liveMetric = itemMetric(item.live);
  const localMetric = itemMetric(item.local);
  return `- [${item.local.kind}] ${item.local.title || item.id}\n  - live: ${formatNumber(liveMetric)} ${item.live.clusterLabel || item.live.clusterId || ""}\n  - local: ${formatNumber(localMetric)} ${item.local.clusterLabel || item.local.clusterId || ""}`;
}

function buildLocalRemoteContext() {
  return buildRemoteWorkdbContext({ write: false });
}

function renderDiff({ meta, liveItems, localContext, limit }) {
  const liveSummary = liveItems.find((item) => item.kind === "summary") || {};
  const localSummary = localContext.items.find((item) => item.kind === "summary") || {};
  const snapshot = readGraphSnapshot();
  const diff = diffItems(liveItems, localContext.items);
  const localOnlyLabel = "Would be added to Firestore on next seed";
  const liveOnlyLabel = "Would disappear from Firestore on next seed";

  return [
    "# Cloud Work DB Diff",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Firebase project: ${projectId}`,
    "",
    "## Freshness",
    "",
    `- live Firestore updated: ${formatMetric(meta._updateTime)}`,
    `- live Work DB generated: ${formatMetric(meta.workdbGeneratedAt || liveSummary.generatedAt)}`,
    `- local Work DB generated: ${formatMetric(localContext.sourceGeneratedAt || localSummary.generatedAt)}`,
    snapshot ? `- local public graph snapshot: ${formatMetric(snapshot.generatedAt)} (${formatNumber(snapshot.counts?.files)} files)` : "- local public graph snapshot: missing",
    "",
    "## Count Comparison",
    "",
    diffMetricLine("workdb docs", liveItems.length, localContext.items.length),
    diffMetricLine("files", meta.workdbFileCount || liveSummary.fileCount, localContext.counts.files),
    diffMetricLine("projects", meta.workdbProjectCount || liveSummary.projectCount, localContext.counts.projects),
    diffMetricLine("Codex sessions", liveSummary.codexSessionCount, localContext.counts.codexSessions),
    diffMetricLine("Claude records", liveSummary.claudeSessionCount, localContext.counts.claudeSessions),
    diffMetricLine("tags", liveSummary.tagCount, localContext.counts.tags),
    "",
    "## Item Diff",
    "",
    `- unchanged: ${formatNumber(diff.unchanged.length)}`,
    `- changed: ${formatNumber(diff.changed.length)}`,
    `- local only: ${formatNumber(diff.added.length)} (${localOnlyLabel})`,
    `- live only: ${formatNumber(diff.removed.length)} (${liveOnlyLabel})`,
    "",
    `## ${localOnlyLabel}`,
    "",
    ...(diff.added.length ? diff.added.slice(0, limit).map(renderItemLine) : ["- none"]),
    "",
    `## ${liveOnlyLabel}`,
    "",
    ...(diff.removed.length ? diff.removed.slice(0, limit).map(renderItemLine) : ["- none"]),
    "",
    "## Changed Shared Items",
    "",
    ...(diff.changed.length ? diff.changed.slice(0, limit).map(renderChangedLine) : ["- none"]),
    "",
    "## Apply Path",
    "",
    "- Review this diff first.",
    "- Run npm run workdb:remote to refresh the local remote-safe bundle.",
    "- Run npm run seed:firestore to replace Firestore managed collections.",
    "- Run npm run validate:firestore-workdb to verify the live DB privacy and render contract."
  ].join("\n") + "\n";
}

function printUsage() {
  console.log([
    "Usage:",
    "  npm run workdb:cloud -- summary",
    "  npm run workdb:cloud -- list project --limit 20",
    "  npm run workdb:cloud -- search \"Drive Zone\" --limit 12",
    "  npm run workdb:cloud -- \"Drive Zone\" --limit 12",
    "  npm run workdb:cloud -- diff --limit 20",
    "  npm run workdb:cloud -- checks",
    "",
    "Commands:",
    "  summary   Show live Firestore counts, freshness, top projects, top tags, checks, and graph snapshot info.",
    "  list      List live Work DB records by kind: summary, cluster, project, tag, external, or all.",
    "  search    Show compact ranked live Work DB matches.",
    "  context   Show the agent routing context pack. This is the default when the first arg is not a command.",
    "  diff      Compare live Firestore workdbContext with the current local remote-safe bundle.",
    "  checks    Show live integrity checks.",
    "",
    "Flags:",
    "  --limit N  Limit list/search/diff output rows.",
    "  --json     Emit machine-readable JSON for automation.",
    "  --all      With diff --json, emit every diff row instead of the --limit preview."
  ].join("\n"));
}

async function main() {
  const { command, query, flags } = parseCommand(process.argv.slice(2));
  const limit = parseLimit(flags.limit);

  if (command === "help") {
    printUsage();
    return;
  }

  if (command === "context" && !query) {
    throw new Error("Usage: npm run workdb:cloud -- <query> [--limit 12] [--json]");
  }

  if (command === "search" && !query) {
    throw new Error("Usage: npm run workdb:cloud -- search <query> [--limit 12] [--json]");
  }

  if (command === "summary") {
    const db = await loadCloudDb();
    if (flags.json) {
      console.log(JSON.stringify({
        ok: true,
        projectId,
        meta: db.meta,
        collectionCounts: {
          workdbContext: db.workdbContext.length,
          ...Object.fromEntries(Object.entries(db.collections).map(([name, items]) => [name, items.length]))
        },
        kinds: countBy(db.workdbContext, "kind"),
        graphSnapshot: compactGraphSnapshot()
      }, null, 2));
      return;
    }
    console.log(renderSummary(db));
    return;
  }

  if (command === "list") {
    const kind = query || flags.kind || "project";
    const db = await loadCloudDb({ includeCollections: false });
    if (flags.json) {
      const filtered = kind === "all" ? db.workdbContext : db.workdbContext.filter((item) => item.kind === kind);
      console.log(JSON.stringify({ ok: true, projectId, kind, docs: filtered.length, items: sortedWorkdbItems(filtered).slice(0, limit) }, null, 2));
      return;
    }
    console.log(renderList({ kind, items: db.workdbContext, limit }));
    return;
  }

  if (command === "search") {
    const db = await loadCloudDb({ includeCollections: false });
    const ranked = rankItems(db.workdbContext, query, limit);
    if (flags.json) {
      console.log(JSON.stringify({ ok: true, projectId, query, matches: ranked }, null, 2));
      return;
    }
    console.log(renderSearch({ query, ranked }));
    return;
  }

  if (command === "checks") {
    const db = await loadCloudDb();
    if (flags.json) {
      console.log(JSON.stringify({ ok: true, projectId, checks: db.collections.checks }, null, 2));
      return;
    }
    console.log(renderChecks(db.collections.checks));
    return;
  }

  if (command === "diff") {
    const db = await loadCloudDb({ includeCollections: false });
    const localContext = buildLocalRemoteContext();
    const diff = diffItems(db.workdbContext, localContext.items);
    if (flags.json) {
      console.log(JSON.stringify({
        ok: true,
        projectId,
        live: {
          updatedAt: db.meta._updateTime,
          workdbGeneratedAt: db.meta.workdbGeneratedAt,
          docs: db.workdbContext.length
        },
        local: {
          sourceGeneratedAt: localContext.sourceGeneratedAt,
          docs: localContext.items.length,
          counts: localContext.counts
        },
        diff: serializeDiff(diff, limit, Boolean(flags.all)),
      }, null, 2));
      return;
    }
    console.log(renderDiff({ meta: db.meta, liveItems: db.workdbContext, localContext, limit }));
    return;
  }

  const db = await loadCloudDb({ includeCollections: false });
  const ranked = rankItems(db.workdbContext, query, limit);
  const markdown = buildMarkdown({ query, meta: db.meta, items: db.workdbContext, ranked, limit });

  if (flags.json) {
    console.log(JSON.stringify({
      ok: true,
      projectId,
      query,
      docs: db.workdbContext.length,
      matches: ranked,
      markdown
    }, null, 2));
    return;
  }

  console.log(markdown);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
