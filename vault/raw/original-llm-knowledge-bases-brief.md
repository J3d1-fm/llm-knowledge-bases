---
id: source-user-brief
title: Original LLM Knowledge Bases Brief
kind: User essay
status: Indexed
summary: Describes the raw-to-wiki workflow, Obsidian frontend, Q&A loop, output filing, health checks, and future finetuning direction.
---
# Original LLM Knowledge Bases Brief

The source idea is to use LLMs to build personal knowledge bases for research topics. Raw documents such as articles, papers, repositories, datasets, and images are indexed into a `raw/` directory. An LLM incrementally compiles those materials into a wiki made of markdown files, summaries, backlinks, category pages, concept pages, and indexes.

Obsidian acts as the IDE frontend. The user views raw material, compiled wiki pages, and generated visualizations there, while the LLM owns most writing and maintenance. The user rarely edits the wiki directly.

At small scale, a good LLM agent can answer complex questions over a 100 article, 400K word vault by reading maintained summaries, indexes, backlinks, and related pages. This can reduce the need for heavier RAG systems until the corpus grows.

Outputs should usually be files, not just chat answers. Markdown reports, Marp slide decks, matplotlib images, and other artifacts can be viewed again in Obsidian and filed back into the knowledge base. This makes user explorations accumulate instead of disappearing into a chat history.

LLM health checks can improve data integrity by finding inconsistent data, imputing missing data through web research, suggesting new article candidates, and identifying interesting connections.

Additional deterministic tools can support the agent: search over the vault, backlink inspection, chart rendering, health checks, and CLI workflows that the LLM can call during larger investigations.

A future direction is synthetic data generation and finetuning, so the model can internalize some knowledge from the vault instead of relying only on context windows.
