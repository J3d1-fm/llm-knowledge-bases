import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const appJs = readFileSync(join(root, "app.js"), "utf8");
const appHtml = readFileSync(join(root, "app.html"), "utf8");
const styles = readFileSync(join(root, "styles.css"), "utf8");
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

if (!appJs.includes('let activeView = "workdb";')) {
  failures.push("Authenticated workspace must default to the Work DB view.");
}

if (!appJs.includes("function renderCloudStatus") || !appHtml.includes('id="cloudStatus"')) {
  failures.push("Authenticated workspace must expose cloud Work DB status diagnostics.");
}

if (!appJs.includes("Firestore Work DB context is empty")) {
  failures.push("Authenticated workspace must fail clearly when Firestore workdbContext is empty.");
}

if (appHtml.indexOf('data-view="workdb"') > appHtml.indexOf('data-view="articles"')) {
  failures.push("Work DB navigation must appear before Articles.");
}

if (!appHtml.includes('id="workdbSnapshot"') || !appJs.includes("function startWorkdbSnapshot")) {
  failures.push("Authenticated workspace must render the Work DB tag cloud snapshot.");
}

if (
  !appJs.includes('const workdbMap = document.querySelector(".workdb-map");')
  || !appJs.includes("function updateViewState()")
  || !appJs.includes('workdbMap.hidden = activeView !== "workdb";')
) {
  failures.push("Work DB graph must be scoped to the Work DB view state.");
}

const directNavStateCalls = [...appJs.matchAll(/^\s+updateNavState\(\);$/gm)].length;
if (directNavStateCalls !== 1) {
  failures.push("Navigation state updates must route through updateViewState except inside updateViewState itself.");
}

if (!appJs.includes("return await response.json();") || appJs.includes("return response.json();")) {
  failures.push("Work DB graph snapshot JSON parsing must be caught by the fallback path.");
}

if (!styles.includes("[hidden]") || !styles.includes("display: none !important")) {
  failures.push("Stylesheet must preserve hidden attribute behavior for auth/workspace view switching.");
}

const forbiddenAuthGateCopy = [
  "Firestore",
  "Firebase Authentication",
  "allowed Google account",
  "Access is currently restricted"
];

for (const phrase of forbiddenAuthGateCopy) {
  if (appHtml.includes(phrase)) {
    failures.push(`Public sign-in screen exposes implementation/security copy: ${phrase}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`App smoke validation passed for ${idsReferencedByApp.length} DOM references.`);
