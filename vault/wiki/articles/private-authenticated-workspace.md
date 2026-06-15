---
id: private-authenticated-workspace
title: Private Authenticated Workspace
type: Implementation
confidence: Medium
summary: The hosted demo reads a Firestore snapshot generated from the vault and gates it behind Google sign-in plus owner-only Firestore rules.
tags:
  - firebase
  - auth
  - firestore
links:
  - filesystem-source-of-truth
  - source-coverage
  - market-map
sources:
  - source-firebase-auth-workspace
  - source-user-brief
---
# Private Authenticated Workspace

The current hosted workspace separates authoring from reading. The source-of-truth remains the local markdown vault, while Firestore stores a structured snapshot for the browser interface.

The intended access model is Google sign-in through Firebase Authentication, with Firestore rules enforcing the owner-only read boundary. Client writes are disabled.

This is enough for the first private demo, but real private imports need stronger operational rules: avoid committing sensitive raw sources to a public repository, define where large files live, and document who can seed or deploy the database.
