// Client-portal link gate tests for POST /api/documents/:id/send (pure, no DB).
//
// Policy (validateClientLink):
// - Only admin/team roles may link a document to a client portal account.
// - The client KYC must be approved.
// - One of the client's registered emails (contact/signatory) must match the
//   document's own buyer/seller party emails.
// - Team callers must additionally send the notification email to one of the
//   client's registered addresses (no portal-planting with a silent notify).
// Run with:  npx tsx --test server/__tests__/client-link.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateClientLink } from "../routes";

const base = {
  role: "team" as string | undefined,
  clientStatus: "approved",
  clientEmails: ["client@acme.com", "signer@acme.com"],
  docPartyEmails: ["client@acme.com", "seller@bullex.tech"],
  recipientEmail: "client@acme.com",
};

test("team member may link an approved client whose email is a document party", () => {
  assert.deepEqual(validateClientLink({ ...base }), { ok: true });
});

test("admin may link without the recipient-email binding", () => {
  const r = validateClientLink({ ...base, role: "admin", recipientEmail: "other@elsewhere.com" });
  assert.equal(r.ok, true);
});

test("client / anonymous roles may not link", () => {
  for (const role of ["client", undefined, "other"]) {
    const r = validateClientLink({ ...base, role });
    assert.equal(r.ok, false);
  }
});

test("non-approved client KYC is rejected for every role", () => {
  for (const role of ["admin", "team"]) {
    for (const clientStatus of ["pending", "rejected", null, undefined]) {
      const r = validateClientLink({ ...base, role, clientStatus });
      assert.equal(r.ok, false);
    }
  }
});

test("client whose emails are not a document party is rejected (wrong-client routing)", () => {
  const r = validateClientLink({
    ...base,
    clientEmails: ["victim@other-co.com"],
    recipientEmail: "victim@other-co.com",
  });
  assert.equal(r.ok, false);
  const r2 = validateClientLink({ ...base, role: "admin", clientEmails: ["victim@other-co.com"] });
  assert.equal(r2.ok, false);
});

test("email matching is case-insensitive and whitespace-tolerant", () => {
  const r = validateClientLink({
    ...base,
    clientEmails: ["  Client@ACME.com "],
    docPartyEmails: ["client@acme.com"],
    recipientEmail: "CLIENT@acme.COM",
  });
  assert.equal(r.ok, true);
});

test("team member may NOT notify a non-client address while linking the portal", () => {
  const r = validateClientLink({ ...base, recipientEmail: "attacker@evil.com" });
  assert.equal(r.ok, false);
  const r2 = validateClientLink({ ...base, recipientEmail: null });
  assert.equal(r2.ok, false);
});

test("team signatory email is an acceptable notification target", () => {
  const r = validateClientLink({ ...base, recipientEmail: "signer@acme.com" });
  assert.equal(r.ok, true);
});

test("empty client emails never match (no vacuous pass)", () => {
  const r = validateClientLink({
    ...base,
    clientEmails: [null, undefined, ""],
    docPartyEmails: [null, ""],
    recipientEmail: "",
  });
  assert.equal(r.ok, false);
});
