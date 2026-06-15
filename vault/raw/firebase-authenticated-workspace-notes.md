---
id: source-firebase-auth-workspace
title: Firebase Authenticated Workspace Notes
kind: Implementation notes
status: Indexed
summary: Captures the current hosted workspace model: Firebase Hosting, Google Auth, Firestore read model, and owner-only rules.
---
# Firebase Authenticated Workspace Notes

The current hosted workspace uses Firebase Hosting for static files and Firestore as a read model generated from the markdown vault.

Authentication is intended to use Firebase Google sign-in. Firestore rules are the real access boundary: reads are limited to the configured owner account and client writes are disabled.

This is a demo-grade private workspace path. For real imported private material, the repository and storage policy must be reviewed so raw sources are not accidentally committed to a public repo.
