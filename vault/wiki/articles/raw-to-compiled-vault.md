---
id: raw-to-compiled-vault
title: Raw to Compiled Vault
type: Workflow
confidence: High
summary: Source documents enter the raw layer first, then the LLM compiles them into source records, concept pages, health checks, and outputs.
tags:
  - ingest
  - compilation
  - source-of-truth
links:
  - filesystem-source-of-truth
  - llm-owned-wiki
  - source-coverage
sources:
  - source-user-brief
  - source-current-workflow-notes
  - source-rag-vs-filesystem-notes
---
# Raw to Compiled Vault

The raw layer preserves inputs before interpretation. This matters because the compiled wiki will change over time, but the system still needs a traceable basis for claims and summaries.

The compiled layer is the agent-maintained view: article pages, source records, concept links, indexes, checks, and reusable outputs. The user should read the compiled layer most of the time, while the agent can inspect raw files when evidence is needed.

This split keeps the system auditable. A future health check can ask whether a compiled page still reflects its raw sources instead of trusting generated prose blindly.
