---
id: agent-cli
title: Agent CLI Tooling
type: Tools
confidence: Medium
summary: Small command-line tools can give the LLM better handles: search the vault, inspect backlinks, render charts, export decks, and run health checks.
tags:
  - cli
  - search
  - automation
links:
  - query-to-artifact-loop
  - health-checks
  - output-studio
sources:
  - source-user-brief
  - source-search-prototype
---
# Agent CLI Tooling

The CLI layer should expose deterministic operations that are awkward to perform through freeform prompting alone.

The user can use the same tools directly in a web UI, but the primary customer may be the LLM agent itself.

The first tools should be boring and reliable: search, list stale pages, validate links, summarize source coverage, and render output files.
