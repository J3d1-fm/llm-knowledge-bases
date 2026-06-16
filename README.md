# LLM Knowledge Bases

Firebase-hosted landing page and authenticated workspace for the LLM Knowledge Bases product concept.

The project now has a local markdown vault as the source of truth:

- `vault/raw/` stores imported source material
- `vault/wiki/articles/` stores compiled wiki pages
- `vault/wiki/sources/` stores source records and coverage links
- `vault/wiki/checks/` stores integrity checks
- `vault/outputs/` stores reusable reports, decks, and artifact records

Firestore is a deploy target generated from the vault, not the authoring surface.

Current first content batch:

- workflow and Obsidian raw notes
- example compiled wiki and health-check notes
- generic market-map notes awaiting source-specific competitor imports
- RAG vs filesystem wiki notes
- agent CLI tooling notes
- output-format notes
- synthetic-data and finetuning notes
- Firebase authenticated workspace notes

## Vault CLI

Use the local CLI when Codex or another agent needs fast access to the knowledge base:

```bash
npm run kb -- stats
npm run kb -- search "Obsidian workflow" --limit 5
npm run kb -- show llm-owned-wiki
npm run kb -- health
```

To import a real local markdown/text corpus:

```bash
npm run kb -- ingest /path/to/source-folder --dry-run
npm run kb -- ingest /path/to/source-folder
npm run kb -- register-raw
npm run validate
npm run seed:firestore
```

`vault/inbox/` is available as a staging folder for unsorted exports. Do not commit private or sensitive source documents to the public GitHub repository unless that is explicitly intended.

## Global Work DB

The global work database is private/local and generated under `outputs/global-work-kb/`, which is ignored by git.

```bash
npm run workdb -- refresh-external
npm run workdb -- build
npm run workdb -- stats
npm run workdb -- search "Drive Zone"
npm run workdb -- project "Piano"
npm run workdb -- tags --limit 40
npm run workdb -- context "Drive Zone" --limit 12
npm run workdb -- show <graph-id-or-path>
npm run workdb -- analyze-tag "firebase"
npm run workdb -- analyze-cluster "cloud-auth"
npm run workdb -- serve --port 8765
```

The generator indexes local Codex Projects, Codex daily workspaces, Codex memory files, Codex skills, Claude files, local git remotes, Codex session index, and optional GitHub/GCloud/Firebase inventory. Secret-looking files are indexed by metadata only and marked sensitive.

Generated private outputs include:

- `db.json` for aggregate counts, projects, sessions, external inventory, and tags
- `files.jsonl` for file-level metadata and safe snippets
- `projects.jsonl` for project cards and local git remotes
- `sessions.jsonl` for Codex and Claude session/task metadata
- `raw-registry.jsonl` for the generated raw diary/index snapshot
- `chronology.jsonl` for the cross-source chronological work log
- `catalog.md` for the inferred master catalog of current work clusters
- `provenance.md` for `extracted`, `inferred`, and `ambiguous` rules
- `tag-cloud.html` for the interactive Obsidian/Hermes-style clustered memory graph
- `analysis/` for generated markdown dossiers and JSON manifests created from graph tag/cluster analysis commands

Raw source files are the diary layer. The generated registry and chronology are rebuildable indexes over that layer, not append-only audit logs.

The canvas renders a readable overview graph, not all 80k+ files as individual dots. The full base remains reachable through drill-down counts, analysis reports, and JSON manifests.

Every linked graph endpoint and every rendered bend vertex is marked with a connection dot, including theme-cluster centers, so lines do not terminate or turn at invisible points.

Use `Fit all` to show the complete clustered graph in the current viewport. The `-` and `+` controls adjust zoom explicitly when a trackpad or mouse wheel is not precise enough.

When served locally, the graph is a working DB surface, not only a picture:

- `Context` builds a compact markdown context pack for the selected node.
- `Preview` reads safe local markdown/text content for indexed file nodes.
- `Reveal in Finder` opens the indexed local path from the localhost server only.
- `/api/search`, `/api/context`, `/api/file`, and `/api/open` are available from `npm run workdb -- serve`.

Codex can use this database as a routing layer before opening full project files:

```bash
npm run workdb -- context "project or topic" --limit 12
npm run workdb -- search "project or topic" --limit 20 --json
npm run workdb -- show <graph-id-or-path>
```

The public site does not ship private paths or files. It includes only `assets/tag-cloud-snapshot.json`, a sanitized label-free visual snapshot generated from the private graph.

Open the private graph through the local server when you want in-graph analysis buttons to run directly:

```bash
npm run workdb -- serve --port 8765
```

Then open `http://127.0.0.1:8765/tag-cloud.html`. The same HTML still works as a static file, but static mode cannot execute local CLI analysis; it falls back to showing/copying the command.

The page presents a filesystem-first research workflow:

- raw source ingest
- agent-maintained markdown wiki compilation
- Q&A and Obsidian-ready outputs
- health checks for data integrity
- a populated workspace backed by Firebase Auth and Firestore

## Local Preview

Open `index.html` in a browser, or run a local static server from this directory.

Open `app.html` through a local static server to review layout. Google sign-in and Firestore reads are intended to run from Firebase Hosting.

## Build

Run:

```bash
node scripts/validate-static.mjs
node scripts/validate-vault.mjs
node scripts/validate-workdb.mjs
node scripts/build-pages.mjs
```

The build output is written to `dist/`.

## Firebase Auth And Data

`firebase-config.js` contains the Firebase Web App config and allowed owner email:

```js
window.LKB_ACCESS_CONFIG = {
  allowedEmails: ["j3d1fm@gmail.com"]
};
```

Workspace data is stored in Firestore under `vaults/main`. Firestore rules allow read access only when the signed-in Firebase Auth user email is `j3d1fm@gmail.com`.

Current Firestore shape:

```text
vaults/main
vaults/main/articles/{articleId}
vaults/main/sources/{sourceId}
vaults/main/checks/{checkId}
vaults/main/outputs/{outputId}
```

Firebase Authentication is initialized for project `llm-knowledge-bases`, Google sign-in is enabled, and the current authorized domains include Firebase Hosting plus `j3d1-fm.github.io` for GitHub Pages.

Seed or refresh Firestore from the markdown vault with:

```bash
npm run seed:firestore
```

The seed command validates the vault first, clears stale documents from the four managed collections, then writes the current markdown snapshot.

## Deploy Target

Primary deploy target: Firebase Hosting project `llm-knowledge-bases`.

Legacy deploy target: GitHub Pages workflow still exists, but it should be treated as secondary because authenticated workspace data now depends on Firebase Auth and Firestore.

## Version

Current version: `v0.9.1`
