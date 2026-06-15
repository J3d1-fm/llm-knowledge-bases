---
id: source-rag-vs-filesystem-notes
title: RAG vs Filesystem Wiki Notes
kind: Architecture notes
status: Indexed
summary: Compares heavy retrieval systems with a small-scale filesystem wiki maintained by an LLM agent.
---
# RAG vs Filesystem Wiki Notes

At small scale, a maintained filesystem wiki can be enough. If indexes, summaries, backlinks, and source records are current, an LLM agent can often read the relevant files directly.

RAG becomes more compelling when the corpus is too large, too dynamic, or too fragmented for direct file inspection. But RAG does not replace the need for durable synthesis, source coverage, and correction loops.

The practical architecture can start local-first: markdown files for source of truth, deterministic search tools for discovery, and Firestore only as a hosted read model.
