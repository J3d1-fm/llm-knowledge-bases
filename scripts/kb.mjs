#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKnowledgeSeed, loadVaultDocuments, vaultRoot } from "./load-vault.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const command = args[0] || "help";

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "document";
}

function parseFlags(rawArgs) {
  const flags = { _: [] };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith("--")) {
      flags._.push(arg);
      continue;
    }
    const [key, inlineValue] = arg.slice(2).split("=");
    if (inlineValue !== undefined) {
      flags[key] = inlineValue;
    } else if (rawArgs[index + 1] && !rawArgs[index + 1].startsWith("--")) {
      flags[key] = rawArgs[index + 1];
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

function frontmatterValue(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `\n${value.map((item) => `  - ${item}`).join("\n")}`;
  }
  return String(value ?? "");
}

function writeMarkdownDocument(filePath, meta, body) {
  const frontmatter = Object.entries(meta)
    .map(([key, value]) => `${key}:${Array.isArray(value) && value.length > 0 ? frontmatterValue(value) : ` ${frontmatterValue(value)}`}`)
    .join("\n");
  writeFileSync(filePath, `---\n${frontmatter}\n---\n${body.trim()}\n`, "utf8");
}

function uniquePath(directory, id) {
  let candidate = join(directory, `${id}.md`);
  let suffix = 2;
  while (existsSync(candidate)) {
    candidate = join(directory, `${id}-${suffix}.md`);
    suffix += 1;
  }
  return candidate;
}

function walkFiles(startPath, extensions) {
  if (!existsSync(startPath)) return [];
  const stats = statSync(startPath);
  if (stats.isFile()) {
    return extensions.has(extname(startPath).toLowerCase()) ? [startPath] : [];
  }
  return readdirSync(startPath)
    .sort()
    .flatMap((file) => walkFiles(join(startPath, file), extensions));
}

function titleFromContent(filePath, content) {
  const heading = content.match(/^#\s+(.+)$/m);
  if (heading) return heading[1].trim();
  return basename(filePath, extname(filePath)).replace(/[-_]+/g, " ");
}

function firstParagraph(markdown) {
  return markdown
    .replace(/^---[\s\S]*?---\s*/, "")
    .replace(/^#\s+.+$/m, "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .find(Boolean) || "";
}

function allDocuments() {
  const docs = loadVaultDocuments();
  return [
    ["meta", docs.metaDocument],
    ...docs.rawDocuments.map((item) => ["raw", item]),
    ...docs.articleDocuments.map((item) => ["articles", item]),
    ...docs.sourceDocuments.map((item) => ["sources", item]),
    ...docs.checkDocuments.map((item) => ["checks", item]),
    ...docs.outputDocuments.map((item) => ["outputs", item])
  ].map(([collection, document]) => ({ collection, ...document }));
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function stats(flags) {
  const seed = loadKnowledgeSeed();
  const result = {
    meta: seed.meta,
    counts: {
      raw: seed.raw?.length || 0,
      articles: seed.articles.length,
      sources: seed.sources.length,
      checks: seed.checks.length,
      outputs: seed.outputs.length
    }
  };
  if (flags.json) return printJson(result);
  console.log(`Vault: ${seed.meta.title}`);
  console.log(`Updated: ${seed.meta.updatedAt}`);
  console.log(`Words: ${seed.meta.wordCount}`);
  console.log(`Raw: ${result.counts.raw}`);
  console.log(`Articles: ${result.counts.articles}`);
  console.log(`Sources: ${result.counts.sources}`);
  console.log(`Checks: ${result.counts.checks}`);
  console.log(`Outputs: ${result.counts.outputs}`);
}

function search(flags) {
  const query = flags._.join(" ").trim();
  if (!query) throw new Error("Usage: npm run kb -- search <query> [--json] [--limit 10]");
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const limit = Number(flags.limit || 10);
  const results = allDocuments()
    .map((document) => {
      const haystack = [
        document.title,
        document.summary,
        document.kind,
        document.type,
        document.status,
        document.confidence,
        document.markdown
      ].filter(Boolean).join("\n").toLowerCase();
      const score = terms.reduce((total, term) => {
        const matches = haystack.split(term).length - 1;
        return total + matches;
      }, haystack.includes(query.toLowerCase()) ? 5 : 0);
      const snippetSource = document.summary || firstParagraph(document.markdown) || "";
      return {
        id: document.id,
        title: document.title,
        collection: document.collection,
        path: document.filePath,
        score,
        snippet: snippetSource.slice(0, 240)
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, limit);

  if (flags.json) return printJson(results);
  for (const item of results) {
    console.log(`${item.score}\t${item.collection}\t${item.id}\t${item.path}`);
    console.log(`  ${item.title}`);
    if (item.snippet) console.log(`  ${item.snippet}`);
  }
}

function show(flags) {
  const target = flags._[0];
  if (!target) throw new Error("Usage: npm run kb -- show <id-or-path> [--json]");
  const document = allDocuments().find((item) => {
    return item.id === target || item.filePath === target || item.filePath.endsWith(target);
  });
  if (!document) throw new Error(`No document found for ${target}`);
  if (flags.json) return printJson(document);
  console.log(`# ${document.title}`);
  console.log(`id: ${document.id}`);
  console.log(`collection: ${document.collection}`);
  console.log(`path: ${document.filePath}`);
  if (document.summary) console.log(`summary: ${document.summary}`);
  console.log("");
  console.log(document.markdown);
}

function health(flags) {
  const seed = loadKnowledgeSeed();
  const articleIds = new Set(seed.articles.map((item) => item.id));
  const sourceIds = new Set(seed.sources.map((item) => item.id));
  const usedSourceIds = new Set(seed.articles.flatMap((article) => article.sources || []));
  const issues = [];

  for (const raw of seed.raw || []) {
    if (!sourceIds.has(raw.id)) {
      issues.push({ severity: "medium", scope: "raw", id: raw.id, finding: "Raw source has no matching source record." });
    }
  }
  for (const article of seed.articles) {
    if (!article.sources?.length) {
      issues.push({ severity: "high", scope: "articles", id: article.id, finding: "Article has no source references." });
    }
    for (const linkedId of article.links || []) {
      if (!articleIds.has(linkedId)) {
        issues.push({ severity: "medium", scope: "articles", id: article.id, finding: `Missing linked article ${linkedId}.` });
      }
    }
  }
  for (const source of seed.sources) {
    if (!usedSourceIds.has(source.id)) {
      issues.push({ severity: "low", scope: "sources", id: source.id, finding: "Source is not referenced by any article." });
    }
  }
  for (const check of seed.checks) {
    if (["Blocked", "Needs research", "Needs verification"].includes(check.status)) {
      issues.push({ severity: check.severity?.toLowerCase() || "medium", scope: "checks", id: check.id, finding: `${check.title}: ${check.status}` });
    }
  }

  const result = {
    counts: {
      raw: seed.raw?.length || 0,
      articles: seed.articles.length,
      sources: seed.sources.length,
      checks: seed.checks.length,
      outputs: seed.outputs.length
    },
    issues
  };
  if (flags.json) return printJson(result);
  console.log(`Health issues: ${issues.length}`);
  for (const issue of issues) {
    console.log(`${issue.severity}\t${issue.scope}\t${issue.id}\t${issue.finding}`);
  }
}

function ingest(flags) {
  const sourcePath = flags._[0];
  if (!sourcePath) throw new Error("Usage: npm run kb -- ingest <path> [--dry-run] [--limit 50]");
  const resolved = resolve(sourcePath);
  const limit = Number(flags.limit || 0);
  const files = walkFiles(resolved, new Set([".md", ".txt"]));
  const selectedFiles = limit > 0 ? files.slice(0, limit) : files;
  const rawDir = join(vaultRoot, "raw");
  mkdirSync(rawDir, { recursive: true });

  const operations = selectedFiles.map((file) => {
    const content = readFileSync(file, "utf8");
    const title = titleFromContent(file, content);
    const id = slugify(title || basename(file, extname(file)));
    const destination = uniquePath(rawDir, id);
    return { file, id: basename(destination, ".md"), title, destination, content };
  });

  if (flags["dry-run"]) {
    return printJson(operations.map((item) => ({
      from: item.file,
      to: relative(root, item.destination),
      title: item.title
    })));
  }

  for (const item of operations) {
    const extension = extname(item.file).toLowerCase();
    const body = extension === ".md" ? item.content : `# ${item.title}\n\n${item.content}`;
    writeMarkdownDocument(item.destination, {
      id: item.id,
      title: item.title,
      kind: "Imported document",
      status: "Imported",
      summary: `Imported from ${relative(resolved, item.file) || basename(item.file)}. Needs compilation.`
    }, body);
  }

  console.log(`Imported ${operations.length} files into ${relative(root, rawDir)}.`);
}

function registerRaw(flags) {
  const seed = loadKnowledgeSeed();
  const sourceIds = new Set(seed.sources.map((item) => item.id));
  const sourceDir = join(vaultRoot, "wiki", "sources");
  mkdirSync(sourceDir, { recursive: true });
  const missing = (seed.raw || []).filter((raw) => !sourceIds.has(raw.id));

  if (flags["dry-run"]) {
    return printJson(missing.map((raw) => ({
      id: raw.id,
      title: raw.title,
      destination: relative(root, join(sourceDir, `${raw.id}.md`))
    })));
  }

  for (const raw of missing) {
    writeMarkdownDocument(join(sourceDir, `${raw.id}.md`), {
      id: raw.id,
      title: raw.title,
      kind: raw.kind || "Imported document",
      status: raw.status || "Imported",
      summary: raw.summary || "Imported raw source. Needs compilation.",
      usedBy: []
    }, `# ${raw.title}\n\nSource record for \`${raw.filePath || `vault/raw/${raw.id}.md`}\`.`);
  }

  console.log(`Created ${missing.length} source records.`);
}

function help() {
  console.log(`Usage: npm run kb -- <command>

Commands:
  stats [--json]                         Print vault counters.
  search <query> [--json] [--limit N]    Search raw/wiki/check/output markdown.
  show <id-or-path> [--json]             Print one document.
  health [--json]                        Print agent-readable integrity queue.
  ingest <path> [--dry-run] [--limit N]  Import .md/.txt files into vault/raw.
  register-raw [--dry-run]               Create missing source records for raw files.
`);
}

try {
  const flags = parseFlags(args.slice(1));
  if (command === "stats") stats(flags);
  else if (command === "search") search(flags);
  else if (command === "show") show(flags);
  else if (command === "health") health(flags);
  else if (command === "ingest") ingest(flags);
  else if (command === "register-raw") registerRaw(flags);
  else help();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
