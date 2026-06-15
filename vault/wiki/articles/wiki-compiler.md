---
id: wiki-compiler
title: LLM Wiki Compiler
type: Core Mechanic
confidence: High
summary: The agent acts less like a chatbot and more like a compiler that turns raw material into a navigable wiki: summaries, concepts, backlinks, category pages, and indexes.
tags:
  - compiler
  - markdown
  - agent-workflow
links:
  - filesystem-source-of-truth
  - source-coverage
  - health-checks
sources:
  - source-user-brief
  - source-llm-agent-patterns
---
# LLM Wiki Compiler

The compiler pass should be incremental. New sources are summarized, linked to existing concepts, and queued for deeper article creation only when they add new information.

Compilation should leave traces. Each generated page needs source coverage, revision notes, confidence markers, backlinks, and open questions.

A good compiler does not flatten all nuance into a single summary. It preserves disagreement, marks missing evidence, and creates candidate pages when a concept begins appearing across sources.
