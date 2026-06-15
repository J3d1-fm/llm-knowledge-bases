---
id: source-finetuning-future-direction
title: Synthetic Data and Finetuning Future Direction
kind: Research direction
status: Needs research
summary: Notes on a later direction where the vault can generate training/evaluation data for a model or assistant.
---
# Synthetic Data and Finetuning Future Direction

As the vault grows, it can become a source for synthetic Q&A, classification examples, extraction examples, contradiction tests, and assistant behavior examples.

This direction should not be the first dependency. The first goal is a clean source-of-truth vault with validation and repeatable compilation. Finetuning becomes interesting after the vault has enough reliable structure and evaluation data.

Possible training examples include answer-with-citations, source triage, concept linking, health-check generation, and output filing decisions.
