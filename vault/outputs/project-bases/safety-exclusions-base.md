---
id: handover-safety-exclusions-project-base
title: Handover Safety Exclusions Base
type: ProjectBase
status: Ready
path: vault/outputs/project-bases/safety-exclusions-base.md
summary: Safety index for what was intentionally skipped from GitHub pushes, Drive upload, and Obsidian project-base records during the handover sweep.
updatedAt: 2026-07-02
tags:
  - project-bases
  - safety
  - exclusions
  - no-upload
  - no-push
---
# Handover Safety Exclusions Base

## Purpose

This record prevents future agents from treating skipped local material as missing work. These exclusions were intentional during the handover sweep.

## No Upload Or Push

- Sensitive Wio passcode email evidence under `codextrack/artifacts/task-182-wio-passcode-email.*`.
- Backup/archive copy named `Personal Projects Codex.backup-20260622-134052`.
- Dirty backup repo inside that backup copy, previously classified as no-push.
- Uppercase local `Digital Racers Codex` folder because it had no GitHub remote and contained local account/plugin binding files.
- Local account-binding files, plugin runtime state, env files, token-like files, private keys, and secret-named files.
- Executable installer script `fix_usb_installer_v1.0.1.command`.

## Git Tag Cautions

- `3d-viewer` and `dsn-converter` missing local tags were not pushed because those tags pointed only to upstream branches, not local working branches.
- Piano `song-analysis-v2-phase0` tag mismatch was not force-updated.
- Current Piano release tags checked during the sweep matched remote for `v1.0.98` and `android-v0.1.0-alpha15`.

## Package Safety Checks

- The final handover package excluded `.git`, `node_modules`, `.venv`, `Pods`, `target`, `build`, `.gradle`, `.expo`, `.codex`, env files, Google and Slack binding files, token or secret named files, and non-example Play release properties.
- Text scan found no private keys, GitHub keys, OpenAI keys, API keys, Slack tokens, refresh tokens, or real client secrets.
- False positives in the scan were placeholder or code words such as `task-list`, `get-task-allow`, and README examples.

## Reuse Rule

When a future task touches one of these areas, re-verify the current filesystem and account state. Do not infer that excluded material should be uploaded, committed, or mirrored into Firestore.
