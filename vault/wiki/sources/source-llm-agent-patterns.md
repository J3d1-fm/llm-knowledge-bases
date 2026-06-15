---
id: source-llm-agent-patterns
title: Agent Compiler Pattern Notes
kind: Research notes
status: Needs expansion
summary: Maps how an LLM agent can maintain indexes, article summaries, backlinks, and source manifests without a heavy retrieval stack.
usedBy:
  - wiki-compiler
  - agent-cli
---
# Agent Compiler Pattern Notes

The agent should work in repeatable passes: ingest raw material, extract claims, update source records, update or create concept pages, refresh indexes, and leave a review queue.
