// Document editing access-control policy tests (pure, no database needed).
//
// Policy (canEditDocument):
// - Admin may edit a document in ANY state (incl. approved/sent/accepted/final).
// - Team members may NO LONGER edit a generated document directly. Any change a
//   team member wants to make must be submitted as an amendment
//   (POST /api/documents/:id/request-amendment) and approved by an admin
//   (POST /api/documents/:id/review-amendment) before it replaces the live
//   content. So canEditDocument returns false for team in every state.
// - No other principal (client/anonymous) may edit.
// Run with:  npx tsx --test server/__tests__/document-access.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { canEditDocument, canDownloadDocument, canSendDocumentToMember, canGenerateAgentDocForMember } from "../routes";

const STATUSES = ["pending_review", "rejected", "draft", "review", "sent", "accepted", "final"];

test("admin may edit a document in any status", () => {
  for (const status of STATUSES) {
    assert.equal(
      canEditDocument({ role: "admin", isOwner: false, status }),
      true,
      `admin should be able to edit status='${status}'`,
    );
  }
  // Admin may even edit a post-approval client-amendment doc.
  assert.equal(
    canEditDocument({ role: "admin", isOwner: false, status: "rejected", recipientResponse: "rejected" }),
    true,
  );
});

test("team member may NOT edit any document directly — amendments require admin approval", () => {
  for (const isOwner of [true, false]) {
    for (const status of STATUSES) {
      assert.equal(
        canEditDocument({ role: "team", isOwner, status }),
        false,
        `team should NOT directly edit status='${status}' (isOwner=${isOwner})`,
      );
    }
  }
  // Even a pre-approval rejection (no recipientResponse) is not directly editable.
  assert.equal(canEditDocument({ role: "team", isOwner: true, status: "rejected", recipientResponse: null }), false);
});

test("non-admin / non-team principals may not edit", () => {
  for (const role of ["client", undefined]) {
    for (const status of STATUSES) {
      assert.equal(
        canEditDocument({ role: role as any, isOwner: true, status }),
        false,
        `role='${role}' should not be able to edit status='${status}'`,
      );
    }
  }
});

// --- Download / read access policy (canDownloadDocument) ---

test("admin may download any document (owner/recipient irrelevant)", () => {
  for (const isOwner of [true, false]) {
    for (const isRecipientClient of [true, false]) {
      assert.equal(canDownloadDocument({ role: "admin", isOwner, isRecipientClient }), true);
    }
  }
});

test("team member may download ONLY a document they created", () => {
  assert.equal(canDownloadDocument({ role: "team", isOwner: true, isRecipientClient: false }), true);
  // Having the module but not owning the doc must NOT grant download (IDOR guard).
  assert.equal(canDownloadDocument({ role: "team", isOwner: false, isRecipientClient: false }), false);
  // Being the client-recipient does not help a team principal reach a non-owned doc.
  assert.equal(canDownloadDocument({ role: "team", isOwner: false, isRecipientClient: true }), false);
});

test("client may download ONLY a document sent to them", () => {
  assert.equal(canDownloadDocument({ role: "client", isOwner: false, isRecipientClient: true }), true);
  assert.equal(canDownloadDocument({ role: "client", isOwner: false, isRecipientClient: false }), false);
  // A client is never treated as an owning team member.
  assert.equal(canDownloadDocument({ role: "client", isOwner: true, isRecipientClient: false }), false);
});

test("anonymous / unknown principals may not download", () => {
  for (const role of [undefined, "guest"]) {
    assert.equal(
      canDownloadDocument({ role: role as any, isOwner: true, isRecipientClient: true }),
      false,
      `role='${role}' should not be able to download`,
    );
  }
});

// --- Direct send-to-member policy (canSendDocumentToMember) ---
//
// Policy: a team member may email a generated document to a team member they
// personally added ONLY when they own the document AND the target's
// invitedByTeamMemberId matches the caller. Admin may send anything to anyone.

test("admin may send any document to any member", () => {
  assert.equal(canSendDocumentToMember({
    role: "admin", callerTeamMemberId: null,
    docOwnerTeamMemberId: "tm-x", targetInvitedByTeamMemberId: "tm-y",
  }), true);
});

test("team member may send own doc to a member they added", () => {
  assert.equal(canSendDocumentToMember({
    role: "team", callerTeamMemberId: "tm-1",
    docOwnerTeamMemberId: "tm-1", targetInvitedByTeamMemberId: "tm-1",
  }), true);
});

test("team member may NOT send a doc they do not own", () => {
  assert.equal(canSendDocumentToMember({
    role: "team", callerTeamMemberId: "tm-1",
    docOwnerTeamMemberId: "tm-2", targetInvitedByTeamMemberId: "tm-1",
  }), false);
});

test("team member may NOT send to a member they did not add", () => {
  assert.equal(canSendDocumentToMember({
    role: "team", callerTeamMemberId: "tm-1",
    docOwnerTeamMemberId: "tm-1", targetInvitedByTeamMemberId: "tm-2",
  }), false);
  // Target not invited by anyone.
  assert.equal(canSendDocumentToMember({
    role: "team", callerTeamMemberId: "tm-1",
    docOwnerTeamMemberId: "tm-1", targetInvitedByTeamMemberId: null,
  }), false);
});

test("non-team / anonymous principals may not send to member", () => {
  for (const role of [undefined, "client", "guest"]) {
    assert.equal(canSendDocumentToMember({
      role: role as any, callerTeamMemberId: "tm-1",
      docOwnerTeamMemberId: "tm-1", targetInvitedByTeamMemberId: "tm-1",
    }), false, `role='${role}' should not be able to send`);
  }
});

test("team member with no session team-member id may not send", () => {
  assert.equal(canSendDocumentToMember({
    role: "team", callerTeamMemberId: null,
    docOwnerTeamMemberId: null, targetInvitedByTeamMemberId: null,
  }), false);
});

// A recipient may be a login-pending team-KYC applicant (no team_members row),
// resolved by the route from team_kyc_applications. The gate is identical: it
// only reads the target's invitedByTeamMemberId, so an invited applicant the
// caller owns a doc for is send-eligible, while an applicant invited by someone
// else is not — regardless of whether the recipient has a login yet.
test("team member may send own doc to a login-pending applicant they invited", () => {
  assert.equal(canSendDocumentToMember({
    role: "team", callerTeamMemberId: "tm-1",
    docOwnerTeamMemberId: "tm-1", targetInvitedByTeamMemberId: "tm-1",
  }), true);
});

test("team member may NOT send to a login-pending applicant invited by someone else", () => {
  assert.equal(canSendDocumentToMember({
    role: "team", callerTeamMemberId: "tm-1",
    docOwnerTeamMemberId: "tm-1", targetInvitedByTeamMemberId: "tm-2",
  }), false);
});

// --- Agent-agreement generation policy (canGenerateAgentDocForMember) ---
//
// Policy: a team member may generate an NCNDA/ICA against a registered team
// member ONLY for a member they personally added (target.invitedByTeamMemberId
// equals the caller). Admin may generate for any member.

test("admin may generate an agent agreement for any member", () => {
  assert.equal(canGenerateAgentDocForMember({
    role: "admin", callerTeamMemberId: null, targetInvitedByTeamMemberId: "tm-y",
  }), true);
  // Even a member no one invited.
  assert.equal(canGenerateAgentDocForMember({
    role: "admin", callerTeamMemberId: null, targetInvitedByTeamMemberId: null,
  }), true);
});

test("team member may generate for a member they added", () => {
  assert.equal(canGenerateAgentDocForMember({
    role: "team", callerTeamMemberId: "tm-1", targetInvitedByTeamMemberId: "tm-1",
  }), true);
});

test("team member may NOT generate for a member they did not add", () => {
  assert.equal(canGenerateAgentDocForMember({
    role: "team", callerTeamMemberId: "tm-1", targetInvitedByTeamMemberId: "tm-2",
  }), false);
  // Target invited by no one.
  assert.equal(canGenerateAgentDocForMember({
    role: "team", callerTeamMemberId: "tm-1", targetInvitedByTeamMemberId: null,
  }), false);
});

test("team member with no session team-member id may not generate", () => {
  assert.equal(canGenerateAgentDocForMember({
    role: "team", callerTeamMemberId: null, targetInvitedByTeamMemberId: "tm-1",
  }), false);
});

test("non-team / anonymous principals may not generate an agent agreement", () => {
  for (const role of [undefined, "client", "guest"]) {
    assert.equal(canGenerateAgentDocForMember({
      role: role as any, callerTeamMemberId: "tm-1", targetInvitedByTeamMemberId: "tm-1",
    }), false, `role='${role}' should not be able to generate`);
  }
});

// ---------------------------------------------------------------------------
// isOwnAgentAgreement: a team member is the SUBJECT of an NCNDA/ICA agent
// agreement when the document's agentCode equals their participant ID. The
// subject may view/download and propose admin-gated amendments.
// ---------------------------------------------------------------------------
import { isOwnAgentAgreement } from "../routes";

test("subject team member matches their own NCNDA/ICA by agentCode", () => {
  assert.equal(isOwnAgentAgreement({ docType: "NCNDA", agentCode: "BFG-A-001" }, "BFG-A-001"), true);
  assert.equal(isOwnAgentAgreement({ docType: "ICA", agentCode: "BFG-A-001" }, "BFG-A-001"), true);
});

test("non-agreement doc types are never subject-owned", () => {
  for (const docType of ["LOI", "FCO", "SCO", "SPA", "TFR", "DEAL_RECAP"]) {
    assert.equal(isOwnAgentAgreement({ docType, agentCode: "BFG-A-001" }, "BFG-A-001"), false, docType);
  }
});

test("mismatched, missing, or empty agent codes never match", () => {
  assert.equal(isOwnAgentAgreement({ docType: "NCNDA", agentCode: "BFG-A-002" }, "BFG-A-001"), false);
  assert.equal(isOwnAgentAgreement({ docType: "NCNDA", agentCode: null }, "BFG-A-001"), false);
  assert.equal(isOwnAgentAgreement({ docType: "NCNDA" }, "BFG-A-001"), false);
  assert.equal(isOwnAgentAgreement({ docType: "NCNDA", agentCode: "BFG-A-001" }, null), false);
  assert.equal(isOwnAgentAgreement({ docType: "NCNDA", agentCode: "" }, ""), false);
});
