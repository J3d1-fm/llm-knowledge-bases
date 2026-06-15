---
id: check-google-auth-provider
title: Google Auth provider
severity: High
status: Needs verification
scope: Authentication
finding: The frontend uses Firebase Google sign-in. Provider enablement must be verified in the Firebase project before user testing.
nextAction: Sign in on the hosted URL with j3d1fm@gmail.com and confirm Firestore reads succeed.
---
# Google Auth provider

Hosting, Firestore, and rules are deployed, but Firebase Authentication provider setup still needs live verification through the Firebase Console.
