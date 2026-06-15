import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const required = [
  "index.html",
  "styles.css",
  "script.js",
  "README.md",
  "CHANGELOG.txt",
  "TECHNICAL_DOCUMENTATION.txt",
  "assets/knowledge-workbench-hero.png",
  "scripts/build-pages.mjs",
  ".github/workflows/pages.yml"
];

const failures = [];

for (const file of required) {
  if (!existsSync(join(root, file))) {
    failures.push(`Missing required file: ${file}`);
  }
}

const html = readFileSync(join(root, "index.html"), "utf8");
const css = readFileSync(join(root, "styles.css"), "utf8");

if (!html.includes("<title>LLM Knowledge Bases</title>")) {
  failures.push("index.html title is not set to LLM Knowledge Bases");
}

if (!html.includes("<h1>LLM Knowledge Bases</h1>")) {
  failures.push("index.html H1 is not set to LLM Knowledge Bases");
}

const localReferences = [
  ...html.matchAll(/(?:href|src)="([^":#]+)"/g),
  ...css.matchAll(/url\("([^":#]+)"\)/g)
].map((match) => match[1]).filter((ref) => {
  return !ref.startsWith("#") && !ref.startsWith("mailto:") && !ref.startsWith("tel:");
});

for (const ref of localReferences) {
  if (!existsSync(join(root, ref))) {
    failures.push(`Unresolved local reference: ${ref}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Static validation passed for ${required.length} required files and ${localReferences.length} local references.`);
