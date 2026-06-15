import { execFileSync } from "node:child_process";
import { knowledgeSeed } from "./knowledge-seed-data.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID || "llm-knowledge-bases";
const databaseId = "(default)";
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;

function getAccessToken() {
  return execFileSync("gcloud", ["auth", "print-access-token"], {
    encoding: "utf8"
  }).trim();
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (typeof value === "string") {
    return { stringValue: value };
  }
  if (typeof value === "boolean") {
    return { booleanValue: value };
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([key, item]) => {
          return [key, toFirestoreValue(item)];
        }))
      }
    };
  }
  return { stringValue: String(value) };
}

function toFirestoreDocument(data) {
  return {
    fields: Object.fromEntries(Object.entries(data).map(([key, value]) => {
      return [key, toFirestoreValue(value)];
    }))
  };
}

async function requestFirestore(token, path, options = {}) {
  const response = await fetch(`${baseUrl}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-goog-user-project": projectId,
      ...options.headers
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Firestore request failed for ${path}: ${response.status} ${body}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function writeDocument(token, path, data) {
  await requestFirestore(token, path, {
    method: "PATCH",
    body: JSON.stringify(toFirestoreDocument(data))
  });
}

async function listDocumentPaths(token, path) {
  const paths = [];
  let pageToken = "";

  do {
    const suffix = pageToken ? `${path}?pageToken=${encodeURIComponent(pageToken)}` : path;
    const body = await requestFirestore(token, suffix);
    paths.push(...(body.documents || []).map((document) => {
      return document.name.split("/documents/")[1];
    }));
    pageToken = body.nextPageToken || "";
  } while (pageToken);

  return paths;
}

async function deleteDocument(token, path) {
  await requestFirestore(token, path, { method: "DELETE" });
}

async function replaceCollection(token, collectionName, items) {
  const collectionPath = `vaults/main/${collectionName}`;
  const existingPaths = await listDocumentPaths(token, collectionPath);
  await Promise.all(existingPaths.map((path) => deleteDocument(token, path)));

  for (const item of items) {
    const { id, ...data } = item;
    await writeDocument(token, `${collectionPath}/${id}`, data);
  }
}

async function main() {
  const token = getAccessToken();
  await writeDocument(token, "vaults/main", knowledgeSeed.meta);

  for (const collectionName of ["articles", "sources", "checks", "outputs"]) {
    await replaceCollection(token, collectionName, knowledgeSeed[collectionName]);
  }

  console.log(`Seeded Firestore vault in ${projectId}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
