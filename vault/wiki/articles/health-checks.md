---
id: health-checks
title: Knowledge Health Checks
type: Integrity
confidence: Medium
summary: LLM health checks can find contradictions, weak citations, missing data, stale summaries, orphan concepts, and article candidates.
tags:
  - quality
  - linting
  - integrity
links:
  - source-coverage
  - wiki-compiler
  - interesting-question-engine
sources:
  - source-user-brief
  - source-health-check-notes
---
# Knowledge Health Checks

The health layer is what turns the wiki from a pile of generated prose into a maintained research asset.

The most important checks are not cosmetic. They should flag contradictions, source gaps, old claims, and generated pages that no longer reflect the raw material.

Health checks should produce actionable queues: fix now, research later, merge duplicate concept, add source, or promote output into wiki.
