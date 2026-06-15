---
id: check-raw-source-registration
title: Raw source registration
severity: Medium
status: Passing
scope: Ingestion
finding: The first batch raw notes have matching source records so compiled articles can link back to their source basis.
nextAction: Add an automated validator that requires every raw file to have a corresponding source record before seeding Firestore.
---
# Raw source registration

Every raw source should become visible through a source record. Otherwise, material can exist in the filesystem without appearing in coverage views.
