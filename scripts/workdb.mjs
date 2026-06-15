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

function buildGraphData(tags, projects, external, files = [], codexSessions = [], claudeSessions = []) {
  const nodes = [];
  const edges = [];
  const nodeIds = new Set();
  const edgeIds = new Set();
  const topTags = tags.slice(0, 52);
  const topTagSet = new Set(topTags.map((item) => item.tag));

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
    weight: 99999,
    detail: "Raw diary, live catalog, provenance, projects, repos, cloud resources, and agent sessions"
  });

  for (const tag of topTags) {
    addNode({
      id: `tag:${tag.tag}`,
      label: tag.tag,
      type: "tag",
      weight: tag.count,
      detail: `${tag.count} indexed records`
    });
    addEdge("memory:lens", `tag:${tag.tag}`, Math.min(6, Math.max(1, tag.count / 6000)), "memory-tag");
  }

  const selectedProjects = projects
    .filter((project) => project.fileCount > 0 || project.remote)
    .sort((left, right) => right.fileCount - left.fileCount)
    .slice(0, 84);

  for (const project of selectedProjects) {
    const projectTags = (project.tags || []).filter((tag) => topTagSet.has(tag)).slice(0, 10);
    addNode({
      id: `project:${project.id}`,
      label: project.name,
      type: "project",
      weight: Math.max(1, project.fileCount),
      detail: `${project.fileCount} indexed files`,
      path: project.path,
      remote: project.remote,
      tags: projectTags
    });
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
    const fileId = `raw:${file.id}`;
    const inserted = addNode({
      id: fileId,
      label: file.title || basename(file.path),
      type: "raw",
      weight: 1,
      detail: `${file.sourceLabel || file.sourceRoot} · ${file.extension || "file"}`,
      path: file.path,
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
    weight: Math.max(1, codexSessions.length),
    detail: "Indexed Codex session titles and timestamps"
  });
  addNode({
    id: "system:claude",
    label: "Claude files",
    type: "system",
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
    const sessionId = `session:codex:${session.id || stableId(session.title)}`;
    const inserted = addNode({
      id: sessionId,
      label: session.title || session.id,
      type: "session",
      weight: 1,
      detail: session.updatedAt || "Codex session",
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
    const sessionId = `session:claude:${session.id || stableId(session.title)}`;
    const inserted = addNode({
      id: sessionId,
      label: session.title || session.id,
      type: "session",
      weight: 1,
      detail: session.updatedAt || "Claude session",
      path: session.path || "",
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
      weight: 12,
      detail: project.projectId || "Firebase project"
    });
    addEdge("external:firebase", firebaseId, 2, "firebase-project");
    if (String(projectId).includes("llm-knowledge-bases")) addEdge(firebaseId, "tag:llm", 3, "cloud-tag");
  }

  const linkedNodeIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  return {
    generatedAt: new Date().toISOString(),
    nodes: nodes.filter((node) => linkedNodeIds.has(node.id) || node.type === "project"),
    edges,
    counts: {
      projects: selectedProjects.length,
      tags: topTags.length,
      raw: includedRaw,
      sessions: includedSessions,
      repos: githubRepos.length,
      gcloudProjects: gcloudProjects.length,
      firebaseProjects: firebaseProjects.length
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
  <title>Global Work Knowledge Graph</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #242424;
      --panel: rgba(28, 28, 28, 0.78);
      --panel-border: rgba(255, 255, 255, 0.1);
      --text: #e8e8e8;
      --muted: #a0a0a0;
      --line: rgba(198, 198, 198, 0.13);
    }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; }
    body {
      margin: 0;
      overflow: hidden;
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    canvas { width: 100vw; height: 100vh; display: block; background: radial-gradient(circle at 34% 46%, #303030 0, #262626 36%, #222 100%); }
    .panel {
      position: fixed;
      z-index: 2;
      background: var(--panel);
      border: 1px solid var(--panel-border);
      backdrop-filter: blur(12px);
      border-radius: 10px;
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.24);
    }
    .topbar {
      left: 18px;
      top: 18px;
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 10px;
      max-width: calc(100vw - 36px);
    }
    .title {
      padding: 0 8px;
      min-width: 220px;
    }
    .title strong { display: block; font-size: 14px; letter-spacing: 0; }
    .title span { display: block; color: var(--muted); font-size: 12px; white-space: nowrap; }
    input {
      width: min(34vw, 360px);
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
      padding: 0 12px;
      cursor: pointer;
    }
    button:hover, input:focus { border-color: rgba(255,255,255,0.3); }
    .legend {
      left: 18px;
      bottom: 18px;
      padding: 12px 14px;
      display: grid;
      gap: 7px;
      min-width: 190px;
    }
    .legend div { display: flex; align-items: center; gap: 8px; color: var(--muted); }
    .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
    .details {
      right: 18px;
      top: 18px;
      width: min(360px, calc(100vw - 36px));
      padding: 16px;
      max-height: calc(100vh - 36px);
      overflow: auto;
    }
    .details h2 { margin: 0 0 6px; font-size: 18px; line-height: 1.2; }
    .details p { margin: 8px 0 0; color: var(--muted); }
    .details code { display: block; white-space: pre-wrap; word-break: break-word; margin-top: 10px; color: #cfcfcf; font-size: 12px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
    .chips span { border: 1px solid rgba(255,255,255,0.12); border-radius: 999px; padding: 3px 8px; color: #cfcfcf; }
    .tooltip {
      position: fixed;
      z-index: 3;
      pointer-events: none;
      padding: 6px 8px;
      border-radius: 7px;
      background: rgba(12,12,12,0.88);
      color: #f0f0f0;
      border: 1px solid rgba(255,255,255,0.12);
      transform: translate(12px, 12px);
      display: none;
      max-width: 260px;
    }
    @media (max-width: 760px) {
      .topbar { right: 12px; left: 12px; top: 12px; flex-wrap: wrap; }
      .title { width: 100%; }
      input { width: calc(100vw - 136px); min-width: 0; }
      .details { display: none; }
      .legend { display: none; }
    }
  </style>
</head>
<body>
<canvas id="graph"></canvas>
<div class="panel topbar">
  <div class="title"><strong>Global Work Graph</strong><span>${graph.nodes.length} nodes · ${graph.edges.length} links · ${escapeHtml(graph.generatedAt)}</span></div>
  <input id="search" type="search" placeholder="Search project, tag, repo">
  <button id="reset" type="button">Reset</button>
</div>
<aside class="panel details" id="details">
  <h2>Agent memory</h2>
  <p>Raw diary, live catalog, provenance, projects, repos, cloud resources, and agent sessions in one local graph.</p>
  <div class="chips">
    <span>${graph.counts.projects} projects</span>
    <span>${graph.counts.raw} raw nodes</span>
    <span>${graph.counts.sessions} sessions</span>
    <span>${graph.counts.repos} repos</span>
    <span>${graph.counts.gcloudProjects} GCloud</span>
    <span>${graph.counts.firebaseProjects} Firebase</span>
  </div>
</aside>
<div class="panel legend">
  <div><span class="dot" style="background:#d8d8d8"></span>Project</div>
  <div><span class="dot" style="background:#a8a8a8"></span>Raw item</div>
  <div><span class="dot" style="background:#91b5ff"></span>Tag / theme</div>
  <div><span class="dot" style="background:#b9f0d0"></span>GitHub repo</div>
  <div><span class="dot" style="background:#ffd28b"></span>Cloud resource</div>
  <div><span class="dot" style="background:#ffffff"></span>Memory lens</div>
  <div><span class="dot" style="background:#c6a7ff"></span>Agent/system</div>
</div>
<div class="tooltip" id="tooltip"></div>
<script>
const graph = ${graphJson};
const canvas = document.getElementById("graph");
const ctx = canvas.getContext("2d");
const details = document.getElementById("details");
const tooltip = document.getElementById("tooltip");
const search = document.getElementById("search");
const reset = document.getElementById("reset");
const colors = {
  project: "#d8d8d8",
  tag: "#91b5ff",
  repo: "#b9f0d0",
  external: "#ffd28b",
  cloud: "#ffd28b",
  firebase: "#ffbf77",
  memory: "#ffffff",
  raw: "#a8a8a8",
  session: "#7e7e7e",
  system: "#c6a7ff"
};
let width = 0;
let height = 0;
let scale = 1;
let hovered = null;
let selected = null;
let query = "";
const nodes = graph.nodes.map(function(node, index) {
  const angle = index * 2.399963229728653;
  const ring = node.type === "memory" ? 0 : node.type === "project" ? 0.24 : node.type === "tag" ? 0.4 : node.type === "raw" ? 0.54 : node.type === "session" ? 0.7 : 0.62;
  return Object.assign({}, node, {
    x: node.type === "memory" ? 0 : Math.cos(angle) * ring,
    y: node.type === "memory" ? 0 : Math.sin(angle) * ring,
    vx: 0,
    vy: 0,
    radius: radiusFor(node)
  });
});
const byId = new Map(nodes.map(function(node) { return [node.id, node]; }));
const edges = graph.edges.map(function(edge) {
  return Object.assign({}, edge, { source: byId.get(edge.source), target: byId.get(edge.target) });
}).filter(function(edge) { return edge.source && edge.target; });
function radiusFor(node) {
  const weight = Math.max(1, Number(node.weight || 1));
  if (node.type === "memory") return 24;
  if (node.type === "tag") return Math.min(18, 5 + Math.log10(weight + 1) * 4.2);
  if (node.type === "project") return Math.min(16, 4.5 + Math.log10(weight + 1) * 3.2);
  if (node.type === "raw" || node.type === "session") return 3.6;
  if (node.type === "system" || node.type === "external") return 10;
  return 5.5;
}
function resize() {
  const ratio = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;
  scale = Math.min(width, height) * 0.84;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
function screenX(node) { return width / 2 + node.x * scale; }
function screenY(node) { return height / 2 + node.y * scale; }
function tick() {
  for (const node of nodes) {
    if (node.type === "memory") {
      node.vx += -node.x * 0.05;
      node.vy += -node.y * 0.05;
      continue;
    }
    const targetRadius = node.type === "project" ? 0.2 : node.type === "tag" ? 0.38 : node.type === "raw" ? 0.5 : node.type === "session" ? 0.68 : node.type === "repo" ? 0.64 : 0.56;
    const distance = Math.max(0.001, Math.hypot(node.x, node.y));
    node.vx += (node.x / distance * targetRadius - node.x) * 0.0025;
    node.vy += (node.y / distance * targetRadius - node.y) * 0.0025;
    node.vx += -node.x * 0.0009;
    node.vy += -node.y * 0.0009;
  }
  for (const edge of edges) {
    const dx = edge.target.x - edge.source.x;
    const dy = edge.target.y - edge.source.y;
    const distance = Math.max(0.001, Math.hypot(dx, dy));
    const ideal = edge.type === "project-tag" ? 0.11 : edge.type === "project-raw" ? 0.08 : edge.type === "raw-tag" ? 0.1 : edge.type === "system-session" ? 0.12 : edge.type === "project-repo" ? 0.16 : 0.18;
    const force = (distance - ideal) * 0.012 * Math.min(4, edge.weight || 1);
    const fx = dx / distance * force;
    const fy = dy / distance * force;
    edge.source.vx += fx;
    edge.source.vy += fy;
    edge.target.vx -= fx;
    edge.target.vy -= fy;
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy + 0.0008;
      const force = 0.000018 * (a.radius + b.radius) / d2;
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
  const text = [node.label, node.detail, node.path, node.remote, node.url, (node.tags || []).join(" ")].join(" ").toLowerCase();
  return text.includes(query);
}
function isConnectedToFocus(edge) {
  const focus = selected || hovered;
  if (!focus && !query) return true;
  if (focus && (edge.source === focus || edge.target === focus)) return true;
  if (query && (isMatched(edge.source) || isMatched(edge.target))) return true;
  return false;
}
function draw() {
  tick();
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 1;
  for (const edge of edges) {
    const active = isConnectedToFocus(edge);
    ctx.strokeStyle = active ? "rgba(220,220,220,0.28)" : "rgba(190,190,190,0.08)";
    ctx.beginPath();
    ctx.moveTo(screenX(edge.source), screenY(edge.source));
    ctx.lineTo(screenX(edge.target), screenY(edge.target));
    ctx.stroke();
  }
  for (const node of nodes) {
    const active = selected === node || hovered === node || isMatched(node);
    const dim = (selected || hovered || query) && !active;
    ctx.beginPath();
    ctx.fillStyle = dim ? "rgba(150,150,150,0.18)" : colors[node.type] || "#ccc";
    ctx.globalAlpha = active ? 1 : dim ? 0.45 : 0.78;
    ctx.arc(screenX(node), screenY(node), node.radius * (active ? 1.45 : 1), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (active || node.radius > 12 || node.type === "external") {
      ctx.font = active ? "600 13px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" : "12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
      ctx.fillStyle = active ? "#f2f2f2" : "rgba(230,230,230,0.7)";
      ctx.fillText(node.label.slice(0, 34), screenX(node) + node.radius + 7, screenY(node) + 4);
    }
  }
  requestAnimationFrame(draw);
}
function nearestNode(event) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  let best = null;
  let bestDistance = Infinity;
  for (const node of nodes) {
    const dx = screenX(node) - x;
    const dy = screenY(node) - y;
    const distance = Math.hypot(dx, dy);
    if (distance < Math.max(12, node.radius + 5) && distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }
  return best;
}
function renderDetails(node) {
  if (!node) return;
  const chips = (node.tags || []).map(function(tag) { return "<span>" + escapeHtml(tag) + "</span>"; }).join("");
  details.innerHTML = "<h2>" + escapeHtml(node.label) + "</h2>"
    + "<p>" + escapeHtml(node.type) + " · " + escapeHtml(node.detail || "") + "</p>"
    + (node.path ? "<code>" + escapeHtml(node.path) + "</code>" : "")
    + (node.remote ? "<code>" + escapeHtml(node.remote) + "</code>" : "")
    + (node.url ? "<code>" + escapeHtml(node.url) + "</code>" : "")
    + (chips ? "<div class=\\"chips\\">" + chips + "</div>" : "");
}
function escapeHtml(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
canvas.addEventListener("mousemove", function(event) {
  hovered = nearestNode(event);
  if (hovered) {
    tooltip.style.display = "block";
    tooltip.style.left = event.clientX + "px";
    tooltip.style.top = event.clientY + "px";
    tooltip.textContent = hovered.label + (hovered.detail ? " · " + hovered.detail : "");
    canvas.style.cursor = "pointer";
  } else {
    tooltip.style.display = "none";
    canvas.style.cursor = "default";
  }
});
canvas.addEventListener("click", function(event) {
  selected = nearestNode(event);
  if (selected) renderDetails(selected);
});
search.addEventListener("input", function() { query = search.value.trim().toLowerCase(); });
reset.addEventListener("click", function() {
  selected = null;
  hovered = null;
  query = "";
  search.value = "";
  details.innerHTML = "<h2>Agent memory</h2><p>Raw diary, live catalog, provenance, projects, repos, cloud resources, and agent sessions in one local graph.</p><div class=\\"chips\\"><span>${graph.counts.projects} projects</span><span>${graph.counts.raw} raw nodes</span><span>${graph.counts.sessions} sessions</span><span>${graph.counts.repos} repos</span><span>${graph.counts.gcloudProjects} GCloud</span><span>${graph.counts.firebaseProjects} Firebase</span></div>";
});
window.addEventListener("resize", resize);
resize();
for (let i = 0; i < 260; i++) tick();
draw();
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
  const rows = readFileSync(filesPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .map((row) => {
      const haystack = [row.title, row.snippet, row.path, ...(row.tags || [])].join("\n").toLowerCase();
      const score = query.split(/\s+/).reduce((total, term) => total + (haystack.split(term).length - 1), haystack.includes(query) ? 5 : 0);
      return { ...row, score };
    })
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, limit);
  if (flags.json) return console.log(JSON.stringify(rows, null, 2));
  for (const row of rows) {
    console.log(`${row.score}\t${row.sourceRoot}\t${row.relativePath}`);
    console.log(`  ${row.title}`);
    if (row.snippet) console.log(`  ${row.snippet}`);
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

function help() {
  console.log(`Usage: npm run workdb -- <command>

Commands:
  build                 Build local private DB in outputs/global-work-kb.
  stats [--json]        Print DB counts.
  search <query>        Search indexed files.
  project <query>       Show indexed project cards.
  tags [--limit N]      Print top tags.
  refresh-external      Query GitHub, gcloud, and Firebase inventory into the DB folder.
`);
}

const [command = "help", ...rest] = process.argv.slice(2);
const flags = parseFlags(rest);

try {
  if (command === "build") build();
  else if (command === "stats") stats(flags);
  else if (command === "search") search(flags);
  else if (command === "project") project(flags);
  else if (command === "tags") tags(flags);
  else if (command === "refresh-external") refreshExternal();
  else help();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
