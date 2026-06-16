import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputRoot = join(root, "outputs", "global-work-kb");
const dbPath = join(outputRoot, "db.json");
const remoteContextPath = join(outputRoot, "remote-workdb-context.json");

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
    id: "apps-products",
    label: "Apps and products",
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

const clusterByTag = new Map(themeClusters.flatMap((cluster) => cluster.tags.map((tag) => [tag, cluster])));
const clusterById = new Map(themeClusters.map((cluster) => [cluster.id, cluster]));
const deniedRemoteTags = new Set([
  "secret",
  "secrets",
  "secret-sensitive",
  "token",
  "tokens",
  "password",
  "passwords",
  "credential",
  "credentials",
  "private-key",
  "api-key"
]);

function slugify(value) {
  return String(value || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "item";
}

function sanitizeText(value, maxLength = 360) {
  return String(value || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\/Users\/[^\s,)]+/g, "[local-path]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeTags(tags = [], limit = 10) {
  const result = [];
  for (const tag of tags) {
    const normalized = String(tag || "").trim().toLowerCase();
    if (!normalized || deniedRemoteTags.has(normalized)) continue;
    if (!result.includes(normalized)) result.push(normalized);
    if (result.length >= limit) break;
  }
  return result;
}

function hasSensitiveSignal(tags = []) {
  return tags.some((tag) => deniedRemoteTags.has(String(tag || "").trim().toLowerCase()));
}

function clusterForTags(tags = [], fallbackText = "") {
  const scores = new Map();
  for (const tag of tags) {
    const cluster = clusterByTag.get(String(tag || "").toLowerCase());
    if (cluster) scores.set(cluster.id, (scores.get(cluster.id) || 0) + 1);
  }

  const lower = String(fallbackText || "").toLowerCase();
  for (const cluster of themeClusters) {
    for (const tag of cluster.tags) {
      if (lower.includes(tag)) scores.set(cluster.id, (scores.get(cluster.id) || 0) + 0.5);
    }
  }

  return [...scores.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "other-work";
}

function commandFor(query, limit = 12) {
  const escaped = String(query || "").replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `npm run workdb -- context "${escaped}" --limit ${limit}`;
}

function cloudCommandFor(query, limit = 12) {
  const escaped = String(query || "").replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `npm run workdb:cloud -- "${escaped}" --limit ${limit}`;
}

function makeItem(kind, id, title, summary, data = {}) {
  return {
    id: `${kind}-${slugify(id)}`,
    kind,
    title: sanitizeText(title, 160),
    summary: sanitizeText(summary, 420),
    provenance: "inferred from local private workdb metadata; remote copy excludes local paths, snippets, file content, and git remotes",
    ...data
  };
}

function buildClusterStats(db) {
  const stats = new Map(themeClusters.map((cluster) => [cluster.id, {
    id: cluster.id,
    label: cluster.label,
    color: cluster.color,
    recordCount: 0,
    projectCount: 0,
    tags: []
  }]));

  for (const tag of db.tags || []) {
    const clusterId = clusterForTags([tag.tag], tag.tag);
    const stat = stats.get(clusterId) || stats.get("other-work");
    stat.recordCount += Number(tag.count || 0);
    if (!deniedRemoteTags.has(tag.tag)) stat.tags.push(tag.tag);
  }

  for (const project of db.projects || []) {
    const clusterId = clusterForTags(project.tags || [], project.name);
    const stat = stats.get(clusterId) || stats.get("other-work");
    stat.projectCount += 1;
  }

  return [...stats.values()]
    .map((stat) => ({
      ...stat,
      tags: safeTags(stat.tags, 18)
    }))
    .filter((stat) => stat.recordCount || stat.projectCount || stat.id === "other-work")
    .sort((left, right) => right.recordCount - left.recordCount || left.label.localeCompare(right.label));
}

export function buildRemoteWorkdbContext(options = {}) {
  if (!existsSync(dbPath)) {
    throw new Error("Work DB is missing. Run: npm run workdb -- build");
  }

  const db = JSON.parse(readFileSync(dbPath, "utf8"));
  const clusterStats = buildClusterStats(db);
  const clusterStatsById = new Map(clusterStats.map((cluster) => [cluster.id, cluster]));
  const items = [];

  items.push(makeItem(
    "summary",
    "workdb",
    "Remote Work DB context",
    `${db.counts.files} indexed local files across ${db.counts.projects} projects, ${db.counts.codexSessions} Codex sessions, and ${db.counts.claudeSessions} Claude records. This remote layer is a safe routing index, not a raw file mirror.`,
    {
      generatedAt: db.generatedAt,
      fileCount: db.counts.files,
      projectCount: db.counts.projects,
      codexSessionCount: db.counts.codexSessions,
      claudeSessionCount: db.counts.claudeSessions,
      tagCount: db.counts.tags,
      githubRepoCount: db.counts.githubRepos,
      gcloudProjectCount: db.counts.gcloudProjects,
      firebaseProjectCount: db.counts.firebaseProjects,
      privacyMode: "remote-index-no-paths-no-snippets-no-file-content",
      localCommands: [
        "npm run workdb:cloud -- \"query\" --limit 12",
        "npm run workdb -- search \"query\" --limit 20",
        "npm run workdb -- context \"query\" --limit 12",
        "npm run workdb -- tags --limit 40"
      ],
      tags: ["workdb", "context", "private-index", "firestore"]
    }
  ));

  for (const cluster of clusterStats) {
    items.push(makeItem(
      "cluster",
      cluster.id,
      cluster.label,
      `${cluster.projectCount} projects and ${cluster.recordCount} weighted records. Use the local workdb CLI for exact file paths and previews.`,
      {
        clusterId: cluster.id,
        clusterLabel: cluster.label,
        color: cluster.color,
        recordCount: cluster.recordCount,
        projectCount: cluster.projectCount,
        tags: cluster.tags,
        cloudCommand: cloudCommandFor(cluster.label),
        localCommand: commandFor(cluster.label)
      }
    ));
  }

  for (const project of (db.projects || [])
    .slice()
    .sort((left, right) => Number(right.fileCount || 0) - Number(left.fileCount || 0))
    .slice(0, 90)) {
    const tags = safeTags(project.tags || [], 12);
    const clusterId = clusterForTags(project.tags || [], project.name);
    const cluster = clusterStatsById.get(clusterId) || clusterById.get(clusterId) || clusterById.get("other-work");
    items.push(makeItem(
      "project",
      project.id,
      project.name,
      `${project.fileCount || 0} indexed files. ${tags.length ? `Main tags: ${tags.slice(0, 5).join(", ")}.` : "No safe display tags."}`,
      {
        projectId: project.id,
        fileCount: Number(project.fileCount || 0),
        clusterId,
        clusterLabel: cluster.label,
        tags,
        hasRemote: Boolean(project.remote),
        hasSensitiveSignals: hasSensitiveSignal(project.tags || []),
        cloudCommand: cloudCommandFor(project.name),
        localCommand: commandFor(project.name),
        localSearchCommand: `npm run workdb -- search "${String(project.name || "").replaceAll('"', '\\"')}" --limit 20`
      }
    ));
  }

  for (const tag of (db.tags || []).filter((item) => !deniedRemoteTags.has(item.tag)).slice(0, 70)) {
    const clusterId = clusterForTags([tag.tag], tag.tag);
    const cluster = clusterStatsById.get(clusterId) || clusterById.get(clusterId) || clusterById.get("other-work");
    items.push(makeItem(
      "tag",
      tag.tag,
      tag.tag,
      `${tag.count} indexed records associated with this tag.`,
      {
        tag: tag.tag,
        recordCount: Number(tag.count || 0),
        clusterId,
        clusterLabel: cluster.label,
        tags: [tag.tag],
        cloudCommand: cloudCommandFor(tag.tag),
        localCommand: commandFor(tag.tag)
      }
    ));
  }

  const externalSources = [
    ["github", "GitHub", db.counts.githubRepos, "repositories"],
    ["gcloud", "Google Cloud", db.counts.gcloudProjects, "projects"],
    ["firebase", "Firebase", db.counts.firebaseProjects, "projects"]
  ];
  for (const [id, title, count, noun] of externalSources) {
    items.push(makeItem(
      "external",
      id,
      title,
      `${count || 0} indexed ${noun}. Exact names stay in the local private inventory.`,
      {
        externalId: id,
        count: Number(count || 0),
        clusterId: "cloud-auth",
        clusterLabel: clusterById.get("cloud-auth").label,
        tags: [id, "cloud-auth"],
        cloudCommand: cloudCommandFor(title),
        localCommand: commandFor(title)
      }
    ));
  }

  const context = {
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt: db.generatedAt,
    privacyMode: "remote-index-no-paths-no-snippets-no-file-content",
    counts: {
      items: items.length,
      projects: db.counts.projects,
      files: db.counts.files,
      codexSessions: db.counts.codexSessions,
      claudeSessions: db.counts.claudeSessions,
      tags: db.counts.tags,
      clusters: clusterStats.length,
      githubRepos: db.counts.githubRepos,
      gcloudProjects: db.counts.gcloudProjects,
      firebaseProjects: db.counts.firebaseProjects
    },
    items
  };

  if (options.write !== false) {
    mkdirSync(outputRoot, { recursive: true });
    writeFileSync(remoteContextPath, `${JSON.stringify(context, null, 2)}\n`, "utf8");
  }

  return context;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const context = buildRemoteWorkdbContext({ write: true });
  console.log(`Wrote ${remoteContextPath} with ${context.items.length} remote-safe context documents.`);
}
