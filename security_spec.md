# Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. Every document ID and user ID matches `^[a-zA-Z0-9_\-]+$` with length `1..128`.
2. Authenticated mutations require verified email (`request.auth.token.email_verified == true`) and match `ownerUid == request.auth.uid`, membership in `staffUids`, or verified bootstrapped admin (`gurujiytube@gmail.com`).
3. `users/{userId}` holds only non-PII display name, role, and workshop ID; `email` lives strictly in `users/{userId}/private/profile`.
4. `jobCards`, `inventory`, `schedules`, `settings`, and `customFields` reject `create` or `update` payloads containing unknown fields (`hasOnly`), oversized strings, unbounded lists, forged `ownerUid`, or client-supplied `createdAt`/`updatedAt` differing from `request.time`.
5. Terminal statuses (`Completed` and `Cancelled` on `jobCards`; `Serviced` on `schedules`) lock non-admin updates, except post-completion feedback/SMS log fields (`customerFeedback`, `feedbackSmsSentAt`, `messageLogs`, `auditLogs`, `updatedAtIso`, `updatedAt`) on `Completed` tickets.
6. `publicDeliveries/{deliveryToken}` never stores customer PII (`customerName`, `customerPhone`, `customerEmail`, `gstOrTaxId`) and disables `list` queries (`allow list: if false;`) to prevent enumeration.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Shadow Field Injection on Job Card Create**: Adding `"isVerifiedAdmin": true` to `/jobCards/BOSCH-2026-0099`.
2. **Self-Assigned Admin Escalation**: Writing `/admins/{attackerUid}` as a non-admin verified user.
3. **Unverified Email Spoofing**: Writing `/jobCards/BOSCH-2026-0099` with `email_verified == false`.
4. **Cross-Tenant Ownership Spoof**: Creating `/jobCards/BOSCH-2026-0099` with `ownerUid` set to another user's UID.
5. **PII Cross-Read on Private Profile**: Reading `/users/{victimUid}/private/profile` as a different authenticated user.
6. **Public Delivery List Scraping**: Executing a `list` query against `/publicDeliveries`.
7. **Oversized Document ID Poisoning**: Creating `/jobCards/` with a 200-character ID or invalid characters (`../bad`).
8. **Type Poisoning on Status Update**: Updating `/jobCards/BOSCH-2026-0041` with `{ status: 12345 }` instead of string.
9. **Terminal State Bypass**: Non-admin updating `totalAmount` on a `Completed` job card.
10. **Immutable Owner Tampering**: Updating `ownerUid` on an existing `/inventory/item-1` record.
11. **Timestamp Forgery**: Creating a job card with `createdAt` set to a past timestamp instead of `request.time`.
12. **Unbounded Array / 1MB String Bomb**: Submitting `customerSignature` > 120,000 chars or > 50 `parts` items.
