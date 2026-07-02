---
id: personal-codex-workdb-project-base
title: Personal Codex And Work DB Project Base
type: ProjectBase
status: Ready
path: vault/outputs/project-bases/personal-codex-workdb-base.md
summary: Routing base for Personal Codex runtime, Work DB, project paths, local plugins, gateway docs, and the Obsidian vault handover layer.
updatedAt: 2026-07-02
tags:
  - project-bases
  - personal-codex
  - workdb
  - obsidian
  - firebase
  - plugins
---
# Personal Codex And Work DB Project Base

## Current State

The sweep confirmed the active Personal Codex workspace and the LLM Knowledge Bases Work DB repository were clean and pushed before these project-base additions. This record is the project-routing surface for future Codex sessions that need the local runtime, Work DB, project account routing, gateway, and Obsidian-style vault context.

## GitHub Refs From The Sweep

- `Personal Projects Codex`, branch `codex/computer-repair-snapshot-20260609`, commit `dd3b366`.
- `llm-knowledge-bases`, branch `main`, commit `ae83d39` before the project-base records.

## Source Documents In Handover ZIP

- `personal_codex/active_workspace/README.md`
- `personal_codex/active_workspace/CHANGELOG.md`
- `personal_codex/active_workspace/TECHNICAL_DOCUMENTATION.txt`
- `personal_codex/active_workspace/PROJECT_PATHS.md`
- `personal_codex/active_workspace/AGENTS.md`
- `personal_codex/active_workspace/VERSION.txt`
- `personal_codex/active_workspace/personal-codex-gateway/README.md`
- `personal_codex/active_workspace/personal-codex-gateway/AGENTS.md`
- `personal_codex/active_workspace/plugins/project-google-accounts/v0.1.3/README.md`
- `personal_codex/active_workspace/codex_active_dashboard/README.md`
- `work_db/llm_knowledge_bases/README.md`
- `work_db/llm_knowledge_bases/CHANGELOG.txt`
- `work_db/llm_knowledge_bases/TECHNICAL_DOCUMENTATION.txt`
- `work_db/llm_knowledge_bases/outputs/global-work-kb/README.md`
- `work_db/graphs/llm-kb-workdb-graph-v0125.png`

## Operating Notes

- Treat Work DB as routing and reuse context, not as proof of current source truth.
- Use the local Work DB exact CLI when a task needs private paths or file previews.
- Use the Firestore cloud CLI for remote-safe context packs and freshness checks.
- Do not copy local paths, snippets, token-bearing URLs, OAuth material, or plugin cache payloads into remote-safe records.

## Next Entry Points

- Refresh local Work DB after meaningful project changes with `npm run workdb:build`, `npm run workdb:remote`, and validation.
- Seed Firestore only after vault validation passes.
- Keep this project base updated when future handover folders replace the current Drive package.
