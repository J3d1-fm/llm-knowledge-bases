---
id: search-and-retrieval-strategy
title: Search and Retrieval Strategy
type: Architecture
confidence: Medium
summary: The first retrieval layer can be deterministic filesystem search plus maintained indexes before introducing heavier RAG infrastructure.
tags:
  - search
  - rag
  - architecture
links:
  - agent-cli
  - filesystem-source-of-truth
  - raw-to-compiled-vault
sources:
  - source-rag-vs-filesystem-notes
  - source-agent-cli-tooling-notes
  - source-search-prototype
---
# Search and Retrieval Strategy

The system can start with deterministic search over markdown and structured indexes. At the current scale, a well-maintained filesystem wiki is often enough for an LLM agent to find relevant context.

RAG is still a possible later layer. It becomes more attractive when the corpus grows beyond direct inspection or when source formats become too numerous for simple search.

The important rule is that retrieval should not replace synthesis. The compiled wiki remains the durable layer where conclusions, links, and source coverage accumulate.
