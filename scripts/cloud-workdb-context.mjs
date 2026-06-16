#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const projectId = process.env.FIREBASE_PROJECT_ID || "llm-knowledge-bases";
const databaseId = "(default)";
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
const forbiddenFieldNames = new Set(["path", "relativePath", "snippet", "remote", "content"]);
const forbiddenStringParts = ["/Users/", "file://", "AIza", "BEGIN PRIVATE KEY"];

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
    else if (rawArgs[index + 1] && !rawArgs[index + 1].startsWith("--")) {
      flags[key] = rawArgs[index + 1];
      index += 1;
    } else flags[key] = true;
  }
  return flags;
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

function assertRemoteSafe(items) {
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
    throw new Error(`Remote Work DB context failed privacy check:\n${failures.join("\n")}`);
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
        || Number(right.fileCount || right.recordCount || right.count || 0) - Number(left.fileCount || left.recordCount || left.count || 0)
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

function formatMetric(value) {
  return value === undefined || value === null || value === "" ? "n/a" : String(value);
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
    `- work files: ${formatMetric(meta.workdbFileCount || summary.fileCount)}`,
    `- projects: ${formatMetric(meta.workdbProjectCount || summary.projectCount)}`,
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

async function loadCloudContext() {
  const token = getAccessToken();
  const [metaBody, items] = await Promise.all([
    requestFirestore(token, "vaults/main"),
    listCollection(token, "vaults/main/workdbContext")
  ]);
  const meta = Object.fromEntries(Object.entries(metaBody.fields || {}).map(([key, value]) => {
    return [key, firestoreValueToJs(value)];
  }));
  assertRemoteSafe(items);
  return { meta, items };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const query = flags._.join(" ").trim();
  const limit = Number(flags.limit || 12);
  if (!query) {
    throw new Error("Usage: npm run workdb:cloud -- <query> [--limit 12] [--json]");
  }

  const { meta, items } = await loadCloudContext();
  const ranked = rankItems(items, query, limit);
  const markdown = buildMarkdown({ query, meta, items, ranked, limit });

  if (flags.json) {
    console.log(JSON.stringify({
      ok: true,
      projectId,
      query,
      docs: items.length,
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
