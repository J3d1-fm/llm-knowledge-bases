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

Current setup blocker: Firebase Authentication still needs to be initialized in the Firebase Console and Google sign-in must be enabled for project `llm-knowledge-bases`. CLI/API initialization returned `CONFIGURATION_NOT_FOUND`, and the API init route requires billing-enabled Identity Platform.

Manual console path:

```text
Firebase Console -> llm-knowledge-bases -> Authentication -> Get started -> Sign-in method -> Google -> Enable -> Save
```

Seed or refresh Firestore from the markdown vault with:

```bash
npm run seed:firestore
```

The seed command validates the vault first, clears stale documents from the four managed collections, then writes the current markdown snapshot.

## Deploy Target

Primary deploy target: Firebase Hosting project `llm-knowledge-bases`.

Legacy deploy target: GitHub Pages workflow still exists, but it should be treated as secondary because authenticated workspace data now depends on Firebase Auth and Firestore.

## Version

Current version: `v0.4.0`
