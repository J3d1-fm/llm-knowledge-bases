---
id: check-google-auth-provider
title: Google Auth provider
severity: High
status: Blocked
scope: Authentication
finding: Firestore and Hosting are configured, but Google sign-in still depends on enabling the Firebase Authentication provider in the console.
nextAction: Enable Google provider in Firebase Console, then sign in with j3d1fm@gmail.com and confirm workspace reads succeed.
---
# Google Auth provider

Hosting, Firestore, and rules are deployed, but Firebase Authentication provider setup still needs live verification through the Firebase Console.
