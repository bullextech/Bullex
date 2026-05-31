---
name: Enquiry board inclusivity vs strict matchable allowlist
description: Why /api/enquiry-board filters with the terminal-status denylist, not the strict matchable allowlist
---

The Deal Pipeline board endpoint (`GET /api/enquiry-board`) lists enquiries using a
**denylist** (exclude `closed`/`rejected`/`cancelled`) — NOT the shared
`isEnquiryStatusMatchable` allowlist (`active`/`open`/`under_review`/`quoted`).

**Why:** real production/dev enquiries are frequently in status `accepted` (legacy of
the old accept→trade flow). The strict allowlist excludes `accepted`, so applying it
to the board empties it for those enquiries and re-creates the reported bug
"enquiries not reflected in deal pipeline." A code review may flag the denylist as
"drift" and suggest aligning to the allowlist — do not, unless enquiry status
semantics change so that `accepted` no longer represents a live, board-worthy enquiry.

**How to apply:** keep the board listing inclusive. The strict matchable allowlist
belongs only on the *suggested match pairs* (`computeEnquiryMatches`), where being
conservative is correct, not on what the board displays.
