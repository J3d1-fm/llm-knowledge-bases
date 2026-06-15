---
id: source-coverage
title: Source Coverage Model
type: Data Model
confidence: Medium
summary: Every wiki article should know which sources support it, which raw materials were ignored, and which claims still need confirmation.
tags:
  - data-model
  - citations
  - trust
links:
  - health-checks
  - wiki-compiler
  - filesystem-source-of-truth
sources:
  - source-health-check-notes
  - source-user-brief
---
# Source Coverage Model

Coverage is the bridge between raw ingest and trust. Without it, the wiki becomes polished but hard to audit.

A simple coverage model can track source IDs, extracted claims, confidence, last reviewed date, and affected wiki pages.

This can stay lightweight for a 100-article vault: markdown frontmatter plus generated index pages is enough before a database is justified.
