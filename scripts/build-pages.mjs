import { cpSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const siteFiles = [
  "index.html",
  "app.html",
  "styles.css",
  "script.js",
  "app.js",
  "firebase-config.js",
  ".nojekyll",
  "assets"
];

execFileSync("node", [join(root, "scripts", "build-public-snapshot.mjs")], { stdio: "inherit" });

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const file of siteFiles) {
  cpSync(join(root, file), join(dist, file), { recursive: true });
}

console.log(`Built GitHub Pages artifact with ${siteFiles.length} top-level entries.`);
