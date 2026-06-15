import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const appJs = readFileSync(join(root, "app.js"), "utf8");
const appHtml = readFileSync(join(root, "app.html"), "utf8");
const failures = [];

const forbiddenStaleIdentifiers = [
  "previewButton",
  "authConfig",
  "writeSession",
  "googleSignIn"
];

for (const identifier of forbiddenStaleIdentifiers) {
  if (appJs.includes(identifier)) {
    failures.push(`Stale app.js identifier remains: ${identifier}`);
  }
}

const idsReferencedByApp = [...appJs.matchAll(/querySelector\("#([^"]+)"\)/g)]
  .map((match) => match[1]);

for (const id of idsReferencedByApp) {
  if (!appHtml.includes(`id="${id}"`)) {
    failures.push(`app.js references missing app.html id: ${id}`);
  }
}

if (!appHtml.includes('script type="module" src="app.js"')) {
  failures.push("app.html must load app.js as a module");
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`App smoke validation passed for ${idsReferencedByApp.length} DOM references.`);
