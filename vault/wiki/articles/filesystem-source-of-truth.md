---
id: filesystem-source-of-truth
title: Filesystem as Source of Truth
type: Architecture
confidence: High
summary: The durable system is a local directory of markdown, images, and generated outputs that can be inspected, versioned, copied, and opened in Obsidian.
tags:
  - architecture
  - obsidian
  - portability
links:
  - wiki-compiler
  - query-to-artifact-loop
  - health-checks
sources:
  - source-user-brief
  - source-obsidian-workflow
---
# Filesystem as Source of Truth

The core product promise is that knowledge work should add up. Raw sources enter the vault once, compiled wiki pages evolve over time, and every meaningful answer can be filed back into the knowledge base.

This structure makes the user less dependent on a single agent session. The LLM can rebuild context from indexes, backlinks, summaries, and source manifests without needing a heavy RAG stack at small scale.

The filesystem model also keeps exit costs low: the user can keep Obsidian, git, image folders, Marp decks, and local scripts even if the agent layer changes.
