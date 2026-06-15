---
id: evaluation-and-health-scoring
title: Evaluation and Health Scoring
type: Integrity
confidence: Medium
summary: The vault should expose health as actionable checks, not vague quality scores, so the agent can repair weak areas.
tags:
  - evaluation
  - health
  - integrity
links:
  - health-checks
  - source-coverage
  - interesting-question-engine
sources:
  - source-example-health-check-output
  - source-health-check-notes
---
# Evaluation and Health Scoring

The vault needs health checks because generated knowledge can become stale, duplicated, weakly cited, or disconnected from its raw evidence.

A useful score is not enough by itself. The system should produce specific checks with severity, status, scope, finding, and next action.

The best health checks become work queues for the next agent run: add sources, merge duplicates, refresh stale pages, investigate contradictions, or promote a useful output into the wiki.
