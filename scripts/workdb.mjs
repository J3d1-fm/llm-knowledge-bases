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
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputRoot = join(root, "outputs", "global-work-kb");
const dbPath = join(outputRoot, "db.json");
const filesPath = join(outputRoot, "files.jsonl");
const projectsPath = join(outputRoot, "projects.jsonl");
const sessionsPath = join(outputRoot, "sessions.jsonl");
const externalPath = join(outputRoot, "external-inventory.json");

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

function snippetFromText(text) {
  const snippet = text
    .replace(/^---[\s\S]*?---\s*/, "")
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .find((part) => part && !part.startsWith("#"))
    ?.slice(0, 280) || "";
  return redactSensitiveText(snippet);
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
  return config.match(/url = (.+)/)?.[1]?.trim() || "";
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
      id: slugify(basename(projectPath)),
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
        return {
          id: item.id,
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
        id: slugify(relative(`${home}/.claude`, path)),
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
      rows.push({
        id: slugify(relativePath),
        sourceRoot: sourceRoot.id,
        sourceLabel: sourceRoot.label,
        path,
        relativePath,
        extension: extname(path).toLowerCase(),
        size: stats.size,
        updatedAt: stats.mtime.toISOString(),
        title: text ? titleFromText(path, text) : basename(path),
        snippet: text ? snippetFromText(text) : "",
        sensitive: isSensitivePath(path),
        tags: deriveTags(path, text)
      });
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
    id: slugify(projectPath.replace(`${home}/Documents/`, "")),
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

function writeTagCloud(tags, projects) {
  const max = Math.max(...tags.map((item) => item.count), 1);
  const htmlTags = tags.slice(0, 160).map((item) => {
    const size = 12 + Math.round((item.count / max) * 34);
    return `<span class="tag" style="font-size:${size}px" title="${item.count} records">${escapeHtml(item.tag)}</span>`;
  }).join("\n");
  const projectItems = projects.slice(0, 80).map((project) => {
    return `<li><strong>${escapeHtml(project.name)}</strong><span>${escapeHtml(project.tags.slice(0, 8).join(", "))}</span></li>`;
  }).join("\n");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Global Work Knowledge Base Tag Cloud</title>
  <style>
    body { margin: 0; font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f7f4ed; color: #172322; }
    main { max-width: 1180px; margin: 0 auto; padding: 40px 24px; }
    h1 { font-size: 32px; margin: 0 0 8px; }
    .meta { color: #5b6664; margin-bottom: 28px; }
    .cloud { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; padding: 24px; background: #ffffff; border: 1px solid #d8ddd8; border-radius: 8px; }
    .tag { color: #195b5a; font-weight: 700; }
    .projects { margin-top: 30px; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; padding: 0; list-style: none; }
    .projects li { background: #ffffff; border: 1px solid #d8ddd8; border-radius: 8px; padding: 12px 14px; }
    .projects span { display: block; color: #68716f; font-size: 13px; margin-top: 4px; }
  </style>
</head>
<body>
<main>
  <h1>Global Work Knowledge Base</h1>
  <p class="meta">Generated ${new Date().toISOString()}. Tag size reflects count across indexed project files, memory, sessions, and Claude/Codex artifacts.</p>
  <section class="cloud">${htmlTags}</section>
  <ul class="projects">${projectItems}</ul>
</main>
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
    `- Tag cloud: ${relative(root, join(outputRoot, "tag-cloud.html"))}`,
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
  writeTagCloud(tags, projects);
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
