---
id: document-ingestion-pipeline
title: Document Ingestion Pipeline
type: Data Pipeline
confidence: Medium
summary: Ingestion should preserve raw files, create source records, extract claims, and queue compilation work instead of immediately flattening everything into summaries.
tags:
  - ingest
  - raw
  - pipeline
links:
  - raw-to-compiled-vault
  - source-coverage
  - health-checks
sources:
  - source-current-workflow-notes
  - source-example-compiled-wiki-output
---
# Document Ingestion Pipeline

Good ingestion starts by preserving the input. A clipped article, PDF note, repository summary, dataset note, or screenshot should land in the raw layer with enough metadata to audit later.

The next step is a source record. It should capture title, kind, status, summary, and which compiled pages use the source.

Compilation can then happen incrementally. The agent updates existing pages when the source supports known concepts and creates new article candidates when the source introduces a repeated or important concept.
