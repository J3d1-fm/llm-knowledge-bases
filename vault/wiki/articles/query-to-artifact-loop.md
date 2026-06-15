---
id: query-to-artifact-loop
title: Query to Artifact Loop
type: Workflow
confidence: High
summary: The strongest behavior is turning useful answers into durable markdown, slides, charts, or maps that become new wiki material.
tags:
  - outputs
  - reports
  - slides
links:
  - output-studio
  - filesystem-source-of-truth
  - agent-cli
sources:
  - source-user-brief
  - source-marp-notes
---
# Query to Artifact Loop

A query starts with a question, but the output should be a file when the answer is reusable. Markdown reports, Marp decks, comparison tables, and generated charts all become part of the vault.

The workflow creates compounding returns: every exploration becomes searchable, linkable, and available to the next agent run.

This is the product wedge against ordinary chat. The workbench should make filing an output back into the wiki feel like the normal completion state.
