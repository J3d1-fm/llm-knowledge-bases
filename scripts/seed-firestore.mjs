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

async function writeDocument(token, path, data) {
  const response = await fetch(`${baseUrl}/${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-goog-user-project": projectId
    },
    body: JSON.stringify(toFirestoreDocument(data))
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to write ${path}: ${response.status} ${body}`);
  }
}

async function main() {
  const token = getAccessToken();
  await writeDocument(token, "vaults/main", knowledgeSeed.meta);

  for (const collectionName of ["articles", "sources", "checks", "outputs"]) {
    for (const item of knowledgeSeed[collectionName]) {
      const { id, ...data } = item;
      await writeDocument(token, `vaults/main/${collectionName}/${id}`, data);
    }
  }

  console.log(`Seeded Firestore vault in ${projectId}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
