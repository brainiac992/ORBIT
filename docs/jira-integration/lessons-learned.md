# Lessons Learned — Jira Cloud Integration

## Technical

**Field name contracts must be typed end-to-end**
Six frontend blockers were caused by mismatches between tRPC procedure return shapes and what the frontend assumed. The frontend agent inferred field names from descriptions instead of reading the actual router return types. Fix: frontend agents must import or read the exact tRPC router output types before building UI.

**Sync hashes must be cryptographically strong**
The initial implementation used a 32-bit djb2 hash for change detection. With hundreds of issues, birthday-problem collisions become practical — two distinct Jira states produce the same hash and the reconciliation job skips the update silently. SHA-256 is required for any sync hash that gates database writes.

**Webhook secrets need the same encryption as API credentials**
The API token was correctly encrypted at rest but the webhook HMAC secret was stored plaintext. Any read access to the database allows forging valid signed webhook payloads. Both secrets must be encrypted with the same service before storage.

**Import locks must be atomic at the database level**
Application-level read-then-write lock checks have a TOCTOU race: two concurrent requests both read `import_locked=false`, both pass the check, both proceed. Concurrent import runs cause FK violations or full data corruption. Use a single conditional UPDATE with row count check instead.

## Process

**Happy-path QA catches backend/frontend contract failures that adversarial testing misses**
QA-Breaker focused on edge cases and found 4 critical backend bugs. QA-Happy validated the expected user journey and found 6 blockers — all frontend/backend field name mismatches. Both agents are necessary; neither is sufficient alone.

**Data Agent review is essential for schema-touching initiatives**
QA agents passed the backend without catching the non-unique constraint on `(orbit_entity_type, orbit_entity_id)` in `jira_sync_mappings` — which allowed two Jira issues to target the same ORBIT entity. The Data Agent review caught this and the SHA-256 hash issue. Schedule Data Agent earlier in the pipeline for initiatives with new schema.

**Frontend and backend field name contracts should be validated with shared types**
Consider exporting tRPC router output types and importing them in the frontend. This would have caught all 6 blockers at compile time instead of at QA.
