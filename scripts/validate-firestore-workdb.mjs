import { execFileSync } from "node:child_process";

const projectId = process.env.FIREBASE_PROJECT_ID || "llm-knowledge-bases";
const databaseId = "(default)";
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
const failures = [];
const forbiddenFieldNames = new Set(["path", "relativePath", "snippet", "remote", "content"]);
const forbiddenStringParts = ["/Users/", "file://", "AIza", "BEGIN PRIVATE KEY"];

function getAccessToken() {
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
  return Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => {
    return [key, firestoreValueToJs(value)];
  }));
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
    docs.push(...(body.documents || []).map((document) => ({
      id: document.name.split("/").pop(),
      ...firestoreDocumentToJs(document)
    })));
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

function validateNoPrivateLeak(items) {
  for (const item of items) {
    walk(item, (value, path) => {
      if (typeof value === "string") {
        for (const forbidden of forbiddenStringParts) {
          if (value.includes(forbidden)) {
            failures.push(`Firestore workdbContext leaked forbidden string ${forbidden} at ${item.id}:${path.join(".")}`);
          }
        }
      }
      if (typeof value === "string" && path.length && forbiddenFieldNames.has(value)) {
        failures.push(`Firestore workdbContext leaked forbidden field name as value at ${item.id}:${path.join(".")}`);
      }
    });
    for (const key of Object.keys(item)) {
      if (forbiddenFieldNames.has(key)) {
        failures.push(`Firestore workdbContext leaked forbidden field: ${item.id}.${key}`);
      }
    }
  }
}

function renderContract(items, meta) {
  const rank = { summary: 0, cluster: 1, project: 2, tag: 3, external: 4 };
  const sorted = items.slice().sort((left, right) => {
    return (rank[left.kind] ?? 9) - (rank[right.kind] ?? 9)
      || Number(right.fileCount || right.recordCount || right.count || 0) - Number(left.fileCount || left.recordCount || left.count || 0)
      || String(left.title || left.id).localeCompare(String(right.title || right.id));
  });
  const summary = sorted.find((item) => item.kind === "summary");
  const driveMatches = sorted.filter((item) => JSON.stringify(item).toLowerCase().includes("drive-zone"));
  const firebaseMatches = sorted.filter((item) => JSON.stringify(item).toLowerCase().includes("firebase"));

  return {
    title: meta.title,
    summary: meta.summary,
    stats: {
      articles: meta.articleCount,
      workFiles: meta.workdbFileCount || summary?.fileCount || 0,
      projects: meta.workdbProjectCount || summary?.projectCount || 0,
      integrity: `${meta.integrityScore}%`
    },
    firstItem: sorted[0],
    driveMatches: driveMatches.length,
    firebaseMatches: firebaseMatches.length,
    commands: sorted.flatMap((item) => [
      item.cloudCommand,
      ...(item.cloudCommands || []),
      ...(item.localCommands || []),
      item.localCommand,
      item.localSearchCommand
    ].filter(Boolean)).filter(Boolean).slice(0, 12)
  };
}

async function main() {
  const token = getAccessToken();
  const metaBody = await requestFirestore(token, "vaults/main");
  const meta = firestoreDocumentToJs(metaBody);
  const items = await listCollection(token, "vaults/main/workdbContext");
  validateNoPrivateLeak(items);

  const kinds = new Set(items.map((item) => item.kind));
  const contract = renderContract(items, meta);

  if (items.length < 20) failures.push(`Expected at least 20 workdbContext docs, got ${items.length}.`);
  if (meta.workdbItemCount !== items.length) failures.push(`Vault meta workdbItemCount ${meta.workdbItemCount} does not match collection count ${items.length}.`);
  if (meta.workdbPrivacyMode !== "remote-index-no-paths-no-snippets-no-file-content") failures.push("Vault meta workdbPrivacyMode is not explicit.");
  for (const kind of ["summary", "cluster", "project", "tag", "external"]) {
    if (!kinds.has(kind)) failures.push(`Missing workdbContext kind: ${kind}`);
  }
  if (!contract.stats.workFiles || contract.stats.workFiles < 1000) failures.push("Render contract does not expose a useful Work files count.");
  if (!contract.stats.projects || contract.stats.projects < 1) failures.push("Render contract does not expose project count.");
  if (!contract.driveMatches) failures.push("Render contract cannot find Drive Zone context.");
  if (!contract.firebaseMatches) failures.push("Render contract cannot find Firebase context.");
  if (!contract.commands.some((command) => command.includes("npm run workdb -- context"))) failures.push("Render contract has no local workdb context command.");
  if (!contract.commands.some((command) => command.includes("npm run workdb:cloud"))) failures.push("Render contract has no live Firestore cloud context command.");

  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    projectId,
    docs: items.length,
    kinds: [...kinds].sort(),
    render: contract
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
