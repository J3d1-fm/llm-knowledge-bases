---
id: check-firestore-auth-boundary
title: Firestore auth boundary
severity: High
status: Passing
scope: Security rules
finding: Workspace data is stored in Firestore and rules allow reads only for the configured owner email.
nextAction: Keep private source imports out of the public repository and write them through a trusted admin path.
---
# Firestore auth boundary

The hosted workspace reads from Firestore only after Firebase Authentication establishes an allowed, verified Google account.
