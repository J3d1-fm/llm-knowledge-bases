---
id: source-current-workflow-notes
title: Current Workflow Notes
kind: Workflow
status: Indexed
summary: Captures the active operating loop: raw ingest, LLM compilation, Obsidian review, Q&A, outputs, filing, and health checks.
---
# Current Workflow Notes

The active workflow starts with raw data collection. Articles, papers, repositories, datasets, screenshots, images, and notes are saved into a raw directory so an LLM can inspect them later without depending on a browser session.

The LLM then performs incremental compilation. It updates summaries, source records, backlinks, concept pages, indexes, and open questions. The user expects the agent to maintain the wiki rather than asking the user to edit every page manually.

Obsidian is the viewing surface. The vault should remain readable as markdown and media files even if the agent or web UI changes.

Q&A should usually produce durable artifacts. Useful answers become markdown reports, slide decks, chart images, comparison tables, or graph maps that can be filed back into the same vault.

Health checks are part of the loop. The system should detect contradictions, stale claims, missing citations, orphan concepts, weak source coverage, and promising article candidates.
