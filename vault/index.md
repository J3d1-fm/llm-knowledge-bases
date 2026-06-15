---
id: main
title: LLM Knowledge Bases Research Wiki
summary: A compiled product-research vault for turning raw research sources into a maintained markdown knowledge base operated by an LLM agent.
updatedAt: 2026-06-15
integrityScore: 88
---
# LLM Knowledge Bases Research Wiki

This vault is the filesystem source of truth for the hosted demo workspace. Raw material lives in `vault/raw`, compiled concept pages live in `vault/wiki/articles`, source records live in `vault/wiki/sources`, health checks live in `vault/wiki/checks`, and reusable research outputs live in `vault/outputs`.

Firestore is a deploy target, not the authoring surface. The seed script reads this directory, validates links and required fields, then writes the structured snapshot into `vaults/main`.

The current first batch focuses on the product's own operating model: LLM-owned wiki maintenance, raw-to-compiled workflow, Obsidian as the human IDE, output artifacts, private hosted access, search strategy, and later synthetic-data directions.
