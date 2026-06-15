import { knowledgeSeed } from "./knowledge-seed-data.mjs";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const failures = [];
const collections = ["articles", "sources", "checks", "outputs"];
const root = dirname(dirname(fileURLToPath(import.meta.url)));

function idsFor(collectionName) {
  return new Set(knowledgeSeed[collectionName].map((item) => item.id));
}

function requireField(collectionName, item, field) {
  if (item[field] === undefined || item[field] === null || item[field] === "") {
    failures.push(`${collectionName}/${item.id} is missing ${field}`);
  }
}

for (const collectionName of collections) {
  const seen = new Set();
  for (const item of knowledgeSeed[collectionName]) {
    requireField(collectionName, item, "id");
    requireField(collectionName, item, "title");
    if (seen.has(item.id)) failures.push(`Duplicate id in ${collectionName}: ${item.id}`);
    seen.add(item.id);
  }
}

const articleIds = idsFor("articles");
const sourceIds = idsFor("sources");

for (const article of knowledgeSeed.articles) {
  for (const field of ["type", "confidence", "summary"]) requireField("articles", article, field);
  if (!Array.isArray(article.body) || article.body.length === 0) {
    failures.push(`articles/${article.id} must have non-empty body paragraphs`);
  }
  for (const linkedId of article.links || []) {
    if (!articleIds.has(linkedId)) failures.push(`articles/${article.id} links to missing article ${linkedId}`);
  }
  for (const sourceId of article.sources || []) {
    if (!sourceIds.has(sourceId)) failures.push(`articles/${article.id} references missing source ${sourceId}`);
  }
}

for (const source of knowledgeSeed.sources) {
  for (const field of ["kind", "status", "summary"]) requireField("sources", source, field);
  for (const articleId of source.usedBy || []) {
    if (!articleIds.has(articleId)) failures.push(`sources/${source.id} usedBy references missing article ${articleId}`);
  }
}

for (const check of knowledgeSeed.checks) {
  for (const field of ["severity", "status", "scope", "finding", "nextAction"]) requireField("checks", check, field);
}

for (const output of knowledgeSeed.outputs) {
  for (const field of ["type", "status", "path", "summary"]) requireField("outputs", output, field);
  if (output.status !== "Candidate" && output.path.endsWith(".md") && !existsSync(join(root, output.path))) {
    failures.push(`outputs/${output.id} points to missing markdown file ${output.path}`);
  }
}

if (knowledgeSeed.meta.articleCount !== knowledgeSeed.articles.length) {
  failures.push("meta.articleCount does not match article collection size");
}

if (knowledgeSeed.meta.sourceCount !== knowledgeSeed.sources.length) {
  failures.push("meta.sourceCount does not match source collection size");
}

if (knowledgeSeed.meta.outputCount !== knowledgeSeed.outputs.length) {
  failures.push("meta.outputCount does not match output collection size");
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Vault validation passed for ${knowledgeSeed.articles.length} articles, ${knowledgeSeed.sources.length} sources, ${knowledgeSeed.checks.length} checks, and ${knowledgeSeed.outputs.length} outputs.`);
