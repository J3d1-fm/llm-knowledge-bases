---
id: source-agent-cli-tooling-notes
title: Agent CLI Tooling Notes
kind: Tooling notes
status: Indexed
summary: Notes on deterministic helper commands that make LLM vault work more reliable than freeform prompting alone.
---
# Agent CLI Tooling Notes

The LLM should not manually rediscover the entire vault every time. It should have deterministic tools for search, link validation, source coverage, stale page listing, graph inspection, and output rendering.

These tools should be simple enough for a human to run and predictable enough for an agent to call. The first version can be command-line scripts; a web UI can wrap them later.

Good tools should output structured data or concise markdown, not only terminal prose.
