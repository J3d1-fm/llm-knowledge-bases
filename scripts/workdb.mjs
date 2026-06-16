#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputRoot = join(root, "outputs", "global-work-kb");
const dbPath = join(outputRoot, "db.json");
const filesPath = join(outputRoot, "files.jsonl");
const projectsPath = join(outputRoot, "projects.jsonl");
const sessionsPath = join(outputRoot, "sessions.jsonl");
const externalPath = join(outputRoot, "external-inventory.json");
const rawRegistryPath = join(outputRoot, "raw-registry.jsonl");
const chronologyPath = join(outputRoot, "chronology.jsonl");
const catalogPath = join(outputRoot, "catalog.md");
const provenancePath = join(outputRoot, "provenance.md");

const home = "/Users/phil";
const sourceRoots = [
  { id: "codex-projects", label: "Codex Projects", path: `${home}/Documents/Codex Projects`, mode: "project-tree" },
  { id: "codex-daily", label: "Codex Daily Workspaces", path: `${home}/Documents/Codex`, mode: "workspace-tree" },
  { id: "codex-memory", label: "Codex Memory", path: `${home}/.codex/memories`, mode: "memory-tree" },
  { id: "codex-skills", label: "Codex Skills", path: `${home}/.codex/skills`, mode: "skill-tree" },
  { id: "claude-home", label: "Claude Home", path: `${home}/.claude`, mode: "claude-tree" },
  { id: "claude-documents", label: "Claude Documents", path: `${home}/Documents/Claude`, mode: "claude-tree" }
];

const excludedNames = new Set([
  ".git",
  ".firebase",
  ".next",
  ".turbo",
  ".venv",
  ".cache",
  ".codex_tmp_worktrees",
  ".tmp",
  "__pycache__",
  "DerivedData",
  "build",
  "cache",
  "conda",
  "coverage",
  "dist",
  "fontconfig",
  "node_modules",
  "Pods",
  "tmp",
  "vendor",
  "work",
  "worktrees"
]);

const readableExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsonl",
  ".jsx",
  ".md",
  ".mjs",
  ".py",
  ".rb",
  ".sh",
  ".sql",
  ".swift",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml"
]);

const snippetExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".jsx",
  ".md",
  ".mjs",
  ".py",
  ".rb",
  ".sh",
  ".sql",
  ".swift",
  ".ts",
  ".tsx",
  ".txt"
]);

const secretPatterns = [
  /(^|\/)\.env/i,
  /account[_-]?bindings/i,
  /auth\.json$/i,
  /configstore/i,
  /credentials/i,
  /google[_-]?account/i,
  /keychain/i,
  /private[_-]?key/i,
  /secret/i,
  /secrets/i,
  /token/i
];

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

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "item";
}

function shortHash(value) {
  return createHash("sha1").update(String(value)).digest("hex").slice(0, 10);
}

function stableId(value) {
  return `${slugify(value)}-${shortHash(value)}`;
}

function isSensitivePath(filePath) {
  return secretPatterns.some((pattern) => pattern.test(filePath));
}

function safeStat(filePath) {
  try {
    return statSync(filePath);
  } catch {
    return null;
  }
}

function readSmallText(filePath, maxBytes = 200000) {
  const stats = safeStat(filePath);
  if (!stats || stats.size > maxBytes || isSensitivePath(filePath)) return "";
  const extension = extname(filePath).toLowerCase();
  if (!readableExtensions.has(extension) || !snippetExtensions.has(extension)) return "";
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function titleFromText(filePath, text) {
  const heading = text.match(/^#\s+(.+)$/m);
  if (heading) return heading[1].trim();
  const packageName = text.match(/"name"\s*:\s*"([^"]+)"/);
  if (packageName && basename(filePath) === "package.json") return packageName[1];
  return basename(filePath, extname(filePath)).replace(/[-_]+/g, " ");
}

function redactSensitiveText(text) {
  return text
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED_API_KEY]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)(["'\s:=]+)([^"',\s]+)/gi, "$1$2[REDACTED]");
}

function redactRemoteUrl(value) {
  return redactSensitiveText(String(value || ""))
    .replace(/([a-z][a-z0-9+.-]*:\/\/)([^/@\s]+)@/gi, "$1[REDACTED]@")
    .replace(/(gh[pousr]_[A-Za-z0-9_]{20,})/g, "[REDACTED_GITHUB_TOKEN]");
}

function snippetFromText(text) {
  const snippet = text
    .replace(/^---[\s\S]*?---\s*/, "")
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .find((part) => part && !part.startsWith("#"))
    ?.slice(0, 280) || "";
  return redactSensitiveText(snippet);
}

function compileStatusForFile(file) {
  if (file.sensitive) return "metadata-only";
  if (!snippetExtensions.has(file.extension)) return "metadata-only";
  if (!file.snippet) return "metadata-only";
  return "candidate";
}

function deriveTags(filePath, text = "") {
  const lower = filePath.toLowerCase();
  const tags = new Set();
  const dictionary = [
    ["codex", /codex/],
    ["claude", /claude/],
    ["memory", /memories|memory/],
    ["session", /session|thread/],
    ["drive-zone", /drive[ -]?zone|dzpd|proas/],
    ["digital-racers", /digital[ -]?racers|gt[ -]?rivals/],
    ["piano", /piano|music|song/],
    ["legal", /legal|суд|дело|court|contract/],
    ["budget", /budget|finance|spend/],
    ["tasks", /task|tracker|todo/],
    ["telegram", /telegram/],
    ["firebase", /firebase|firestore|hosting/],
    ["gcloud", /gcloud|cloud sql|google cloud/],
    ["github", /github|\.git/],
    ["dashboard", /dashboard|analytics|report/],
    ["ads", /ads|admob|app-ads|ua/],
    ["automation", /automation|cron|launchd/],
    ["skill", /skill|SKILL\.md/i],
    ["docs", /readme|documentation|docs|\.md$/],
    ["ios", /swift|xcode|ios/],
    ["web", /html|css|tsx|react|vite|next/],
    ["data", /sql|csv|json|analytics|dataset/],
    ["secret-sensitive", /secret|token|credential|auth\.json|\.env/]
  ];

  for (const [tag, pattern] of dictionary) {
    if (pattern.test(lower) || pattern.test(text.slice(0, 5000).toLowerCase())) tags.add(tag);
  }

  for (const part of lower.split(/[\/\s._-]+/)) {
    if (part.length >= 4 && part.length <= 24 && !["users", "phil", "documents", "projects"].includes(part)) {
      tags.add(part);
    }
  }

  return [...tags].slice(0, 24);
}

function gitRemoteFor(projectPath) {
  const configPath = join(projectPath, ".git", "config");
  if (!existsSync(configPath)) return "";
  const config = readFileSync(configPath, "utf8");
  return redactRemoteUrl(config.match(/url = (.+)/)?.[1]?.trim() || "");
}

function walkFiles(startPath, options = {}) {
  const maxFiles = options.maxFiles || 80000;
  const files = [];

  function visit(currentPath) {
    if (files.length >= maxFiles) return;
    const stats = safeStat(currentPath);
    if (!stats) return;
    const name = basename(currentPath);
    if (stats.isDirectory()) {
      if (currentPath === outputRoot || currentPath.startsWith(`${outputRoot}/`)) return;
      if (excludedNames.has(name)) return;
      let entries = [];
      try {
        entries = readdirSync(currentPath).sort();
      } catch {
        return;
      }
      for (const entry of entries) visit(join(currentPath, entry));
      return;
    }
    if (stats.isFile()) files.push({ path: currentPath, stats });
  }

  visit(startPath);
  return files;
}

function topLevelProjects(projectsRoot) {
  if (!existsSync(projectsRoot)) return [];
  return readdirSync(projectsRoot)
    .sort()
    .map((name) => join(projectsRoot, name))
    .filter((itemPath) => safeStat(itemPath)?.isDirectory())
    .map((projectPath) => ({
      id: stableId(projectPath),
      name: basename(projectPath),
      path: projectPath,
      remote: gitRemoteFor(projectPath),
      tags: deriveTags(projectPath),
      sourceRoot: "codex-projects"
    }));
}

function findGitRepos(startPath) {
  const repos = [];
  function visit(currentPath, depth = 0) {
    if (depth > 5) return;
    const stats = safeStat(currentPath);
    if (!stats?.isDirectory()) return;
    if (existsSync(join(currentPath, ".git"))) {
      repos.push(currentPath);
      return;
    }
    const name = basename(currentPath);
    if (excludedNames.has(name)) return;
    let entries = [];
    try {
      entries = readdirSync(currentPath).sort();
    } catch {
      return;
    }
    for (const entry of entries) visit(join(currentPath, entry), depth + 1);
  }
  visit(startPath);
  return repos;
}

function parseCodexSessions() {
  const indexPath = `${home}/.codex/session_index.jsonl`;
  if (!existsSync(indexPath)) return [];
  return readFileSync(indexPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        const item = JSON.parse(line);
        const sessionIdentity = [item.id, item.thread_name || item.title || "", item.updated_at || item.updatedAt || ""].join("|");
        return {
          id: stableId(sessionIdentity),
          sessionId: item.id,
          title: item.thread_name || item.title || item.id,
          updatedAt: item.updated_at || item.updatedAt || "",
          tags: deriveTags(`${item.thread_name || ""} ${item.id || ""}`)
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function parseClaudeSessionFiles() {
  const roots = [`${home}/.claude/projects`, `${home}/.claude/sessions`, `${home}/.claude/tasks`];
  return roots.flatMap((startPath) => {
    return walkFiles(startPath, { maxFiles: 20000 })
      .filter((item) => [".json", ".jsonl"].includes(extname(item.path).toLowerCase()))
      .map(({ path, stats }) => ({
        id: stableId(relative(`${home}/.claude`, path)),
        title: basename(path),
        path,
        size: stats.size,
        updatedAt: stats.mtime.toISOString(),
        tags: deriveTags(path)
      }));
  });
}

function collectFiles() {
  const rows = [];
  for (const sourceRoot of sourceRoots) {
    if (!existsSync(sourceRoot.path)) continue;
    const maxFiles = sourceRoot.id.startsWith("codex-") ? 90000 : 30000;
    for (const { path, stats } of walkFiles(sourceRoot.path, { maxFiles })) {
      const text = readSmallText(path);
      const relativePath = path.startsWith(root) ? relative(root, path) : path;
      const extension = extname(path).toLowerCase();
      const sensitive = isSensitivePath(path);
      const snippet = text ? snippetFromText(text) : "";
      const row = {
        id: stableId(relativePath),
        sourceRoot: sourceRoot.id,
        sourceLabel: sourceRoot.label,
        path,
        relativePath,
        extension,
        size: stats.size,
        updatedAt: stats.mtime.toISOString(),
        title: text ? titleFromText(path, text) : basename(path),
        snippet,
        sensitive,
        tags: deriveTags(path, text)
      };
      row.compileStatus = compileStatusForFile(row);
      rows.push(row);
    }
  }
  return rows;
}

function collectProjects(files) {
  const directProjects = topLevelProjects(`${home}/Documents/Codex Projects`);
  const repoProjects = [
    ...findGitRepos(`${home}/Documents/Codex Projects`),
    ...findGitRepos(`${home}/Documents/Codex`)
  ].map((projectPath) => ({
    id: stableId(projectPath),
    name: basename(projectPath),
    path: projectPath,
    remote: gitRemoteFor(projectPath),
    tags: deriveTags(projectPath),
    sourceRoot: projectPath.includes("/Codex Projects/") ? "codex-projects" : "codex-daily"
  }));

  const byPath = new Map();
  for (const project of [...directProjects, ...repoProjects]) {
    byPath.set(project.path, { ...project, fileCount: 0, totalBytes: 0 });
  }

  for (const file of files) {
    let best = null;
    for (const project of byPath.values()) {
      if (file.path.startsWith(`${project.path}/`) && (!best || project.path.length > best.path.length)) {
        best = project;
      }
    }
    if (best) {
      best.fileCount += 1;
      best.totalBytes += file.size;
      for (const tag of file.tags) {
        if (!best.tags.includes(tag) && best.tags.length < 32) best.tags.push(tag);
      }
    }
  }

  return [...byPath.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function tagCounts(records) {
  const semanticTags = new Set([
    "ads",
    "analytics",
    "assistant",
    "automation",
    "budget",
    "cases2win",
    "claude",
    "cloud",
    "creative",
    "dashboard",
    "data",
    "digital-racers",
    "docs",
    "drive-zone",
    "firebase",
    "firestore",
    "gcloud",
    "github",
    "gmail",
    "google",
    "ios",
    "jet",
    "legal",
    "llm",
    "memory",
    "mmp",
    "pdmx",
    "personal",
    "piano",
    "proas",
    "project-google-accounts",
    "reports",
    "session",
    "skill",
    "slack",
    "tasks",
    "telegram",
    "teleprompter",
    "tracker",
    "universal",
    "universalmmp",
    "web"
  ]);
  const noisyTags = new Set([
    "2026",
    "arm64",
    "build",
    "cache",
    "codex",
    "conda",
    "debug",
    "deps",
    "documents",
    "e57cbdbad52c2659",
    "final",
    "first",
    "font",
    "fontconfig",
    "index",
    "le64",
    "loader",
    "local",
    "output",
    "phil",
    "projects",
    "rcgu",
    "store",
    "target",
    "tools",
    "users"
  ]);
  function usefulTag(tag) {
    if (!semanticTags.has(tag)) return false;
    if (noisyTags.has(tag)) return false;
    if (/^\d+$/.test(tag)) return false;
    if (/^[a-f0-9]{10,}$/i.test(tag)) return false;
    if (tag.length < 3 || tag.length > 32) return false;
    return true;
  }
  const counts = new Map();
  for (const record of records) {
    for (const tag of record.tags || []) {
      if (usefulTag(tag)) counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
}

function loadExternalInventory() {
  if (!existsSync(externalPath)) return {};
  try {
    return JSON.parse(readFileSync(externalPath, "utf8"));
  } catch {
    return {};
  }
}

function lineDelimited(rows) {
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

const themeClusters = [
  {
    id: "agent-memory",
    label: "Agent memory",
    color: "#f2f2f2",
    tags: ["memory", "session", "codex", "claude", "skill", "tasks", "automation", "telegram", "tracker", "personal"]
  },
  {
    id: "data-dashboards",
    label: "Data and dashboards",
    color: "#95b8ff",
    tags: ["data", "analytics", "dashboard", "reports", "mmp", "universalmmp", "universal", "proas", "pdmx", "drive-zone"]
  },
  {
    id: "growth-creative",
    label: "Growth and creative",
    color: "#f4c46d",
    tags: ["ads", "creative", "digital-racers", "jet"]
  },
  {
    id: "cloud-auth",
    label: "Cloud and auth",
    color: "#78ddc4",
    tags: ["firebase", "firestore", "gcloud", "github", "google", "gmail", "slack", "project-google-accounts"]
  },
  {
    id: "products-apps",
    label: "Products and apps",
    color: "#d7a7ff",
    tags: ["ios", "web", "piano", "budget", "teleprompter"]
  },
  {
    id: "docs-legal",
    label: "Docs and legal",
    color: "#ff9e7d",
    tags: ["docs", "legal", "cases2win"]
  },
  {
    id: "other-work",
    label: "Other work",
    color: "#b0b0b0",
    tags: []
  }
];

const clusterById = new Map(themeClusters.map((cluster) => [cluster.id, cluster]));
const clusterByTag = new Map(themeClusters.flatMap((cluster) => cluster.tags.map((tag) => [tag, cluster])));

function clusterForTag(tag) {
  return clusterByTag.get(tag)?.id || "other-work";
}

function clusterForTags(tags = [], fallbackText = "") {
  const scores = new Map();
  for (const tag of tags) {
    const clusterId = clusterForTag(tag);
    scores.set(clusterId, (scores.get(clusterId) || 0) + 1);
  }

  const lower = fallbackText.toLowerCase();
  for (const cluster of themeClusters) {
    for (const tag of cluster.tags) {
      if (lower.includes(tag)) scores.set(cluster.id, (scores.get(cluster.id) || 0) + 0.5);
    }
  }

  return [...scores.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "other-work";
}

function clusterLabel(clusterId) {
  return clusterById.get(clusterId)?.label || clusterId;
}

function clusterColor(clusterId) {
  return clusterById.get(clusterId)?.color || "#b0b0b0";
}

function buildGraphData(tags, projects, external, files = [], codexSessions = [], claudeSessions = []) {
  const nodes = [];
  const edges = [];
  const nodeIds = new Set();
  const edgeIds = new Set();
  const topTags = tags.slice(0, 52);
  const topTagSet = new Set(topTags.map((item) => item.tag));
  const filesByTopTag = new Map(topTags.map((tag) => [tag.tag, 0]));
  const sessionsByTopTag = new Map(topTags.map((tag) => [tag.tag, 0]));
  for (const file of files) {
    for (const tag of file.tags || []) {
      if (filesByTopTag.has(tag)) filesByTopTag.set(tag, filesByTopTag.get(tag) + 1);
    }
  }
  for (const session of [...codexSessions, ...claudeSessions]) {
    for (const tag of session.tags || []) {
      if (sessionsByTopTag.has(tag)) sessionsByTopTag.set(tag, sessionsByTopTag.get(tag) + 1);
    }
  }
  const clusterStats = new Map();

  for (const tag of topTags) {
    const clusterId = clusterForTag(tag.tag);
    const stat = clusterStats.get(clusterId) || { id: clusterId, count: 0, tags: [] };
    stat.count += tag.count;
    stat.tags.push(tag.tag);
    clusterStats.set(clusterId, stat);
  }

  if (!clusterStats.size) {
    clusterStats.set("other-work", { id: "other-work", count: 1, tags: [] });
  }

  const graphClusters = [...clusterStats.values()]
    .map((cluster) => ({
      ...cluster,
      label: clusterLabel(cluster.id),
      color: clusterColor(cluster.id)
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));

  function addNode(node) {
    if (nodeIds.has(node.id)) return false;
    nodeIds.add(node.id);
    nodes.push(node);
    return true;
  }

  function addEdge(source, target, weight = 1, type = "link") {
    if (!nodeIds.has(source) || !nodeIds.has(target)) return;
    const edgeId = `${source}\u0000${target}\u0000${type}`;
    if (edgeIds.has(edgeId)) return;
    edgeIds.add(edgeId);
    edges.push({ source, target, weight, type });
  }

  addNode({
    id: "memory:lens",
    label: "Agent memory",
    type: "memory",
    cluster: "agent-memory",
    weight: 99999,
    detail: "Raw diary, live catalog, provenance, projects, repos, cloud resources, and agent sessions"
  });

  for (const cluster of graphClusters) {
    addNode({
      id: `cluster:${cluster.id}`,
      label: cluster.label,
      type: "cluster",
      cluster: cluster.id,
      weight: cluster.count,
      detail: `${cluster.tags.length} tags · ${cluster.count} indexed records`,
      tags: cluster.tags,
      color: cluster.color
    });
    addEdge("memory:lens", `cluster:${cluster.id}`, Math.min(8, Math.max(2, cluster.count / 8000)), "memory-cluster");
  }

  for (const tag of topTags) {
    const clusterId = clusterForTag(tag.tag);
    addNode({
      id: `tag:${tag.tag}`,
      label: tag.tag,
      type: "tag",
      cluster: clusterId,
      weight: tag.count,
      detail: `${tag.count} indexed records`,
      totalRecords: tag.count,
      fileCount: filesByTopTag.get(tag.tag) || 0,
      sessionCount: sessionsByTopTag.get(tag.tag) || 0
    });
    addEdge(`cluster:${clusterId}`, `tag:${tag.tag}`, Math.min(6, Math.max(1, tag.count / 5000)), "cluster-tag");
  }

  const selectedProjects = projects
    .filter((project) => project.fileCount > 0 || project.remote)
    .sort((left, right) => right.fileCount - left.fileCount)
    .slice(0, 84);

  for (const project of selectedProjects) {
    const projectTags = (project.tags || []).filter((tag) => topTagSet.has(tag)).slice(0, 10);
    const projectCluster = clusterForTags(projectTags.length ? projectTags : project.tags, project.name);
    addNode({
      id: `project:${project.id}`,
      label: project.name,
      type: "project",
      cluster: projectCluster,
      weight: Math.max(1, project.fileCount),
      detail: `${project.fileCount} indexed files`,
      fileCount: project.fileCount,
      totalBytes: project.totalBytes,
      path: project.path,
      remote: project.remote,
      tags: projectTags
    });
    addEdge(`cluster:${projectCluster}`, `project:${project.id}`, 1.5, "cluster-project");
    for (const tag of projectTags) addEdge(`project:${project.id}`, `tag:${tag}`, 2, "project-tag");
  }

  const selectedProjectPaths = selectedProjects
    .map((project) => ({ id: project.id, path: project.path }))
    .sort((left, right) => right.path.length - left.path.length);

  const rawNodes = files
    .filter((file) => !file.sensitive)
    .filter((file) => (file.tags || []).some((tag) => topTagSet.has(tag)))
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
    .slice(0, 300);

  let includedRaw = 0;
  for (const file of rawNodes) {
    const fileTags = (file.tags || []).filter((tag) => topTagSet.has(tag)).slice(0, 4);
    const fileCluster = clusterForTags(fileTags, `${file.title || ""} ${file.path || ""}`);
    const fileId = `raw:${file.id}`;
    const inserted = addNode({
      id: fileId,
      label: file.title || basename(file.path),
      type: "raw",
      cluster: fileCluster,
      weight: 1,
      detail: `${file.sourceLabel || file.sourceRoot} · ${file.extension || "file"}`,
      path: file.path,
      updatedAt: file.updatedAt,
      compileStatus: file.compileStatus,
      sensitive: file.sensitive,
      tags: fileTags
    });
    if (!inserted) continue;
    includedRaw += 1;

    const project = selectedProjectPaths.find((item) => file.path.startsWith(`${item.path}/`));
    if (project) addEdge(`project:${project.id}`, fileId, 0.7, "project-raw");
    for (const tag of fileTags.slice(0, 2)) addEdge(fileId, `tag:${tag}`, 0.5, "raw-tag");
  }

  addNode({
    id: "system:codex-sessions",
    label: "Codex sessions",
    type: "system",
    cluster: "agent-memory",
    weight: Math.max(1, codexSessions.length),
    detail: "Indexed Codex session titles and timestamps"
  });
  addNode({
    id: "system:claude",
    label: "Claude files",
    type: "system",
    cluster: "agent-memory",
    weight: Math.max(1, claudeSessions.length),
    detail: "Indexed Claude sessions, tasks, and project notes"
  });
  addEdge("system:codex-sessions", "tag:session", 5, "system-tag");
  addEdge("system:codex-sessions", "tag:memory", 3, "system-tag");
  addEdge("system:claude", "tag:claude", 4, "system-tag");
  addEdge("memory:lens", "system:codex-sessions", 6, "memory-system");
  addEdge("memory:lens", "system:claude", 3, "memory-system");

  let includedSessions = 0;
  for (const session of codexSessions
    .slice()
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
    .slice(0, 140)) {
    const sessionTags = (session.tags || []).filter((tag) => topTagSet.has(tag)).slice(0, 4);
    const sessionCluster = clusterForTags(sessionTags, session.title || "");
    const sessionId = `session:codex:${session.id || stableId(session.title)}`;
    const inserted = addNode({
      id: sessionId,
      label: session.title || session.id,
      type: "session",
      cluster: sessionCluster,
      weight: 1,
      detail: session.updatedAt || "Codex session",
      updatedAt: session.updatedAt,
      tags: sessionTags
    });
    if (!inserted) continue;
    includedSessions += 1;
    addEdge("system:codex-sessions", sessionId, 0.7, "system-session");
    for (const tag of sessionTags.slice(0, 2)) addEdge(sessionId, `tag:${tag}`, 0.5, "session-tag");
  }

  for (const session of claudeSessions
    .slice()
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
    .slice(0, 40)) {
    const sessionTags = (session.tags || []).filter((tag) => topTagSet.has(tag)).slice(0, 4);
    const sessionCluster = clusterForTags(sessionTags, session.title || "");
    const sessionId = `session:claude:${session.id || stableId(session.title)}`;
    const inserted = addNode({
      id: sessionId,
      label: session.title || session.id,
      type: "session",
      cluster: sessionCluster,
      weight: 1,
      detail: session.updatedAt || "Claude session",
      path: session.path || "",
      updatedAt: session.updatedAt,
      tags: sessionTags
    });
    if (!inserted) continue;
    includedSessions += 1;
    addEdge("system:claude", sessionId, 0.7, "system-session");
    for (const tag of sessionTags.slice(0, 2)) addEdge(sessionId, `tag:${tag}`, 0.5, "session-tag");
  }

  const githubRepos = Array.isArray(external.github?.repos) ? external.github.repos : [];
  addNode({
    id: "external:github",
    label: "GitHub",
    type: "external",
    cluster: "cloud-auth",
    weight: Math.max(1, githubRepos.length),
    detail: `${githubRepos.length} repositories`
  });
  addEdge("external:github", "tag:github", 4, "external-tag");
  addEdge("memory:lens", "external:github", 3, "memory-external");

  for (const repo of githubRepos.slice(0, 36)) {
    const repoName = repo.name || repo.full_name || repo.id;
    if (!repoName) continue;
    const repoId = `repo:${slugify(repo.full_name || repoName)}`;
    addNode({
      id: repoId,
      label: repoName,
      type: "repo",
      cluster: "cloud-auth",
      weight: Number(repo.size || 1) + 1,
      detail: repo.full_name || "GitHub repo",
      url: repo.html_url || ""
    });
    addEdge("external:github", repoId, 1, "github-repo");
    const localProject = selectedProjects.find((project) => {
      return project.remote && (project.remote.includes(`/${repoName}.git`) || project.remote.includes(`/${repoName}`));
    });
    if (localProject) addEdge(`project:${localProject.id}`, repoId, 4, "project-repo");
  }

  const gcloudProjects = Array.isArray(external.gcloud?.projects) ? external.gcloud.projects : [];
  addNode({
    id: "external:gcloud",
    label: "GCloud",
    type: "external",
    cluster: "cloud-auth",
    weight: Math.max(1, gcloudProjects.length),
    detail: `${gcloudProjects.length} Google Cloud projects`
  });
  addEdge("external:gcloud", "tag:gcloud", 4, "external-tag");
  addEdge("memory:lens", "external:gcloud", 3, "memory-external");
  for (const project of gcloudProjects) {
    const projectId = project.projectId || project.name;
    if (!projectId) continue;
    const cloudId = `gcloud:${slugify(projectId)}`;
    addNode({
      id: cloudId,
      label: projectId,
      type: "cloud",
      cluster: "cloud-auth",
      weight: 10,
      detail: project.name || "Google Cloud project"
    });
    addEdge("external:gcloud", cloudId, 2, "gcloud-project");
    if (String(projectId).includes("llm-knowledge-bases")) addEdge(cloudId, "tag:firebase", 3, "cloud-tag");
  }

  const firebaseProjects = Array.isArray(external.firebase?.projects) ? external.firebase.projects : [];
  addNode({
    id: "external:firebase",
    label: "Firebase",
    type: "external",
    cluster: "cloud-auth",
    weight: Math.max(1, firebaseProjects.length),
    detail: `${firebaseProjects.length} Firebase projects`
  });
  addEdge("external:firebase", "tag:firebase", 4, "external-tag");
  addEdge("memory:lens", "external:firebase", 3, "memory-external");
  for (const project of firebaseProjects) {
    const projectId = project.projectId || project.displayName || project.name;
    if (!projectId) continue;
    const firebaseId = `firebase:${slugify(projectId)}`;
    addNode({
      id: firebaseId,
      label: project.displayName || projectId,
      type: "firebase",
      cluster: "cloud-auth",
      weight: 12,
      detail: project.projectId || "Firebase project"
    });
    addEdge("external:firebase", firebaseId, 2, "firebase-project");
    if (String(projectId).includes("llm-knowledge-bases")) addEdge(firebaseId, "tag:llm", 3, "cloud-tag");
  }

  const linkedNodeIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  return {
    generatedAt: new Date().toISOString(),
    clusters: graphClusters,
    nodes: nodes.filter((node) => linkedNodeIds.has(node.id) || node.type === "project"),
    edges,
    counts: {
      projects: selectedProjects.length,
      tags: topTags.length,
      clusters: graphClusters.length,
      raw: includedRaw,
      sessions: includedSessions,
      repos: githubRepos.length,
      gcloudProjects: gcloudProjects.length,
      firebaseProjects: firebaseProjects.length,
      totalFiles: files.length,
      totalCodexSessions: codexSessions.length,
      totalClaudeSessions: claudeSessions.length
    }
  };
}

function writeTagCloud(db) {
  const graph = buildGraphData(db.tags, db.projects, db.external, db.files, db.codexSessions, db.claudeSessions);
  const graphJson = JSON.stringify(graph).replaceAll("<", "\\u003c");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Global Work Tag Graph</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #202120;
      --panel: rgba(25, 26, 25, 0.76);
      --panel-strong: rgba(20, 21, 20, 0.92);
      --panel-border: rgba(255, 255, 255, 0.1);
      --text: #efefec;
      --muted: #a7aaa7;
      --line: rgba(210, 210, 205, 0.13);
    }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; }
    body {
      margin: 0;
      overflow: hidden;
      font: 13px/1.4 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    canvas {
      width: 100vw;
      height: 100vh;
      display: block;
      background:
        radial-gradient(circle at 36% 47%, rgba(66,66,64,0.72) 0, rgba(46,47,45,0.84) 32%, rgba(34,35,34,1) 68%),
        #202120;
    }
    .panel {
      position: fixed;
      z-index: 2;
      border: 1px solid var(--panel-border);
      border-radius: 10px;
      background: var(--panel);
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.24);
      backdrop-filter: blur(12px);
    }
    .topbar {
      left: 16px;
      top: 16px;
      display: flex;
      max-width: calc(100vw - 32px);
      align-items: center;
      gap: 8px;
      padding: 8px;
    }
    .title {
      min-width: 260px;
      padding: 0 8px;
    }
    .title strong { display: block; font-size: 13px; letter-spacing: 0; }
    .title span { display: block; color: var(--muted); font-size: 11px; white-space: nowrap; }
    input {
      width: min(31vw, 340px);
      min-width: 180px;
      height: 34px;
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 8px;
      background: rgba(255,255,255,0.08);
      color: var(--text);
      padding: 0 11px;
      outline: none;
    }
    button {
      height: 34px;
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 8px;
      background: rgba(255,255,255,0.08);
      color: var(--text);
      font: inherit;
      padding: 0 12px;
      cursor: pointer;
    }
    button:hover,
    button:focus-visible,
    input:focus {
      border-color: rgba(255,255,255,0.34);
      outline: none;
    }
    .cluster-rail {
      right: 16px;
      top: 82px;
      display: flex;
      width: min(210px, calc(100vw - 32px));
      flex-direction: column;
      gap: 6px;
      padding: 8px;
      background: rgba(25, 26, 25, 0.52);
    }
    .cluster-button {
      height: 30px;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      color: var(--muted);
      padding: 0 9px;
    }
    .cluster-button.is-active {
      color: var(--text);
      background: rgba(255,255,255,0.13);
    }
    .swatch { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .inspector {
      right: 16px;
      top: 16px;
      display: grid;
      width: min(400px, calc(100vw - 32px));
      max-height: calc(100vh - 32px);
      grid-template-rows: auto minmax(0, 1fr);
      overflow: hidden;
      background: var(--panel-strong);
    }
    .inspector[hidden] { display: none; }
    .inspector-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid var(--line);
      padding: 14px 14px 10px;
    }
    .inspector-body {
      padding: 14px;
      overflow: auto;
    }
    .eyebrow {
      margin: 0;
      color: var(--muted);
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .inspector h2 {
      margin: 2px 0 5px;
      font-size: 19px;
      line-height: 1.12;
      letter-spacing: 0;
    }
    .inspector p { margin: 8px 0 0; color: var(--muted); }
    .inspector code {
      display: block;
      white-space: pre-wrap;
      word-break: break-word;
      margin-top: 10px;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 7px;
      background: rgba(255,255,255,0.05);
      color: #d8d8d8;
      font-size: 12px;
      padding: 8px;
    }
    .close-button {
      width: 32px;
      min-width: 32px;
      padding: 0;
      color: var(--muted);
    }
    .meta-row,
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }
    .meta-row span,
    .chips span {
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 999px;
      padding: 3px 8px;
      color: #cfcfcf;
      font-size: 12px;
    }
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 14px;
    }
    .actions button { width: 100%; }
    .related {
      display: grid;
      gap: 6px;
      margin-top: 14px;
    }
    .related button {
      height: auto;
      min-height: 34px;
      text-align: left;
      padding: 8px 9px;
      color: var(--muted);
    }
    .related strong {
      display: block;
      color: var(--text);
      font-size: 12px;
      font-weight: 650;
    }
    .related span { display: block; font-size: 11px; }
    .analysis-result {
      margin-top: 12px;
      border: 1px solid rgba(120, 221, 196, 0.22);
      border-radius: 8px;
      background: rgba(120, 221, 196, 0.07);
      padding: 10px;
    }
    .analysis-result a {
      display: inline-flex;
      min-height: 32px;
      align-items: center;
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 8px;
      color: var(--text);
      text-decoration: none;
      padding: 0 10px;
      margin-top: 8px;
    }
    .file-preview {
      max-height: 260px;
      overflow: auto;
      margin-top: 12px;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      background: rgba(0,0,0,0.22);
      color: #deded8;
      font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      white-space: pre-wrap;
      padding: 10px;
    }
    .file-preview[hidden] { display: none; }
    .tooltip {
      position: fixed;
      z-index: 3;
      pointer-events: none;
      display: none;
      max-width: 280px;
      transform: translate(12px, 12px);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 7px;
      background: rgba(12,12,12,0.88);
      color: #f0f0f0;
      padding: 6px 8px;
    }
    .status-toast {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 4;
      display: none;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 9px;
      background: rgba(12,12,12,0.9);
      color: #f0f0f0;
      padding: 9px 11px;
    }
    @media (max-width: 760px) {
      .topbar { right: 12px; left: 12px; top: 12px; flex-wrap: wrap; }
      .title { width: 100%; }
      input { width: calc(100vw - 176px); min-width: 0; }
      .cluster-rail { left: 12px; right: 12px; top: auto; bottom: 12px; width: auto; max-height: 112px; overflow: auto; }
      .inspector { inset: auto 12px 12px; top: auto; width: auto; max-height: min(58vh, 520px); }
    }
  </style>
</head>
<body>
<canvas id="graph"></canvas>
<div class="panel topbar">
  <div class="title"><strong>Global Work Tag Graph</strong><span>${graph.counts.clusters} clusters · ${graph.nodes.length} visible nodes · ${graph.counts.totalFiles} files · ${graph.edges.length} links</span></div>
  <input id="search" type="search" placeholder="Search tag, cluster, project, repo">
  <button id="zoomOut" type="button" aria-label="Zoom out" title="Zoom out">-</button>
  <button id="zoomIn" type="button" aria-label="Zoom in" title="Zoom in">+</button>
  <button id="fit" type="button">Fit all</button>
  <button id="reset" type="button">Reset</button>
</div>
<nav class="panel cluster-rail" id="clusterRail" aria-label="Theme clusters"></nav>
<aside class="panel inspector" id="inspector" hidden>
  <div class="inspector-head">
    <div>
      <p class="eyebrow" id="inspectorType"></p>
      <h2 id="inspectorTitle"></h2>
    </div>
    <button class="close-button" id="closeInspector" type="button" aria-label="Close inspector">×</button>
  </div>
  <div class="inspector-body" id="inspectorBody"></div>
</aside>
<div class="tooltip" id="tooltip"></div>
<div class="status-toast" id="toast"></div>
<script>
const graph = ${graphJson};
const canvas = document.getElementById("graph");
const ctx = canvas.getContext("2d");
const tooltip = document.getElementById("tooltip");
const search = document.getElementById("search");
const reset = document.getElementById("reset");
const fit = document.getElementById("fit");
const zoomOut = document.getElementById("zoomOut");
const zoomIn = document.getElementById("zoomIn");
const inspector = document.getElementById("inspector");
const inspectorType = document.getElementById("inspectorType");
const inspectorTitle = document.getElementById("inspectorTitle");
const inspectorBody = document.getElementById("inspectorBody");
const closeInspector = document.getElementById("closeInspector");
const clusterRail = document.getElementById("clusterRail");
const toast = document.getElementById("toast");
const colors = {
  project: "#d4d4d1",
  tag: "#f1f1ee",
  repo: "#bdebd4",
  external: "#f0cf8a",
  cloud: "#f0cf8a",
  firebase: "#f3b67b",
  memory: "#ffffff",
  raw: "#a8aaa8",
  session: "#777b77",
  system: "#d2b7ff"
};
const MIN_ZOOM = 0.08;
const MAX_ZOOM = 3;
const FIT_MAX_ZOOM = 1.8;
const MOTION_AMPLITUDE = Math.PI / 180 * 2.6;
const MOTION_PERIOD_MS = 150000;
let width = 0;
let height = 0;
let scale = 1;
let zoom = 1;
let panX = 0;
let panY = 0;
let renderAngle = 0;
let lastMotionFrame = 0;
const motionEnabled = !window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
let hovered = null;
let selected = null;
let query = "";
let pointer = { x: 0, y: 0, inside: false };
let isDragging = false;
let dragStart = null;
let dragMoved = false;
let activeClusterId = "";
const clusterById = new Map((graph.clusters || []).map(function(cluster) { return [cluster.id, cluster]; }));
const orderedClusters = (graph.clusters || []).slice();
const clusterCenters = new Map();

function placeClusters() {
  const satelliteCount = Math.max(1, orderedClusters.length - 1);
  orderedClusters.forEach(function(cluster, index) {
    if (index === 0) {
      clusterCenters.set(cluster.id, { x: -0.16, y: 0.04 });
      return;
    }
    const angle = -Math.PI / 2 + (index - 1) * (Math.PI * 2 / satelliteCount);
    const radius = 0.47 + (index % 2) * 0.06;
    clusterCenters.set(cluster.id, { x: Math.cos(angle) * radius + 0.03, y: Math.sin(angle) * radius });
  });
  if (!clusterCenters.has("other-work")) clusterCenters.set("other-work", { x: 0.42, y: 0.38 });
}

function hashNumber(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function nodeSpread(node) {
  if (node.type === "cluster") return 0;
  if (node.type === "memory") return 0.018;
  if (node.type === "tag") return 0.085;
  if (node.type === "project") return 0.15;
  if (node.type === "raw") return 0.2;
  if (node.type === "session") return 0.23;
  return 0.18;
}

placeClusters();
const nodes = graph.nodes.map(function(node) {
  const center = clusterCenters.get(node.cluster) || clusterCenters.get("other-work") || { x: 0, y: 0 };
  const angle = hashNumber(node.id + ":angle") * Math.PI * 2;
  const spread = nodeSpread(node) * (0.45 + hashNumber(node.id + ":radius") * 0.85);
  const isCluster = node.type === "cluster";
  const isMemory = node.type === "memory";
  return Object.assign({}, node, {
    x: isCluster ? center.x : isMemory ? center.x - 0.015 : center.x + Math.cos(angle) * spread,
    y: isCluster ? center.y : isMemory ? center.y + 0.005 : center.y + Math.sin(angle) * spread,
    vx: 0,
    vy: 0,
    radius: radiusFor(node)
  });
});
const byId = new Map(nodes.map(function(node) { return [node.id, node]; }));
const edges = graph.edges.map(function(edge) {
  return Object.assign({}, edge, { source: byId.get(edge.source), target: byId.get(edge.target) });
}).filter(function(edge) { return edge.source && edge.target; });
const adjacency = new Map(nodes.map(function(node) { return [node.id, new Set()]; }));
for (const edge of edges) {
  adjacency.get(edge.source.id)?.add(edge.target.id);
  adjacency.get(edge.target.id)?.add(edge.source.id);
}
const connectedNodeIds = new Set(edges.flatMap(function(edge) { return [edge.source.id, edge.target.id]; }));

function radiusFor(node) {
  const weight = Math.max(1, Number(node.weight || 1));
  if (node.type === "memory") return 17;
  if (node.type === "cluster") return Math.min(28, 13 + Math.log10(weight + 1) * 3.4);
  if (node.type === "tag") return Math.min(16, 4.8 + Math.log10(weight + 1) * 3.6);
  if (node.type === "project") return Math.min(13, 4.2 + Math.log10(weight + 1) * 2.7);
  if (node.type === "raw" || node.type === "session") return 2.9;
  if (node.type === "system" || node.type === "external") return 10;
  return 5.5;
}

function resize() {
  const ratio = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;
  scale = Math.min(width, height) * 0.9;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
function rotatedWorld(node) {
  const cos = Math.cos(renderAngle);
  const sin = Math.sin(renderAngle);
  return {
    x: node.x * cos - node.y * sin,
    y: node.x * sin + node.y * cos
  };
}
function screenX(node) { return width / 2 + panX + rotatedWorld(node).x * scale * zoom; }
function screenY(node) { return height / 2 + panY + rotatedWorld(node).y * scale * zoom; }
function screenToWorld(x, y) {
  const rotatedX = (x - width / 2 - panX) / (scale * zoom);
  const rotatedY = (y - height / 2 - panY) / (scale * zoom);
  const cos = Math.cos(renderAngle);
  const sin = Math.sin(renderAngle);
  return {
    x: rotatedX * cos + rotatedY * sin,
    y: -rotatedX * sin + rotatedY * cos
  };
}
function publishGraphState() {
  document.documentElement.dataset.graphZoom = zoom.toFixed(4);
  document.documentElement.dataset.graphMinZoom = String(MIN_ZOOM);
  document.documentElement.dataset.graphMaxZoom = String(MAX_ZOOM);
  const bounds = graphBounds();
  if (bounds) {
    document.documentElement.dataset.graphBoundsLeft = String(Math.round(width / 2 + panX + bounds.minX * scale * zoom));
    document.documentElement.dataset.graphBoundsRight = String(Math.round(width / 2 + panX + bounds.maxX * scale * zoom));
    document.documentElement.dataset.graphBoundsTop = String(Math.round(height / 2 + panY + bounds.minY * scale * zoom));
    document.documentElement.dataset.graphBoundsBottom = String(Math.round(height / 2 + panY + bounds.maxY * scale * zoom));
  }
}
function graphBounds() {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const pad = node.type === "cluster" ? 0.5 : node.type === "tag" ? 0.2 : 0.1;
    minX = Math.min(minX, node.x - pad);
    maxX = Math.max(maxX, node.x + pad);
    minY = Math.min(minY, node.y - pad);
    maxY = Math.max(maxY, node.y + pad);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  const worldWidth = Math.max(0.2, maxX - minX);
  const worldHeight = Math.max(0.2, maxY - minY);
  return { minX, minY, maxX, maxY, worldWidth, worldHeight };
}
function fitToGraph() {
  const bounds = graphBounds();
  if (!bounds) return;
  const safe = { left: 28, top: 92, right: 228, bottom: 48 };
  const availableWidth = Math.max(360, width - safe.left - safe.right);
  const availableHeight = Math.max(300, height - safe.top - safe.bottom);
  const fittedZoom = Math.min(availableWidth / (bounds.worldWidth * scale), availableHeight / (bounds.worldHeight * scale));
  zoom = Math.max(MIN_ZOOM, Math.min(FIT_MAX_ZOOM, fittedZoom));
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const safeCenterX = safe.left + availableWidth / 2;
  const safeCenterY = safe.top + availableHeight / 2;
  panX = safeCenterX - width / 2 - centerX * scale * zoom;
  panY = safeCenterY - height / 2 - centerY * scale * zoom;
  publishGraphState();
}
function applyZoomAt(canvasX, canvasY, factor) {
  const before = screenToWorld(canvasX, canvasY);
  zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
  panX = canvasX - width / 2 - before.x * scale * zoom;
  panY = canvasY - height / 2 - before.y * scale * zoom;
  publishGraphState();
}
function magnifiedPosition(node) {
  const baseX = screenX(node);
  const baseY = screenY(node);
  if (!pointer.inside) return { x: baseX, y: baseY, amount: 0 };
  const dx = baseX - pointer.x;
  const dy = baseY - pointer.y;
  const distance = Math.hypot(dx, dy);
  const lensRadius = Math.min(170, Math.max(110, Math.min(width, height) * 0.14));
  if (distance > lensRadius) return { x: baseX, y: baseY, amount: 0 };
  const amount = Math.pow(1 - distance / lensRadius, 2);
  return {
    x: pointer.x + dx * (1 + 0.95 * amount),
    y: pointer.y + dy * (1 + 0.95 * amount),
    amount
  };
}

function tick() {
  for (const node of nodes) {
    const center = clusterCenters.get(node.cluster) || clusterCenters.get("other-work") || { x: 0, y: 0 };
    if (node.type === "cluster") {
      node.vx += (center.x - node.x) * 0.08;
      node.vy += (center.y - node.y) * 0.08;
      continue;
    }
    if (node.type === "memory") {
      node.vx += (center.x - 0.015 - node.x) * 0.05;
      node.vy += (center.y + 0.005 - node.y) * 0.05;
      continue;
    }
    const attraction = node.type === "tag" ? 0.006 : node.type === "project" ? 0.0045 : 0.003;
    node.vx += (center.x - node.x) * attraction;
    node.vy += (center.y - node.y) * attraction;
  }
  for (const edge of edges) {
    const dx = edge.target.x - edge.source.x;
    const dy = edge.target.y - edge.source.y;
    const distance = Math.max(0.001, Math.hypot(dx, dy));
    const ideal = edge.type === "cluster-tag" ? 0.09 : edge.type === "cluster-project" ? 0.14 : edge.type === "project-tag" ? 0.095 : edge.type === "project-raw" ? 0.075 : edge.type === "raw-tag" ? 0.1 : edge.type === "system-session" ? 0.12 : edge.type === "project-repo" ? 0.16 : 0.19;
    const force = (distance - ideal) * 0.01 * Math.min(4, edge.weight || 1);
    const fx = dx / distance * force;
    const fy = dy / distance * force;
    edge.source.vx += fx;
    edge.source.vy += fy;
    edge.target.vx -= fx;
    edge.target.vy -= fy;
  }
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy + 0.001;
      const sameCluster = a.cluster && a.cluster === b.cluster;
      const force = (sameCluster ? 0.000015 : 0.000024) * (a.radius + b.radius) / d2;
      a.vx -= dx * force;
      a.vy -= dy * force;
      b.vx += dx * force;
      b.vy += dy * force;
    }
  }
  for (const node of nodes) {
    node.vx *= 0.86;
    node.vy *= 0.86;
    node.x += node.vx;
    node.y += node.vy;
  }
}

function isMatched(node) {
  if (!query) return false;
  const text = [node.label, node.detail, node.path, node.remote, node.url, node.cluster, clusterById.get(node.cluster)?.label, (node.tags || []).join(" ")].join(" ").toLowerCase();
  return text.includes(query);
}
function focusedNodeIds() {
  const focus = selected || hovered;
  const ids = new Set();
  if (activeClusterId) {
    for (const node of nodes) if (node.cluster === activeClusterId) ids.add(node.id);
  }
  if (focus) {
    ids.add(focus.id);
    if (focus.type === "cluster") {
      for (const node of nodes) if (node.cluster === focus.cluster) ids.add(node.id);
    }
    for (const relatedId of adjacency.get(focus.id) || []) ids.add(relatedId);
  }
  if (query) {
    for (const node of nodes) {
      if (isMatched(node)) {
        ids.add(node.id);
        for (const relatedId of adjacency.get(node.id) || []) ids.add(relatedId);
      }
    }
  }
  return ids;
}
function nodeActive(node, ids) {
  if (!ids.size) return true;
  return ids.has(node.id);
}
function edgeActive(edge, ids) {
  if (!ids.size) return true;
  return ids.has(edge.source.id) || ids.has(edge.target.id);
}
function clusterActive(clusterId, ids) {
  if (!ids.size) return true;
  if (activeClusterId && clusterId === activeClusterId) return true;
  for (const node of nodes) {
    if (node.cluster === clusterId && ids.has(node.id)) return true;
  }
  return false;
}
function connectionPointActive(node, ids) {
  if (selected === node || hovered === node || isMatched(node)) return true;
  if (node.type === "cluster") return clusterActive(node.cluster, ids);
  return nodeActive(node, ids);
}
function connectionPointRadius(node, position, active) {
  const lensBoost = 1 + position.amount * 1.35;
  if (node.type === "cluster") return (active ? 5.2 : 4.2) * lensBoost;
  if (node.type === "raw" || node.type === "session") return (active ? 3.7 : 3.1) * lensBoost;
  if (node.type === "tag") return Math.max(3.7, Math.min(7.2, node.radius * 0.52)) * lensBoost;
  return Math.max(3.4, Math.min(6.2, node.radius * 0.48)) * lensBoost;
}
function drawConnectionPoints(activeIds) {
  for (const node of nodes) {
    if (!connectedNodeIds.has(node.id)) continue;
    const active = connectionPointActive(node, activeIds);
    const dim = activeIds.size && !active;
    const pos = magnifiedPosition(node);
    const radius = connectionPointRadius(node, pos, active);
    const color = node.color || colors[node.type] || "#d5d5d0";
    ctx.globalAlpha = dim ? 0.22 : active ? 0.98 : 0.74;
    ctx.fillStyle = node.type === "cluster" ? "rgba(238,238,232,0.88)" : color;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = dim ? 0.16 : active ? 0.6 : 0.34;
    ctx.strokeStyle = "rgba(255,255,255,0.72)";
    ctx.lineWidth = node.type === "cluster" ? 1.2 : 0.8;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius + (node.type === "cluster" ? 3.8 : 2.2), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function draw(runLayout = true) {
  if (runLayout) tick();
  ctx.clearRect(0, 0, width, height);
  const activeIds = focusedNodeIds();

  for (const clusterNode of nodes.filter(function(node) { return node.type === "cluster"; })) {
    const cluster = clusterById.get(clusterNode.cluster) || {};
    const pos = magnifiedPosition(clusterNode);
    const active = clusterActive(clusterNode.cluster, activeIds);
    const halo = (72 + Math.min(120, Math.log10(Math.max(10, clusterNode.weight || 1)) * 45)) * zoom;
    const color = cluster.color || clusterNode.color || "#cccccc";
    const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, halo);
    gradient.addColorStop(0, color + (active ? "38" : "18"));
    gradient.addColorStop(0.58, color + (active ? "18" : "08"));
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, halo, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = active ? "rgba(235,235,230,0.22)" : "rgba(210,210,205,0.08)";
    ctx.lineWidth = active ? 1.2 : 0.8;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, halo * 0.68, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = active ? "650 13px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" : "12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.fillStyle = active ? "rgba(242,242,238,0.86)" : "rgba(220,220,216,0.46)";
    ctx.fillText(clusterNode.label, pos.x - halo * 0.34, pos.y - halo * 0.44);
  }

  ctx.lineWidth = 1;
  for (const edge of edges) {
    const active = edgeActive(edge, activeIds);
    const source = magnifiedPosition(edge.source);
    const target = magnifiedPosition(edge.target);
    ctx.strokeStyle = active ? "rgba(220,220,216,0.24)" : "rgba(190,190,186,0.045)";
    ctx.globalAlpha = active ? 1 : 0.62;
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  drawConnectionPoints(activeIds);

  for (const node of nodes) {
    if (node.type === "cluster") continue;
    const active = selected === node || hovered === node || isMatched(node) || nodeActive(node, activeIds);
    const dim = activeIds.size && !nodeActive(node, activeIds);
    const pos = magnifiedPosition(node);
    const lensBoost = 1 + pos.amount * 1.9;
    const selectBoost = selected === node ? 1.55 : hovered === node ? 1.38 : 1;
    const radius = node.radius * lensBoost * selectBoost * (node.type === "tag" && activeClusterId === node.cluster ? 1.18 : 1);
    const color = node.color || colors[node.type] || "#ccc";
    ctx.beginPath();
    ctx.fillStyle = dim ? "rgba(150,150,146,0.18)" : color;
    ctx.globalAlpha = selected === node || hovered === node ? 1 : dim ? 0.28 : node.type === "raw" || node.type === "session" ? 0.72 : 0.86;
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (node.type === "memory") {
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius + 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (selected === node || hovered === node || isMatched(node) || node.type === "tag" || node.type === "external" || node.type === "memory") {
      ctx.font = selected === node || hovered === node ? "650 13px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" : "12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
      ctx.fillStyle = dim ? "rgba(225,225,220,0.36)" : "rgba(242,242,238,0.82)";
      ctx.fillText(node.label.slice(0, 34), pos.x + radius + 7, pos.y + 4);
    }
  }

  if (pointer.inside) {
    const lensRadius = Math.min(170, Math.max(110, Math.min(width, height) * 0.14));
    ctx.strokeStyle = "rgba(255,255,255,0.11)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, lensRadius, 0, Math.PI * 2);
    ctx.stroke();
  }
}
let drawPending = false;
function scheduleDraw() {
  if (drawPending) return;
  drawPending = true;
  requestAnimationFrame(function() {
    drawPending = false;
    draw(true);
  });
}

function animateGraph(timestamp) {
  if (motionEnabled && !document.hidden && timestamp - lastMotionFrame > 80) {
    lastMotionFrame = timestamp;
    renderAngle = Math.sin((timestamp / MOTION_PERIOD_MS) * Math.PI * 2) * MOTION_AMPLITUDE;
    draw(false);
  }
  requestAnimationFrame(animateGraph);
}

function nearestNode(event) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  let best = null;
  let bestDistance = Infinity;
  for (const node of nodes) {
    const pos = magnifiedPosition(node);
    const dx = pos.x - x;
    const dy = pos.y - y;
    const distance = Math.hypot(dx, dy);
    const hitRadius = node.type === "cluster" ? Math.max(22, node.radius + 8) : Math.max(10, node.radius + 6 + pos.amount * 18);
    if (distance < hitRadius && distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }
  return best;
}
function relatedNodes(node) {
  const ids = new Set(adjacency.get(node.id) || []);
  if (node.type === "cluster") {
    for (const item of nodes) if (item.cluster === node.cluster && item.id !== node.id) ids.add(item.id);
  }
  return [...ids].map(function(id) { return byId.get(id); }).filter(Boolean).sort(function(left, right) {
    const rank = { cluster: 6, tag: 5, project: 4, external: 3, repo: 2, raw: 1, session: 1 };
    return (rank[right.type] || 0) - (rank[left.type] || 0) || Number(right.weight || 0) - Number(left.weight || 0);
  });
}
function clusterName(clusterId) {
  return clusterById.get(clusterId)?.label || clusterId || "Unclustered";
}
function shellQuote(value) {
  return "'" + String(value || "").replaceAll("'", "'\\\\''") + "'";
}
function analysisCommand(node) {
  if (node.type === "cluster") return "npm run workdb -- analyze-cluster " + shellQuote(node.cluster);
  if (node.type === "tag") return "npm run workdb -- analyze-tag " + shellQuote(node.label);
  if (node.type === "project") return "npm run workdb -- project " + shellQuote(node.label);
  return "npm run workdb -- search " + shellQuote(node.label);
}
function analysisPayload(node) {
  if (node.type === "cluster") return { kind: "cluster", id: node.cluster, limit: 30 };
  if (node.type === "tag") return { kind: "tag", id: node.label, limit: 30 };
  return null;
}
function contextQuery(node) {
  if (node.type === "cluster") return clusterName(node.cluster);
  if (node.type === "tag") return node.label;
  return [node.label, node.path, ...(node.tags || [])].filter(Boolean).join(" ");
}
function nodeTarget(node) {
  return node.id || node.path || node.label;
}
function renderDetails(node) {
  if (!node) return;
  inspector.hidden = false;
  inspectorType.textContent = node.type + (node.cluster ? " · " + clusterName(node.cluster) : "");
  inspectorTitle.textContent = node.label;
  const related = relatedNodes(node).slice(0, 12);
  const chips = (node.tags || []).slice(0, 18).map(function(tag) { return "<span>" + escapeHtml(tag) + "</span>"; }).join("");
  const command = analysisCommand(node);
  const payload = analysisPayload(node);
  const hasPath = Boolean(node.path);
  const totals = [
    node.fileCount ? node.fileCount + " files" : "",
    node.sessionCount ? node.sessionCount + " sessions" : "",
    node.totalRecords ? node.totalRecords + " records" : ""
  ].filter(Boolean);
  inspectorBody.innerHTML = ""
    + "<p>" + escapeHtml(node.detail || "") + "</p>"
    + "<div class=\\"meta-row\\">"
    + "<span>" + escapeHtml(node.type) + "</span>"
    + (node.weight ? "<span>weight " + escapeHtml(Math.round(node.weight)) + "</span>" : "")
    + (node.cluster ? "<span>" + escapeHtml(clusterName(node.cluster)) + "</span>" : "")
    + totals.map(function(item) { return "<span>" + escapeHtml(item) + "</span>"; }).join("")
    + "</div>"
    + (node.path ? "<code>" + escapeHtml(node.path) + "</code>" : "")
    + (node.remote ? "<code>" + escapeHtml(node.remote) + "</code>" : "")
    + (node.url ? "<code>" + escapeHtml(node.url) + "</code>" : "")
    + (chips ? "<div class=\\"chips\\">" + chips + "</div>" : "")
    + "<div class=\\"actions\\">"
    + "<button type=\\"button\\" data-action=\\"focus\\">Focus graph</button>"
    + "<button type=\\"button\\" data-action=\\"run-context\\">Context</button>"
    + (payload ? "<button type=\\"button\\" data-action=\\"run-analysis\\">Run analysis</button>" : "<button type=\\"button\\" data-action=\\"copy\\">Copy command</button>")
    + (hasPath ? "<button type=\\"button\\" data-action=\\"preview-file\\">Preview</button><button type=\\"button\\" data-action=\\"reveal-file\\">Reveal in Finder</button>" : "")
    + "</div>"
    + "<code>" + escapeHtml(command) + "</code>"
    + "<pre class=\\"file-preview\\" data-file-preview hidden></pre>"
    + (related.length ? "<div class=\\"related\\">" + related.map(function(item) {
        return "<button type=\\"button\\" data-node-id=\\"" + escapeHtml(item.id) + "\\"><strong>" + escapeHtml(item.label) + "</strong><span>" + escapeHtml(item.type + " · " + (item.detail || clusterName(item.cluster))) + "</span></button>";
      }).join("") + "</div>" : "");
  inspectorBody.querySelector("[data-action='focus']")?.addEventListener("click", function() {
    focusNode(node);
  });
  inspectorBody.querySelector("[data-action='copy']")?.addEventListener("click", function() {
    copyText(command);
  });
  inspectorBody.querySelector("[data-action='run-analysis']")?.addEventListener("click", function() {
    runAnalysisFromGraph(payload, command);
  });
  inspectorBody.querySelector("[data-action='run-context']")?.addEventListener("click", function() {
    runContextFromGraph(contextQuery(node));
  });
  inspectorBody.querySelector("[data-action='preview-file']")?.addEventListener("click", function() {
    previewFileFromGraph(nodeTarget(node));
  });
  inspectorBody.querySelector("[data-action='reveal-file']")?.addEventListener("click", function() {
    revealFileFromGraph(nodeTarget(node));
  });
  inspectorBody.querySelectorAll("[data-node-id]").forEach(function(button) {
    button.addEventListener("click", function() {
      const next = byId.get(button.dataset.nodeId);
      if (next) {
        selected = next;
        activeClusterId = next.type === "cluster" ? next.cluster : activeClusterId;
        renderDetails(next);
        updateClusterRail();
      }
    });
  });
}
function escapeHtml(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function copyText(value) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value).then(function() { showToast("Command copied"); }).catch(function() { showToast("Copy failed"); });
  } else {
    showToast("Copy unavailable in this browser");
  }
}
async function runAnalysisFromGraph(payload, fallbackCommand) {
  if (!payload) return copyText(fallbackCommand);
  showToast("Running analysis...");
  const previousResult = inspectorBody.querySelector(".analysis-result");
  if (previousResult) previousResult.remove();
  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Analysis failed");
    showToast("Analysis report ready");
    const link = result.url || result.relativePath;
    const resultBox = document.createElement("div");
    resultBox.className = "analysis-result";
    resultBox.innerHTML = "<strong>Analysis ready</strong>"
      + "<p>" + escapeHtml(result.files + " files · " + result.projects + " projects · " + result.sessions + " sessions") + "</p>"
      + (link ? "<a href=\\"" + escapeHtml(link) + "\\" target=\\"_blank\\" rel=\\"noopener\\">Open report</a>" : "");
    inspectorBody.prepend(resultBox);
  } catch (error) {
    showToast("Run npm run workdb -- serve to enable in-graph analysis");
    copyText(fallbackCommand);
  }
}
async function runContextFromGraph(queryText) {
  const queryValue = String(queryText || "").trim();
  if (!queryValue) return;
  showToast("Building context...");
  const previousResult = inspectorBody.querySelector(".analysis-result");
  if (previousResult) previousResult.remove();
  try {
    const response = await fetch("/api/context?format=json&limit=12&q=" + encodeURIComponent(queryValue));
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Context failed");
    const resultBox = document.createElement("div");
    resultBox.className = "analysis-result";
    resultBox.innerHTML = "<strong>Context ready</strong>"
      + "<p>" + escapeHtml(queryValue) + "</p>"
      + "<button type=\\"button\\" data-action=\\"copy-context\\">Copy context</button>";
    resultBox.querySelector("[data-action='copy-context']")?.addEventListener("click", function() {
      copyText(result.markdown || "");
    });
    inspectorBody.prepend(resultBox);
    showToast("Context ready");
  } catch (error) {
    copyText("npm run workdb -- context " + shellQuote(queryValue));
    showToast("Run npm run workdb -- serve to enable context API");
  }
}
async function previewFileFromGraph(target) {
  const preview = inspectorBody.querySelector("[data-file-preview]");
  if (!preview) return;
  showToast("Loading preview...");
  try {
    const response = await fetch("/api/file?id=" + encodeURIComponent(target));
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Preview failed");
    preview.hidden = false;
    preview.textContent = result.content
      ? result.content.slice(0, 22000)
      : "No preview content available. This item may be a directory, sensitive, binary, too large, or metadata-only.";
    showToast("Preview ready");
  } catch (error) {
    copyText("npm run workdb -- show " + shellQuote(target));
    showToast("Preview API unavailable; command copied");
  }
}
async function revealFileFromGraph(target) {
  showToast("Revealing in Finder...");
  try {
    const response = await fetch("/api/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: target, mode: "reveal" })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Reveal failed");
    showToast("Revealed in Finder");
  } catch (error) {
    copyText("npm run workdb -- show " + shellQuote(target));
    showToast("Reveal API unavailable; command copied");
  }
}
function showToast(message) {
  toast.textContent = message;
  toast.style.display = "block";
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(function() { toast.style.display = "none"; }, 1800);
}
function focusNode(node) {
  selected = node;
  activeClusterId = node.type === "cluster" ? node.cluster : node.cluster || "";
  const center = node.type === "cluster" ? node : byId.get("cluster:" + node.cluster) || node;
  zoom = Math.max(1.08, Math.min(FIT_MAX_ZOOM, zoom));
  panX = -center.x * scale * zoom;
  panY = -center.y * scale * zoom;
  publishGraphState();
  updateClusterRail();
  scheduleDraw();
}
window.__workGraphDebug = {
  getState: function() {
    const bounds = graphBounds();
    return {
      width,
      height,
      scale,
      zoom,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      panX,
      panY,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      clusterCount: orderedClusters.length,
      worldWidth: bounds ? bounds.worldWidth : 0,
      worldHeight: bounds ? bounds.worldHeight : 0
    };
  },
  fitAll: function() {
    fitToGraph();
    scheduleDraw();
    return this.getState();
  },
  zoomOut: function() {
    applyZoomAt(width / 2, height / 2, 0.7);
    scheduleDraw();
    return this.getState();
  }
};
function updateClusterRail() {
  clusterRail.querySelectorAll("[data-cluster-id]").forEach(function(button) {
    button.classList.toggle("is-active", button.dataset.clusterId === activeClusterId);
  });
}
function renderClusterRail() {
  clusterRail.innerHTML = orderedClusters.map(function(cluster) {
    return "<button class=\\"cluster-button\\" type=\\"button\\" data-cluster-id=\\"" + escapeHtml(cluster.id) + "\\"><span class=\\"swatch\\" style=\\"background:" + escapeHtml(cluster.color || "#aaa") + "\\"></span>" + escapeHtml(cluster.label) + "</button>";
  }).join("");
  clusterRail.querySelectorAll("[data-cluster-id]").forEach(function(button) {
    button.addEventListener("click", function() {
      const clusterId = button.dataset.clusterId;
      const clusterNode = byId.get("cluster:" + clusterId);
      activeClusterId = activeClusterId === clusterId ? "" : clusterId;
      selected = clusterNode || null;
      if (selected) {
        focusNode(selected);
        renderDetails(selected);
      } else {
        inspector.hidden = true;
      }
      updateClusterRail();
      scheduleDraw();
    });
  });
}

canvas.addEventListener("mousemove", function(event) {
  const rect = canvas.getBoundingClientRect();
  pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top, inside: true };
  if (isDragging && dragStart) {
    if (Math.abs(event.clientX - dragStart.x) > 3 || Math.abs(event.clientY - dragStart.y) > 3) dragMoved = true;
    panX = dragStart.panX + event.clientX - dragStart.x;
    panY = dragStart.panY + event.clientY - dragStart.y;
    tooltip.style.display = "none";
    scheduleDraw();
    return;
  }
  hovered = nearestNode(event);
  if (hovered) {
    tooltip.style.display = "block";
    tooltip.style.left = event.clientX + "px";
    tooltip.style.top = event.clientY + "px";
    tooltip.textContent = hovered.label + (hovered.detail ? " · " + hovered.detail : "") + (hovered.cluster ? " · " + clusterName(hovered.cluster) : "");
    canvas.style.cursor = "pointer";
  } else {
    tooltip.style.display = "none";
    canvas.style.cursor = isDragging ? "grabbing" : "grab";
  }
  scheduleDraw();
});
canvas.addEventListener("mouseleave", function() {
  pointer.inside = false;
  hovered = null;
  tooltip.style.display = "none";
  scheduleDraw();
});
canvas.addEventListener("mousedown", function(event) {
  isDragging = true;
  dragStart = { x: event.clientX, y: event.clientY, panX, panY };
  dragMoved = false;
  canvas.style.cursor = "grabbing";
});
window.addEventListener("mouseup", function() {
  isDragging = false;
  dragStart = null;
});
canvas.addEventListener("click", function(event) {
  if (dragMoved) {
    dragMoved = false;
    return;
  }
  selected = nearestNode(event);
  if (selected) {
    activeClusterId = selected.type === "cluster" ? selected.cluster : selected.cluster || activeClusterId;
    renderDetails(selected);
    updateClusterRail();
    scheduleDraw();
  }
});
canvas.addEventListener("dblclick", function(event) {
  const node = nearestNode(event);
  if (node) focusNode(node);
  scheduleDraw();
});
canvas.addEventListener("wheel", function(event) {
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const factor = event.deltaY > 0 ? 0.9 : 1.11;
  applyZoomAt(event.clientX - rect.left, event.clientY - rect.top, factor);
  scheduleDraw();
}, { passive: false });
search.addEventListener("input", function() {
  query = search.value.trim().toLowerCase();
  scheduleDraw();
});
reset.addEventListener("click", function() {
  selected = null;
  hovered = null;
  query = "";
  activeClusterId = "";
  search.value = "";
  inspector.hidden = true;
  fitToGraph();
  updateClusterRail();
  scheduleDraw();
});
fit.addEventListener("click", function() {
  fitToGraph();
  scheduleDraw();
});
zoomOut.addEventListener("click", function() {
  applyZoomAt(width / 2, height / 2, 0.72);
  scheduleDraw();
});
zoomIn.addEventListener("click", function() {
  applyZoomAt(width / 2, height / 2, 1.18);
  scheduleDraw();
});
closeInspector.addEventListener("click", function() {
  selected = null;
  inspector.hidden = true;
  scheduleDraw();
});
window.addEventListener("resize", function() {
  resize();
  fitToGraph();
  scheduleDraw();
});
resize();
renderClusterRail();
for (let i = 0; i < 340; i += 1) tick();
fitToGraph();
draw(true);
requestAnimationFrame(animateGraph);
</script>
</body>
</html>`;
  writeFileSync(join(outputRoot, "tag-cloud.html"), html, "utf8");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function writeRawRegistry(files) {
  const rows = files.map((file) => ({
    id: file.id,
    title: file.title,
    path: file.path,
    relativePath: file.relativePath,
    sourceRoot: file.sourceRoot,
    sourceLabel: file.sourceLabel,
    kind: file.extension || "file",
    size: file.size,
    updatedAt: file.updatedAt,
    sensitive: file.sensitive,
    tags: file.tags || [],
    processingStatus: "indexed",
    compileStatus: file.compileStatus || compileStatusForFile(file),
    provenance: "extracted"
  }));
  writeFileSync(rawRegistryPath, lineDelimited(rows), "utf8");
}

function writeChronology(files, codexSessions, claudeSessions) {
  const rows = [
    ...files.map((file) => ({
      id: `file:${file.id}`,
      kind: "raw-file",
      title: file.title,
      path: file.path,
      sourceRoot: file.sourceRoot,
      updatedAt: file.updatedAt,
      sensitive: file.sensitive,
      compileStatus: file.compileStatus || compileStatusForFile(file),
      provenance: "extracted",
      tags: file.tags || []
    })),
    ...codexSessions.map((session) => ({
      id: `codex:${session.id}`,
      kind: "codex-session",
      title: session.title,
      updatedAt: session.updatedAt,
      provenance: "extracted",
      tags: session.tags || []
    })),
    ...claudeSessions.map((session) => ({
      id: `claude:${session.id}`,
      kind: "claude-session",
      title: session.title,
      path: session.path,
      updatedAt: session.updatedAt,
      provenance: "extracted",
      tags: session.tags || []
    }))
  ].sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
  writeFileSync(chronologyPath, lineDelimited(rows), "utf8");
}

function writeCatalog(db) {
  const topProjects = db.projects
    .filter((project) => project.fileCount > 0 || project.remote)
    .sort((left, right) => right.fileCount - left.fileCount)
    .slice(0, 32);
  const topTags = db.tags.slice(0, 32);
  const externalCounts = db.counts;

  const lines = [
    "# Global Work Master Catalog",
    "",
    `Generated: ${db.generatedAt}`,
    "",
    "## What This Is",
    "",
    "This is the current local work-memory catalog for Codex, Claude, local project files, local memories, skills, GitHub, GCloud, and Firebase inventory.",
    "",
    "Provenance: `extracted` rows come from file metadata, safe snippets, local session indexes, or external CLI inventories. Project/theme grouping in this catalog is `inferred` from paths, remotes, tags, and counts.",
    "",
    "## Entry Points",
    "",
    `- Raw registry: ${relative(root, rawRegistryPath)}`,
    `- Chronology log: ${relative(root, chronologyPath)}`,
    `- File search index: ${relative(root, filesPath)}`,
    `- Project index: ${relative(root, projectsPath)}`,
    `- Session index: ${relative(root, sessionsPath)}`,
    `- Visual graph: ${relative(root, join(outputRoot, "tag-cloud.html"))}`,
    `- Provenance policy: ${relative(root, provenancePath)}`,
    "",
    "## Counts",
    "",
    `- Projects: ${externalCounts.projects}`,
    `- Files: ${externalCounts.files}`,
    `- Codex sessions: ${externalCounts.codexSessions}`,
    `- Claude session/task files: ${externalCounts.claudeSessions}`,
    `- Tags: ${externalCounts.tags}`,
    `- GitHub repos: ${externalCounts.githubRepos}`,
    `- GCloud projects: ${externalCounts.gcloudProjects}`,
    `- Firebase projects: ${externalCounts.firebaseProjects}`,
    "",
    "## Top Work Themes",
    "",
    ...topTags.map((item) => `- ${item.tag}: ${item.count} records (provenance: extracted tag count)`),
    "",
    "## Project Clusters",
    "",
    ...topProjects.map((project) => {
      const tags = (project.tags || []).filter((tag) => topTags.some((item) => item.tag === tag)).slice(0, 8);
      const remote = project.remote ? `; remote ${project.remote}` : "";
      return `- ${project.name}: ${project.fileCount} indexed files; tags ${tags.join(", ") || "none"}${remote} (provenance: inferred cluster)`;
    }),
    "",
    "## Useful CLI Queries",
    "",
    "- `npm run workdb -- stats`",
    "- `npm run workdb -- search \"query\" --limit 20`",
    "- `npm run workdb -- project \"project name\"`",
    "- `npm run workdb -- tags --limit 40`",
    "- `npm run workdb -- analyze-tag \"tag\"`",
    "- `npm run workdb -- analyze-cluster \"cluster-id\"`",
    "",
    "## Known Limits",
    "",
    "- This catalog is generated from local metadata and safe snippets; it is not a complete semantic digest of every private file.",
    "- Sensitive/config-like files are intentionally metadata-only.",
    "- Raw registry and chronology are rebuildable snapshots, not append-only audit logs.",
    "- Ambiguous claims should be promoted into explicit wiki pages only after source review."
  ];
  writeFileSync(catalogPath, `${lines.join("\n")}\n`, "utf8");
}

function writeProvenancePolicy() {
  const lines = [
    "# Provenance Policy",
    "",
    "## Layers",
    "",
    "- `raw`: source diary layer. Source files are kept as observed; raw-registry.jsonl and chronology.jsonl are rebuildable indexes over them.",
    "- `wiki/catalog`: living interpretation layer. It summarizes, groups, and links the raw material for agent use.",
    "",
    "## Labels",
    "",
    "- `extracted`: directly taken from file metadata, safe snippets, local indexes, or external inventory outputs.",
    "- `inferred`: generated grouping or interpretation based on extracted material.",
    "- `ambiguous`: conflicting or underspecified material that needs source review before promotion.",
    "",
    "## Rules",
    "",
    "- Never overwrite or reinterpret source raw files in place; regenerate derived indexes instead.",
    "- Do not treat inferred clusters as facts about the user or business without checking source files.",
    "- Keep sensitive files metadata-only and redact secrets from snippets.",
    "- Prefer `catalog.md`, `chronology.jsonl`, and CLI search before scanning raw files manually.",
    "- Promote useful answers back into wiki/vault pages only with explicit provenance labels."
  ];
  writeFileSync(provenancePath, `${lines.join("\n")}\n`, "utf8");
}

function writeSummary(db) {
  const lines = [
    "# Global Work Knowledge Base",
    "",
    `Generated: ${db.generatedAt}`,
    "",
    "## Counts",
    "",
    `- Projects: ${db.counts.projects}`,
    `- Files: ${db.counts.files}`,
    `- Codex sessions: ${db.counts.codexSessions}`,
    `- Claude session/task files: ${db.counts.claudeSessions}`,
    `- Tags: ${db.counts.tags}`,
    `- Theme clusters: ${themeClusters.length}`,
    "",
    "## Top Tags",
    "",
    ...db.tags.slice(0, 40).map((item) => `- ${item.tag}: ${item.count}`),
    "",
    "## Important Paths",
    "",
    `- JSON DB: ${relative(root, dbPath)}`,
    `- Files JSONL: ${relative(root, filesPath)}`,
    `- Projects JSONL: ${relative(root, projectsPath)}`,
    `- Sessions JSONL: ${relative(root, sessionsPath)}`,
    `- Raw registry: ${relative(root, rawRegistryPath)}`,
    `- Chronology log: ${relative(root, chronologyPath)}`,
    `- Master catalog: ${relative(root, catalogPath)}`,
    `- Provenance policy: ${relative(root, provenancePath)}`,
    `- Knowledge graph: ${relative(root, join(outputRoot, "tag-cloud.html"))}`,
    `- Analysis reports: ${relative(root, join(outputRoot, "analysis"))}`,
    "",
    "## Notes",
    "",
    "- Secret-looking files are indexed by metadata only and marked sensitive.",
    "- Generated dependency/build folders are skipped.",
    "- This database is local/private under outputs/ and is not committed to git."
  ];
  writeFileSync(join(outputRoot, "README.md"), `${lines.join("\n")}\n`, "utf8");
}

function build() {
  mkdirSync(outputRoot, { recursive: true });
  const files = collectFiles();
  const projects = collectProjects(files);
  const codexSessions = parseCodexSessions();
  const claudeSessions = parseClaudeSessionFiles();
  const external = loadExternalInventory();
  const tags = tagCounts([...files, ...projects, ...codexSessions, ...claudeSessions]);
  const db = {
    generatedAt: new Date().toISOString(),
    sources: sourceRoots,
    counts: {
      projects: projects.length,
      files: files.length,
      codexSessions: codexSessions.length,
      claudeSessions: claudeSessions.length,
      tags: tags.length,
      githubRepos: external.github?.repos?.length || 0,
      gcloudProjects: external.gcloud?.projects?.length || 0,
      firebaseProjects: external.firebase?.projects?.length || 0
    },
    projects,
    codexSessions,
    claudeSessions,
    external,
    tags
  };
  writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
  writeFileSync(filesPath, lineDelimited(files), "utf8");
  writeFileSync(projectsPath, lineDelimited(projects), "utf8");
  writeFileSync(sessionsPath, lineDelimited([...codexSessions.map((item) => ({ system: "codex", ...item })), ...claudeSessions.map((item) => ({ system: "claude", ...item }))]), "utf8");
  writeRawRegistry(files);
  writeChronology(files, codexSessions, claudeSessions);
  writeCatalog(db);
  writeProvenancePolicy();
  writeTagCloud({ ...db, files });
  writeSummary(db);
  console.log(`Built global work DB in ${relative(root, outputRoot)} with ${files.length} files and ${projects.length} projects.`);
}

function loadDb() {
  if (!existsSync(dbPath)) throw new Error("DB is missing. Run: npm run workdb -- build");
  return JSON.parse(readFileSync(dbPath, "utf8"));
}

function stats(flags) {
  const db = loadDb();
  if (flags.json) return console.log(JSON.stringify(db.counts, null, 2));
  console.log(`Generated: ${db.generatedAt}`);
  for (const [key, value] of Object.entries(db.counts)) console.log(`${key}: ${value}`);
}

function search(flags) {
  const query = flags._.join(" ").trim().toLowerCase();
  if (!query) throw new Error("Usage: npm run workdb -- search <query> [--limit 20]");
  const limit = Number(flags.limit || 20);
  const rows = searchIndex(query, { limit, includeSensitive: Boolean(flags["include-sensitive"]) });
  if (flags.json) return console.log(JSON.stringify(rows, null, 2));
  for (const row of rows) {
    console.log(`${Math.round(row.score)}\t${row.type}\t${row.sourceRoot || "db"}\t${row.relativePath || row.path}`);
    console.log(`  ${row.title}`);
    if (row.snippet) console.log(`  ${row.snippet}`);
  }
}

function context(flags) {
  const query = flags._.join(" ").trim();
  if (!query) throw new Error("Usage: npm run workdb -- context <query> [--limit 12] [--json]");
  const markdown = contextMarkdown(query, { limit: Number(flags.limit || 12) });
  if (flags.json) return console.log(JSON.stringify({ query, markdown }, null, 2));
  console.log(markdown);
}

function show(flags) {
  const target = flags._.join(" ").trim();
  if (!target) throw new Error("Usage: npm run workdb -- show <graph-id|id|path> [--json]");
  const preview = previewIndexedTarget(target);
  if (flags.json) return console.log(JSON.stringify(preview, null, 2));
  console.log(`${preview.item.type}: ${preview.item.title}`);
  if (preview.item.path) console.log(`path: ${preview.item.path}`);
  console.log(`tags: ${preview.item.tags.join(", ") || "none"}`);
  console.log(`sensitive: ${preview.item.sensitive ? "yes" : "no"}`);
  if (preview.content) {
    console.log("");
    console.log(preview.content.slice(0, Number(flags.chars || 12000)));
  } else {
    console.log("No preview content available; item is a directory, sensitive, binary, too large, or metadata-only.");
  }
}

function project(flags) {
  const db = loadDb();
  const query = (flags._[0] || "").toLowerCase();
  if (!query) throw new Error("Usage: npm run workdb -- project <name-or-id>");
  const matches = db.projects.filter((item) => {
    return item.id.includes(query) || item.name.toLowerCase().includes(query) || item.path.toLowerCase().includes(query);
  });
  if (flags.json) return console.log(JSON.stringify(matches, null, 2));
  for (const item of matches) {
    console.log(`${item.name}`);
    console.log(`  id: ${item.id}`);
    console.log(`  path: ${item.path}`);
    console.log(`  remote: ${item.remote || "none"}`);
    console.log(`  files: ${item.fileCount}`);
    console.log(`  tags: ${item.tags.join(", ")}`);
  }
}

function tags(flags) {
  const db = loadDb();
  const limit = Number(flags.limit || 80);
  const rows = db.tags.slice(0, limit);
  if (flags.json) return console.log(JSON.stringify(rows, null, 2));
  for (const item of rows) console.log(`${item.count}\t${item.tag}`);
}

function loadJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function normalizeTerms(query) {
  return String(query || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function indexedRows() {
  const db = loadDb();
  const files = loadJsonl(filesPath).map((row) => ({ type: "file", graphId: `raw:${row.id}`, ...row }));
  const projects = (db.projects || []).map((row) => ({ type: "project", graphId: `project:${row.id}`, title: row.name, ...row }));
  const sessions = loadJsonl(sessionsPath).map((row) => ({
    type: "session",
    graphId: `session:${row.system || "agent"}:${row.id}`,
    ...row
  }));
  return { db, files, projects, sessions, all: [...projects, ...files, ...sessions] };
}

function scoreRow(row, query, terms) {
  const haystack = rowText(row);
  if (!terms.length) return 0;
  let score = haystack.includes(query) ? 12 : 0;
  for (const term of terms) {
    if (!term) continue;
    const matches = haystack.split(term).length - 1;
    if (matches) score += matches;
    if (String(row.title || row.name || "").toLowerCase().includes(term)) score += 3;
    if ((row.tags || []).includes(term)) score += 5;
    if (String(row.path || "").toLowerCase().includes(term)) score += 2;
  }
  if (row.type === "project") score += 3;
  if (row.type === "session") score += 1;
  if (row.sensitive) score *= 0.45;
  return score;
}

function publicRow(row) {
  return {
    id: row.id,
    graphId: row.graphId,
    type: row.type,
    title: row.title || row.name || basename(row.path || row.id || "item"),
    path: row.path || "",
    relativePath: row.relativePath || "",
    sourceRoot: row.sourceRoot || "",
    sourceLabel: row.sourceLabel || "",
    updatedAt: row.updatedAt || "",
    fileCount: row.fileCount || 0,
    remote: row.remote || "",
    extension: row.extension || "",
    sensitive: Boolean(row.sensitive),
    compileStatus: row.compileStatus || "",
    tags: (row.tags || []).slice(0, 20),
    snippet: row.sensitive ? "" : row.snippet || "",
    score: row.score || 0
  };
}

function searchIndex(query, options = {}) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) return [];
  const limit = Number(options.limit || 20);
  const includeSensitive = Boolean(options.includeSensitive);
  const terms = normalizeTerms(normalizedQuery);
  return indexedRows().all
    .filter((row) => includeSensitive || !row.sensitive)
    .map((row) => ({ ...row, score: scoreRow(row, normalizedQuery, terms) }))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score || String(left.path || left.title).localeCompare(String(right.path || right.title)))
    .slice(0, limit)
    .map(publicRow);
}

function contextMarkdown(query, options = {}) {
  const limit = Number(options.limit || 12);
  const rows = searchIndex(query, { limit, includeSensitive: false });
  const relatedTags = topRelatedTags(rows, 18);
  const projects = rows.filter((row) => row.type === "project").slice(0, 8);
  const files = rows.filter((row) => row.type === "file").slice(0, 12);
  const sessions = rows.filter((row) => row.type === "session").slice(0, 8);
  const lines = [
    `# Work DB Context: ${query}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "Use this as a compact routing pack before opening full files. Paths are local and private.",
    "",
    "## Top Matches",
    "",
    ...(rows.length ? rows.map((row) => {
      const pathLine = row.path ? `\n  - path: ${row.path}` : "";
      const snippetLine = row.snippet ? `\n  - snippet: ${row.snippet}` : "";
      return `- [${row.type}] ${row.title} (score ${Math.round(row.score)})${pathLine}\n  - tags: ${row.tags.slice(0, 10).join(", ") || "none"}${snippetLine}`;
    }) : ["- none"]),
    "",
    "## Projects",
    "",
    ...(projects.length ? projects.map((row) => `- ${row.title}: ${row.fileCount || 0} files\n  - path: ${row.path}`) : ["- none"]),
    "",
    "## Evidence Files",
    "",
    ...(files.length ? files.map((row) => `- ${row.title}\n  - path: ${row.path}\n  - updated: ${row.updatedAt || "unknown"}\n  - status: ${row.compileStatus || "unknown"}`) : ["- none"]),
    "",
    "## Recent Sessions",
    "",
    ...(sessions.length ? sessions.map((row) => `- ${row.title}\n  - updated: ${row.updatedAt || "unknown"}\n  - path: ${row.path || "session index only"}`) : ["- none"]),
    "",
    "## Related Tags",
    "",
    ...(relatedTags.length ? relatedTags.map((item) => `- ${item.tag}: ${item.count}`) : ["- none"]),
    "",
    "## Follow-up Commands",
    "",
    `- npm run workdb -- search "${query}" --limit ${limit}`,
    `- npm run workdb -- context "${query}" --limit ${limit}`,
    "- npm run workdb -- tags --limit 40"
  ];
  return `${lines.join("\n")}\n`;
}

function resolveIndexedTarget(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const rows = indexedRows().all;
  return rows.find((row) => {
    return row.graphId === raw
      || row.id === raw
      || `raw:${row.id}` === raw
      || `project:${row.id}` === raw
      || `session:${row.system || "agent"}:${row.id}` === raw
      || row.path === raw
      || row.relativePath === raw;
  }) || null;
}

function previewIndexedTarget(value) {
  const row = resolveIndexedTarget(value);
  if (!row) throw new Error(`Indexed target not found: ${value}`);
  const stats = row.path ? safeStat(row.path) : null;
  const isFile = Boolean(stats?.isFile());
  const content = isFile && !row.sensitive ? readSmallText(row.path, 120000) : "";
  return {
    ok: true,
    item: publicRow(row),
    isFile,
    isDirectory: Boolean(stats?.isDirectory()),
    canPreview: Boolean(content),
    content,
    truncated: Boolean(content && stats && stats.size > Buffer.byteLength(content, "utf8"))
  };
}

function rowText(row) {
  return [row.title, row.name, row.path, row.relativePath, row.snippet, row.detail, row.remote, ...(row.tags || [])]
    .join("\n")
    .toLowerCase();
}

function tagMatcher(tag) {
  const normalized = String(tag || "").trim().toLowerCase();
  return (row) => (row.tags || []).includes(normalized) || rowText(row).includes(normalized);
}

function clusterMatcher(clusterId) {
  const cluster = clusterById.get(clusterId);
  const clusterTags = new Set(cluster?.tags || []);
  return (row) => {
    const rowTags = row.tags || [];
    if (rowTags.some((tag) => clusterTags.has(tag))) return true;
    return clusterForTags(rowTags, rowText(row)) === clusterId;
  };
}

function topRelatedTags(rows, limit = 24) {
  const counts = new Map();
  for (const row of rows) {
    for (const tag of row.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag))
    .slice(0, limit);
}

function analysisMarkdown({ kind, id, label, rows, projects, sessions, relatedTags, limit }) {
  const topProjects = projects
    .slice()
    .sort((left, right) => Number(right.fileCount || 0) - Number(left.fileCount || 0))
    .slice(0, Math.min(limit, 20));
  const topFiles = rows
    .filter((row) => !row.sensitive)
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
    .slice(0, limit);
  const topSessions = sessions
    .slice()
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
    .slice(0, Math.min(limit, 18));

  const lines = [
    `# ${label} analysis`,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Scope",
    "",
    `- Type: ${kind}`,
    `- ID: ${id}`,
    `- Provenance: inferred analysis over extracted local DB metadata, safe snippets, and session titles.`,
    "",
    "## Counts",
    "",
    `- Matching projects: ${projects.length}`,
    `- Matching files: ${rows.length}`,
    `- Matching sessions: ${sessions.length}`,
    `- Related tags: ${relatedTags.length}`,
    `- Full file index: ${relative(root, filesPath)}`,
    `- Full session index: ${relative(root, sessionsPath)}`,
    `- Full project index: ${relative(root, projectsPath)}`,
    "",
    "## Related Tags",
    "",
    ...(relatedTags.length ? relatedTags.map((item) => `- ${item.tag}: ${item.count}`) : ["- none"]),
    "",
    "## Project Dossier",
    "",
    ...(topProjects.length ? topProjects.map((project) => {
      const remote = project.remote ? `; remote ${project.remote}` : "";
      return `- ${project.name}: ${project.fileCount} indexed files; tags ${(project.tags || []).slice(0, 10).join(", ") || "none"}${remote}`;
    }) : ["- none"]),
    "",
    "## Evidence Files",
    "",
    ...(topFiles.length ? topFiles.map((file) => {
      const snippet = file.snippet ? `\n  - snippet: ${file.snippet}` : "";
      return `- ${file.title || basename(file.path || "")}\n  - path: ${file.path || file.relativePath || ""}\n  - updated: ${file.updatedAt || "unknown"}\n  - tags: ${(file.tags || []).slice(0, 10).join(", ") || "none"}${snippet}`;
    }) : ["- none"]),
    "",
    "## Recent Agent Sessions",
    "",
    ...(topSessions.length ? topSessions.map((session) => {
      return `- ${session.title || session.id}\n  - system: ${session.system || "unknown"}\n  - updated: ${session.updatedAt || "unknown"}\n  - tags: ${(session.tags || []).slice(0, 10).join(", ") || "none"}`;
    }) : ["- none"]),
    "",
    "## Next Analysis Prompts",
    "",
    `- What decisions or open tasks are concentrated in ${label}?`,
    `- Which files should be promoted from raw evidence into compiled wiki pages for ${label}?`,
    `- Are any high-weight projects missing backlinks to this ${kind}?`,
    "",
    "## CLI Follow-ups",
    "",
    kind === "tag"
      ? `- npm run workdb -- search "${label}"`
      : `- npm run workdb -- analyze-cluster "${id}"`,
    "- npm run workdb -- tags --limit 40"
  ];

  return `${lines.join("\n")}\n`;
}

function analyzeScope({ kind, id, label, matcher, flags }) {
  const db = loadDb();
  const limit = Number(flags.limit || 30);
  const files = loadJsonl(filesPath).filter(matcher);
  const projects = (db.projects || []).filter(matcher);
  const sessions = loadJsonl(sessionsPath).filter(matcher);
  const relatedTags = topRelatedTags([...files, ...projects, ...sessions]);
  const analysisDir = join(outputRoot, "analysis");
  mkdirSync(analysisDir, { recursive: true });
  const reportPath = join(analysisDir, `${kind}-${slugify(id || label)}.md`);
  const manifestPath = join(analysisDir, `${kind}-${slugify(id || label)}.json`);
  const markdown = analysisMarkdown({ kind, id, label, rows: files, projects, sessions, relatedTags, limit });
  writeFileSync(reportPath, markdown, "utf8");
  writeFileSync(manifestPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    kind,
    id,
    label,
    counts: {
      files: files.length,
      projects: projects.length,
      sessions: sessions.length,
      relatedTags: relatedTags.length
    },
    files: files.map((file) => ({
      id: file.id,
      title: file.title,
      path: file.path,
      relativePath: file.relativePath,
      updatedAt: file.updatedAt,
      sourceRoot: file.sourceRoot,
      sensitive: file.sensitive,
      compileStatus: file.compileStatus,
      tags: file.tags || []
    })),
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      path: project.path,
      remote: project.remote,
      fileCount: project.fileCount,
      tags: project.tags || []
    })),
    sessions: sessions.map((session) => ({
      id: session.id,
      system: session.system,
      title: session.title,
      updatedAt: session.updatedAt,
      path: session.path,
      tags: session.tags || []
    })),
    relatedTags
  }, null, 2), "utf8");

  const result = {
    reportPath,
    manifestPath,
    relativePath: relative(root, reportPath),
    manifestRelativePath: relative(root, manifestPath),
    files: files.length,
    projects: projects.length,
    sessions: sessions.length,
    relatedTags: relatedTags.length
  };

  if (flags.json) console.log(JSON.stringify(result, null, 2));
  else if (!flags.silent) {
    console.log(`Wrote ${relative(root, reportPath)}.`);
    console.log(`Matched ${files.length} files, ${projects.length} projects, ${sessions.length} sessions, ${relatedTags.length} related tags.`);
  }
  return result;
}

function analyzeTag(flags) {
  const tag = flags._.join(" ").trim().toLowerCase();
  if (!tag) throw new Error("Usage: npm run workdb -- analyze-tag <tag> [--limit 30]");
  analyzeScope({ kind: "tag", id: tag, label: tag, matcher: tagMatcher(tag), flags });
}

function analyzeCluster(flags) {
  const raw = flags._.join(" ").trim().toLowerCase();
  if (!raw) throw new Error("Usage: npm run workdb -- analyze-cluster <cluster-id-or-label> [--limit 30]");
  const cluster = themeClusters.find((item) => item.id === raw || item.label.toLowerCase() === raw);
  if (!cluster) throw new Error(`Unknown cluster: ${raw}. Available: ${themeClusters.map((item) => item.id).join(", ")}`);
  analyzeScope({ kind: "cluster", id: cluster.id, label: cluster.label, matcher: clusterMatcher(cluster.id), flags });
}

function runAnalysis(kind, id, limit = 30) {
  const normalizedKind = String(kind || "").trim().toLowerCase();
  const normalizedId = String(id || "").trim().toLowerCase();
  const flags = { _: [], limit, silent: true };
  if (normalizedKind === "tag") {
    if (!normalizedId) throw new Error("Missing tag id.");
    return analyzeScope({ kind: "tag", id: normalizedId, label: normalizedId, matcher: tagMatcher(normalizedId), flags });
  }
  if (normalizedKind === "cluster") {
    const cluster = themeClusters.find((item) => item.id === normalizedId || item.label.toLowerCase() === normalizedId);
    if (!cluster) throw new Error(`Unknown cluster: ${normalizedId}`);
    return analyzeScope({ kind: "cluster", id: cluster.id, label: cluster.label, matcher: clusterMatcher(cluster.id), flags });
  }
  throw new Error(`Unsupported analysis kind: ${kind}`);
}

function refreshExternal() {
  mkdirSync(outputRoot, { recursive: true });
  const external = { generatedAt: new Date().toISOString(), github: {}, gcloud: {}, firebase: {} };

  function run(command, args, env = {}) {
    try {
      return execFileSync(command, args, {
        encoding: "utf8",
        env: { ...process.env, ...env },
        stdio: ["ignore", "pipe", "pipe"]
      }).trim();
    } catch (error) {
      return JSON.stringify({ error: error.stderr?.toString() || error.message });
    }
  }

  const githubUser = run("gh", ["api", "user"]);
  const githubRepos = run("gh", ["api", "user/repos", "--paginate"]);
  const gcloudAccount = run("gcloud", ["config", "get-value", "account"]);
  const gcloudProjects = run("gcloud", ["projects", "list", "--format=json"]);
  const firebaseProjects = run("/Users/phil/.homebrew/bin/firebase", ["projects:list", "--json"], {
    CI: "true",
    FIREBASE_CLI_DISABLE_UPDATE_CHECK: "true",
    NODE_EXTRA_CA_CERTS: "/Users/phil/.homebrew/etc/ca-certificates/cert.pem"
  });

  try { external.github.user = JSON.parse(githubUser); } catch { external.github.user = { raw: githubUser }; }
  try { external.github.repos = JSON.parse(githubRepos); } catch { external.github.repos = [{ raw: githubRepos }]; }
  external.gcloud.account = gcloudAccount;
  try { external.gcloud.projects = JSON.parse(gcloudProjects); } catch { external.gcloud.projects = [{ raw: gcloudProjects }]; }
  try { external.firebase.projects = JSON.parse(firebaseProjects).result || JSON.parse(firebaseProjects); } catch { external.firebase.projects = [{ raw: firebaseProjects }]; }

  writeFileSync(externalPath, JSON.stringify(external, null, 2), "utf8");
  console.log(`Wrote ${relative(root, externalPath)}.`);
}

function contentTypeFor(filePath) {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js" || extension === ".mjs") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".jsonl") return "application/x-ndjson; charset=utf-8";
  if (extension === ".md") return "text/markdown; charset=utf-8";
  if (extension === ".txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function readRequestJson(request) {
  return new Promise((resolvePromise, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20000) {
        reject(new Error("Request body too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolvePromise(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response, statusCode, text, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "content-type": contentType,
    "cache-control": "no-store"
  });
  response.end(text);
}

function isLocalRequest(request) {
  const address = request.socket.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function revealIndexedTarget(value, mode = "reveal") {
  const row = resolveIndexedTarget(value);
  if (!row || !row.path) throw new Error(`Indexed target path not found: ${value}`);
  const stats = safeStat(row.path);
  if (!stats) throw new Error(`Path no longer exists: ${row.path}`);
  if (mode === "open" && stats.isFile()) execFileSync("open", [row.path], { stdio: "ignore" });
  else execFileSync("open", ["-R", row.path], { stdio: "ignore" });
  return { ok: true, item: publicRow(row), mode: mode === "open" && stats.isFile() ? "open" : "reveal" };
}

function serve(flags) {
  if (!existsSync(join(outputRoot, "tag-cloud.html"))) build();
  const host = String(flags.host || "127.0.0.1");
  const port = Number(flags.port || 8765);
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", `http://${host}:${port}`);
      if (request.method === "POST" && requestUrl.pathname === "/api/analyze") {
        const body = await readRequestJson(request);
        const result = runAnalysis(body.kind, body.id, Number(body.limit || 30));
        return sendJson(response, 200, {
          ok: true,
          ...result,
          url: `/${relative(outputRoot, result.reportPath).split("/").map(encodeURIComponent).join("/")}`
        });
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/open") {
        if (!isLocalRequest(request)) return sendJson(response, 403, { ok: false, error: "Open/reveal is only available from localhost." });
        const body = await readRequestJson(request);
        const result = revealIndexedTarget(body.id || body.path || body.graphId, body.mode || "reveal");
        return sendJson(response, 200, result);
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        return sendJson(response, 405, { ok: false, error: "Method not allowed." });
      }

      if (requestUrl.pathname === "/api/search") {
        const query = requestUrl.searchParams.get("q") || "";
        const limit = Number(requestUrl.searchParams.get("limit") || 20);
        return sendJson(response, 200, { ok: true, query, results: searchIndex(query, { limit }) });
      }

      if (requestUrl.pathname === "/api/context") {
        const query = requestUrl.searchParams.get("q") || "";
        const limit = Number(requestUrl.searchParams.get("limit") || 12);
        const markdown = contextMarkdown(query, { limit });
        if (requestUrl.searchParams.get("format") === "json") return sendJson(response, 200, { ok: true, query, markdown });
        return sendText(response, 200, markdown, "text/markdown; charset=utf-8");
      }

      if (requestUrl.pathname === "/api/file") {
        const target = requestUrl.searchParams.get("id") || requestUrl.searchParams.get("path") || "";
        return sendJson(response, 200, previewIndexedTarget(target));
      }

      const pathname = decodeURIComponent(requestUrl.pathname === "/" ? "/tag-cloud.html" : requestUrl.pathname);
      const filePath = resolve(outputRoot, `.${pathname}`);
      if (filePath !== outputRoot && !filePath.startsWith(`${outputRoot}/`)) {
        return sendJson(response, 403, { ok: false, error: "Forbidden path." });
      }
      if (!existsSync(filePath) || !safeStat(filePath)?.isFile()) {
        return sendJson(response, 404, { ok: false, error: "Not found." });
      }
      response.writeHead(200, {
        "content-type": contentTypeFor(filePath),
        "cache-control": "no-store"
      });
      if (request.method === "HEAD") return response.end();
      response.end(readFileSync(filePath));
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error.message });
    }
  });

  server.listen(port, host, () => {
    console.log(`Serving ${relative(root, outputRoot)} at http://${host}:${port}/tag-cloud.html`);
  });
}

function help() {
  console.log(`Usage: npm run workdb -- <command>

Commands:
  build                 Build local private DB in outputs/global-work-kb.
  stats [--json]        Print DB counts.
  search <query>        Search indexed projects, files, and sessions.
  context <query>       Print a compact markdown context pack for agent work.
  show <id|path>        Show safe preview content for an indexed file/session/project.
  project <query>       Show indexed project cards.
  tags [--limit N]      Print top tags.
  analyze-tag <tag>     Write a markdown dossier for a tag.
  analyze-cluster <id>  Write a markdown dossier for a theme cluster.
  serve [--port 8765]   Serve graph, search/context/file APIs, and local reveal actions.
  refresh-external      Query GitHub, gcloud, and Firebase inventory into the DB folder.
`);
}

const [command = "help", ...rest] = process.argv.slice(2);
const flags = parseFlags(rest);

try {
  if (command === "build") build();
  else if (command === "stats") stats(flags);
  else if (command === "search") search(flags);
  else if (command === "context") context(flags);
  else if (command === "show") show(flags);
  else if (command === "project") project(flags);
  else if (command === "tags") tags(flags);
  else if (command === "analyze-tag") analyzeTag(flags);
  else if (command === "analyze-cluster") analyzeCluster(flags);
  else if (command === "serve") serve(flags);
  else if (command === "refresh-external") refreshExternal();
  else help();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
