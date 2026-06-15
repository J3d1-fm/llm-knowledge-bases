---
id: source-example-health-check-output
title: Example Health Check Output
kind: Example
status: Indexed
summary: A structured example of integrity checks that turn wiki maintenance into an actionable queue.
---
# Example Health Check Output

Health checks should produce an actionable queue, not generic criticism. Each check needs severity, status, scope, finding, and next action.

Useful check categories include missing source coverage, orphan pages, stale summaries, contradictory claims, unreviewed raw files, broken links, duplicate concepts, and output artifacts that should be filed into the wiki.

The check result should be written back into the vault so it can guide the next agent run.
