---
id: synthetic-data-and-finetuning
title: Synthetic Data and Finetuning
type: Research Direction
confidence: Low
summary: A mature vault can generate training, evaluation, and behavior examples, but only after the source-of-truth and validation loops are reliable.
tags:
  - finetuning
  - synthetic-data
  - evaluation
links:
  - evaluation-and-health-scoring
  - source-coverage
  - interesting-question-engine
sources:
  - source-finetuning-future-direction
  - source-user-brief
---
# Synthetic Data and Finetuning

Synthetic data and finetuning are later-stage opportunities. The vault can eventually generate examples for answering with citations, linking concepts, triaging sources, creating health checks, and filing outputs.

The risk is training on messy or unsupported knowledge. Before finetuning matters, the vault needs stable source coverage, validation checks, and a way to distinguish confirmed knowledge from hypotheses.

The first useful step is evaluation data, not model training. Health checks and Q&A examples can reveal whether the current agent actually understands and maintains the vault.
