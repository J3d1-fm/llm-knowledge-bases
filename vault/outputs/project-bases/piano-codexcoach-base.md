---
id: piano-codexcoach-project-base
title: PianoCodexCoach Project Base
type: ProjectBase
status: Ready
path: vault/outputs/project-bases/piano-codexcoach-base.md
summary: Routing base for PianoCodexCoach shared, iOS, Android, release, QA, score, transcription, and App Store handover documents.
updatedAt: 2026-07-02
tags:
  - project-bases
  - piano
  - ios
  - android
  - testflight
  - app-store
---
# PianoCodexCoach Project Base

## Current State

The handover sweep found the shared, iOS, and Android PianoCodexCoach worktrees clean and pushed. The project package contains final release docs, QA notes, UX specs, algorithm specs, App Store package material, third-party notices, and interface PDFs.

## GitHub Refs From The Sweep

- Shared/materials archive: `learn-piano-play-songs`, branch `codex/piano-project-materials-archive-20260702`, commit `7b42367`.
- iOS local-state archive: `learn-piano-play-songs-ios-liquid-glass`, branch `codex/ios-build100-local-state-20260702`, commit `c23d331`.
- Android port: `learn-piano-play-songs-android`, branch `codex/android-port`, commit `5a025cd`.

## Source Documents In Handover ZIP

- `piano/shared_repo/README.md`
- `piano/shared_repo/CHANGELOG.md`
- `piano/shared_repo/TECHNICAL_DOCUMENTATION.txt`
- `piano/shared_repo/Docs/PIANO_TECHNIQUE_RESEARCH_2026-06-28.txt`
- `piano/shared_repo/Docs/basic_pitch_phase1_spec.md`
- `piano/shared_repo/Docs/transcription_metric_spec.md`
- `piano/shared_repo/Docs/pass3_quality_gate_spec.md`
- `piano/shared_repo/output/pdf/Piano_Codex_Current_Interface_Screenshots_2026-06-24.pdf`
- `piano/ios_worktree/Docs/TESTFLIGHT.md`
- `piano/ios_worktree/Docs/TESTFLIGHT_HANDOFF.md`
- `piano/ios_worktree/Docs/AppStore/SUBMISSION_PACKAGE.txt`
- `piano/ios_worktree/Docs/AppStore/APP_PRIVACY_IDFA_EVIDENCE.txt`
- `piano/ios_worktree/Docs/AppStore/REVENUECAT_PRODUCT_MAPPING.txt`
- `piano/ios_worktree/Docs/LEGAL_CONSENT_GATE_HANDOFF.txt`
- `piano/android_worktree/Android/PLAY_RELEASE_SETUP.txt`
- `piano/android_worktree/Android/VERSION.txt`
- `piano/android_worktree/Docs/ANDROID_PORT_PLAN.txt`

## Next Entry Points

- Use iOS docs for TestFlight/App Store status, but verify App Store Connect live state before saying a build is tester-visible.
- Use Android docs for internal testing setup and Play release steps, but verify current Google Play state before shipping.
- Keep shared specs, transcription specs, and UI PDFs together when preparing future release handoffs.

## Safety Notes

- Release tags checked during the sweep included `v1.0.98` and `android-v0.1.0-alpha15`.
- No force update was performed for the older `song-analysis-v2-phase0` tag mismatch.
- No third-party MMP assumption should be added unless explicitly requested.
