import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const required = [
  "index.html",
  "app.html",
  "styles.css",
  "script.js",
  "app.js",
  "firebase-config.js",
  "firebase.json",
  ".firebaserc",
  "firestore.rules",
  "firestore.indexes.json",
  "README.md",
  "CHANGELOG.txt",
  "TECHNICAL_DOCUMENTATION.txt",
  "assets/knowledge-workbench-hero.png",
  "scripts/build-pages.mjs",
  "scripts/smoke-app.mjs",
  ".github/workflows/pages.yml"
];

const failures = [];

for (const file of required) {
  if (!existsSync(join(root, file))) {
    failures.push(`Missing required file: ${file}`);
  }
}

const htmlFiles = ["index.html", "app.html"];
const html = htmlFiles.map((file) => readFileSync(join(root, file), "utf8")).join("\n");
const css = readFileSync(join(root, "styles.css"), "utf8");

if (!html.includes("<title>LLM Knowledge Bases</title>")) {
  failures.push("index.html title is not set to LLM Knowledge Bases");
}

if (!html.includes("<h1>LLM Knowledge Bases</h1>")) {
  failures.push("index.html H1 is not set to LLM Knowledge Bases");
}

const localReferences = [
  ...htmlFiles.flatMap((file) => {
    const content = readFileSync(join(root, file), "utf8");
    return [...content.matchAll(/(?:href|src)="([^":#]+)"/g)].map((match) => {
      return { ref: match[1], file };
    });
  }),
  ...css.matchAll(/url\("([^":#]+)"\)/g)
].map((entry) => {
  if (Array.isArray(entry)) return { ref: entry[1], file: "styles.css" };
  return entry;
}).filter(({ ref }) => {
  return !ref.startsWith("#") && !ref.startsWith("mailto:") && !ref.startsWith("tel:");
});

for (const { ref, file } of localReferences) {
  if (!existsSync(join(root, ref))) {
    failures.push(`Unresolved local reference in ${file}: ${ref}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Static validation passed for ${required.length} required files and ${localReferences.length} local references.`);
