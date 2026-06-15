# LLM Knowledge Bases

Static landing page for the LLM Knowledge Bases product concept.

The page presents a filesystem-first research workflow:

- raw source ingest
- agent-maintained markdown wiki compilation
- Q&A and Obsidian-ready outputs
- health checks for data integrity

## Local Preview

Open `index.html` in a browser, or run a local static server from this directory.

## Build

Run:

```bash
node scripts/validate-static.mjs
node scripts/build-pages.mjs
```

The build output is written to `dist/`.

## Deploy Target

The repository is prepared for GitHub Pages through `.github/workflows/pages.yml`. The workflow validates the static site, builds a minimal `dist/` artifact, and deploys only that artifact.

## Version

Current version: `v0.1.1`
