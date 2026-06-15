import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const vaultRoot = join(root, "vault");

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((item) => parseScalar(item));
  }
  return trimmed.replace(/^["']|["']$/g, "");
}

function parseFrontmatter(frontmatter, filePath) {
  const data = {};
  let currentListKey = null;

  for (const rawLine of frontmatter.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const listMatch = line.match(/^\s*-\s+(.*)$/);
    if (listMatch && currentListKey) {
      data[currentListKey].push(parseScalar(listMatch[1]));
      continue;
    }

    const keyMatch = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!keyMatch) {
      throw new Error(`Unsupported frontmatter line in ${relative(root, filePath)}: ${line}`);
    }

    const [, key, rawValue = ""] = keyMatch;
    if (rawValue.trim() === "") {
      data[key] = [];
      currentListKey = key;
    } else {
      data[key] = parseScalar(rawValue);
      currentListKey = null;
    }
  }

  return data;
}

export function parseMarkdownDocument(filePath) {
  const content = readFileSync(filePath, "utf8");
  if (!content.startsWith("---\n")) {
    throw new Error(`Missing frontmatter in ${relative(root, filePath)}`);
  }

  const end = content.indexOf("\n---", 4);
  if (end === -1) {
    throw new Error(`Unclosed frontmatter in ${relative(root, filePath)}`);
  }

  const frontmatter = content.slice(4, end);
  const markdown = content.slice(end + 4).trim();
  const meta = parseFrontmatter(frontmatter, filePath);
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const title = meta.title || titleMatch?.[1];

  if (!meta.id && !meta.title) {
    throw new Error(`Document must include id or title: ${relative(root, filePath)}`);
  }

  return {
    ...meta,
    title,
    markdown,
    filePath: relative(root, filePath)
  };
}

function walkMarkdownFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .sort()
    .flatMap((file) => {
      const fullPath = join(directory, file);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) return walkMarkdownFiles(fullPath);
      if (file.endsWith(".md") && file !== "index.md") return [fullPath];
      return [];
    });
}

export function listMarkdownDocuments(directory) {
  const fullDir = join(vaultRoot, directory);
  if (!existsSync(fullDir)) return [];

  return walkMarkdownFiles(fullDir).map((file) => parseMarkdownDocument(file));
}

function articleBody(markdown) {
  return markdown
    .replace(/^#\s+.+$/m, "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph && !paragraph.startsWith("## "));
}

function countWords(text) {
  const words = text.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g);
  return words ? words.length : 0;
}

function publicDocument(document, extra = {}) {
  const { markdown, filePath, ...data } = document;
  return {
    ...data,
    ...extra
  };
}

export function loadVaultDocuments() {
  const metaDocument = parseMarkdownDocument(join(vaultRoot, "index.md"));
  return {
    metaDocument,
    rawDocuments: listMarkdownDocuments("raw"),
    articleDocuments: listMarkdownDocuments("wiki/articles"),
    sourceDocuments: listMarkdownDocuments("wiki/sources"),
    checkDocuments: listMarkdownDocuments("wiki/checks"),
    outputDocuments: listMarkdownDocuments("outputs")
  };
}

export function loadKnowledgeSeed() {
  const {
    metaDocument,
    rawDocuments,
    articleDocuments,
    sourceDocuments,
    checkDocuments,
    outputDocuments
  } = loadVaultDocuments();

  const articles = articleDocuments.map((document) => publicDocument(document, {
    body: articleBody(document.markdown)
  }));
  const sources = sourceDocuments.map((document) => publicDocument(document));
  const checks = checkDocuments.map((document) => publicDocument(document));
  const outputs = outputDocuments.map((document) => publicDocument(document));
  const raw = rawDocuments.map((document) => publicDocument(document));
  const wordCount = [
    metaDocument,
    ...rawDocuments,
    ...articleDocuments,
    ...sourceDocuments,
    ...checkDocuments,
    ...outputDocuments
  ].reduce((total, document) => total + countWords(document.markdown), 0);

  return {
    meta: {
      ...publicDocument(metaDocument),
      rawCount: rawDocuments.length,
      articleCount: articles.length,
      sourceCount: sources.length,
      outputCount: outputs.length,
      wordCount
    },
    raw,
    articles,
    sources,
    checks,
    outputs
  };
}
