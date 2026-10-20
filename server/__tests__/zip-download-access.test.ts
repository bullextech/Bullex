// Tests for the deal-file ZIP per-document authorization boundary
// (POST /api/documents/download-zip). The route delegates every per-document
// decision to the pure exported helper canIncludeDocInZip, and the
// all-unauthorized response contract to zipAllUnauthorizedResponse — so these
// tests pin the security scoping without HTTP/session plumbing.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { canIncludeDocInZip, canDownloadSingleFileDoc, canSendDocViaEmail, canAttachDocToEmail, SPA_EMAIL_ATTACHABLE_TYPES, zipAllUnauthorizedResponse } from "../routes";

type Doc = {
  docType: string;
  agentCode?: string | null;
  submittedByTeamMemberId?: string | null;
  sentToClientId?: string | null;
};

const TM_A = "tm-aaa";
const TM_B = "tm-bbb";
const CLIENT_X = "kyc-xxx";
const CLIENT_Y = "kyc-yyy";

const docOwnedByA: Doc = { docType: "LOI", submittedByTeamMemberId: TM_A, sentToClientId: null };
const docOwnedByB: Doc = { docType: "FCO", submittedByTeamMemberId: TM_B, sentToClientId: null };
const adminDoc: Doc = { docType: "SPA", submittedByTeamMemberId: null, sentToClientId: null };
const docForClientX: Doc = { docType: "NCNDA", submittedByTeamMemberId: null, sentToClientId: CLIENT_X };
const agentAgreementForA: Doc = { docType: "ICA", agentCode: "PID-A", submittedByTeamMemberId: null, sentToClientId: null };

const asAdmin = { role: "admin", teamMemberId: null, teamParticipantId: null, clientKycId: null };
const asTeamA = { role: "team", teamMemberId: TM_A, teamParticipantId: "PID-A", clientKycId: null };
const asClientX = { role: "client", teamMemberId: null, teamParticipantId: null, clientKycId: CLIENT_X };

describe("canIncludeDocInZip — admin", () => {
  test("admin gets every requested document", () => {
    for (const doc of [docOwnedByA, docOwnedByB, adminDoc, docForClientX, agentAgreementForA]) {
      assert.equal(canIncludeDocInZip({ ...asAdmin, doc }), true);
    }
  });
});

describe("canIncludeDocInZip — team member", () => {
  test("team member gets their own documents", () => {
    assert.equal(canIncludeDocInZip({ ...asTeamA, doc: docOwnedByA }), true);
  });

  test("team member does NOT get another member's document in a shared block", () => {
    assert.equal(canIncludeDocInZip({ ...asTeamA, doc: docOwnedByB }), false);
  });

  test("team member does NOT get admin-created documents", () => {
    assert.equal(canIncludeDocInZip({ ...asTeamA, doc: adminDoc }), false);
  });

  test("team member does NOT get documents sent to a client", () => {
    assert.equal(canIncludeDocInZip({ ...asTeamA, doc: docForClientX }), false);
  });

  test("team member DOES get their own NCNDA/ICA agent agreement (agentCode match)", () => {
    assert.equal(canIncludeDocInZip({ ...asTeamA, doc: agentAgreementForA }), true);
  });

  test("agent-agreement carve-out requires matching participant id", () => {
    assert.equal(
      canIncludeDocInZip({ ...asTeamA, teamParticipantId: "PID-OTHER", doc: agentAgreementForA }),
      false,
    );
    assert.equal(
      canIncludeDocInZip({ ...asTeamA, teamParticipantId: null, doc: agentAgreementForA }),
      false,
    );
  });

  test("agent-agreement carve-out never widens beyond NCNDA/ICA", () => {
    const spaWithAgentCode: Doc = { docType: "SPA", agentCode: "PID-A", submittedByTeamMemberId: null };
    assert.equal(canIncludeDocInZip({ ...asTeamA, doc: spaWithAgentCode }), false);
  });

  test("unresolved team-member id denies everything, even null-owner docs", () => {
    // Guards the null === null trap: a doc with no owner must not match a
    // caller whose team-member id failed to resolve.
    const orphanDoc: Doc = { docType: "LOI", submittedByTeamMemberId: null };
    assert.equal(canIncludeDocInZip({ ...asTeamA, teamMemberId: null, doc: orphanDoc }), false);
    assert.equal(canIncludeDocInZip({ ...asTeamA, teamMemberId: null, doc: docOwnedByA }), false);
  });
});

describe("canIncludeDocInZip — client", () => {
  test("client gets only documents sent to their KYC record", () => {
    assert.equal(canIncludeDocInZip({ ...asClientX, doc: docForClientX }), true);
  });

  test("client does NOT get documents sent to another client", () => {
    const docForClientY: Doc = { ...docForClientX, sentToClientId: CLIENT_Y };
    assert.equal(canIncludeDocInZip({ ...asClientX, doc: docForClientY }), false);
  });

  test("client does NOT get team/admin documents not sent to anyone", () => {
    assert.equal(canIncludeDocInZip({ ...asClientX, doc: docOwnedByA }), false);
    assert.equal(canIncludeDocInZip({ ...asClientX, doc: adminDoc }), false);
  });

  test("null/undefined clientKycId never matches a null sentToClientId", () => {
    // Guards the null === null trap on the client side.
    const unsentDoc: Doc = { docType: "LOI", sentToClientId: null };
    assert.equal(canIncludeDocInZip({ ...asClientX, clientKycId: null, doc: unsentDoc }), false);
    assert.equal(canIncludeDocInZip({ ...asClientX, clientKycId: undefined, doc: unsentDoc }), false);
  });
});

describe("canIncludeDocInZip — other principals", () => {
  test("unknown or missing role is always denied", () => {
    for (const role of [undefined, "guest", "investor"]) {
      assert.equal(
        canIncludeDocInZip({ role, teamMemberId: null, teamParticipantId: null, clientKycId: null, doc: docOwnedByA }),
        false,
      );
    }
  });
});

describe("canDownloadSingleFileDoc — single-file routes use the SAME gate as the ZIP", () => {
  test("the single-file gate IS the ZIP gate (same function identity — cannot drift)", () => {
    assert.equal(canDownloadSingleFileDoc, canIncludeDocInZip);
  });

  test("admin/team/client scoping is identical across every principal × document combination", () => {
    const docs = [docOwnedByA, docOwnedByB, adminDoc, docForClientX, agentAgreementForA];
    const principals = [
      asAdmin,
      asTeamA,
      { ...asTeamA, teamParticipantId: "PID-OTHER" },
      { ...asTeamA, teamMemberId: null },
      asClientX,
      { ...asClientX, clientKycId: CLIENT_Y },
      { role: undefined, teamMemberId: null, teamParticipantId: null, clientKycId: null },
      { role: "guest", teamMemberId: null, teamParticipantId: null, clientKycId: null },
    ];
    for (const principal of principals) {
      for (const doc of docs) {
        assert.equal(
          canDownloadSingleFileDoc({ ...principal, doc }),
          canIncludeDocInZip({ ...principal, doc }),
          `drift for role=${principal.role} doc=${doc.docType}`,
        );
      }
    }
  });
});

describe("canSendDocViaEmail — the email/send route uses the SAME gate as downloads", () => {
  test("the send gate IS the download/ZIP gate (same function identity — cannot drift)", () => {
    assert.equal(canSendDocViaEmail, canDownloadSingleFileDoc);
    assert.equal(canSendDocViaEmail, canIncludeDocInZip);
  });

  test("admin may send any document", () => {
    for (const doc of [docOwnedByA, docOwnedByB, adminDoc, docForClientX, agentAgreementForA]) {
      assert.equal(canSendDocViaEmail({ ...asAdmin, doc }), true);
    }
  });

  test("team member may send only their own documents (plus own agent agreement)", () => {
    assert.equal(canSendDocViaEmail({ ...asTeamA, doc: docOwnedByA }), true);
    assert.equal(canSendDocViaEmail({ ...asTeamA, doc: agentAgreementForA }), true);
    assert.equal(canSendDocViaEmail({ ...asTeamA, doc: docOwnedByB }), false);
    assert.equal(canSendDocViaEmail({ ...asTeamA, doc: adminDoc }), false);
    assert.equal(canSendDocViaEmail({ ...asTeamA, doc: docForClientX }), false);
  });

  test("unresolved team-member id denies sending everything, even null-owner docs", () => {
    const orphanDoc: Doc = { docType: "LOI", submittedByTeamMemberId: null };
    assert.equal(canSendDocViaEmail({ ...asTeamA, teamMemberId: null, doc: orphanDoc }), false);
  });

  test("client may send only documents sent to their KYC record, never another client's", () => {
    assert.equal(canSendDocViaEmail({ ...asClientX, doc: docForClientX }), true);
    assert.equal(canSendDocViaEmail({ ...asClientX, doc: { ...docForClientX, sentToClientId: CLIENT_Y } }), false);
    assert.equal(canSendDocViaEmail({ ...asClientX, doc: docOwnedByA }), false);
  });

  test("unknown or missing role can never send", () => {
    for (const role of [undefined, "guest", "investor"]) {
      assert.equal(
        canSendDocViaEmail({ role, teamMemberId: null, teamParticipantId: null, clientKycId: null, doc: docOwnedByA }),
        false,
      );
    }
  });
});

describe("canAttachDocToEmail — extra bank-draft attachments on the email/send routes", () => {
  const PARENT_ID = "doc-parent-spa";
  const parentDoc = { id: PARENT_ID };
  type Child = Parameters<typeof canAttachDocToEmail>[0]["child"];
  const draftOwnedByA: Child = {
    id: "doc-dlc-a", parentDocId: PARENT_ID, docType: "DLC_MT700",
    submittedByTeamMemberId: TM_A, sentToClientId: null,
  };
  const adminDraftUnderParent: Child = {
    id: "doc-pbg-admin", parentDocId: PARENT_ID, docType: "PBG_MT760",
    submittedByTeamMemberId: null, sentToClientId: null,
  };
  const draftOwnedByBUnderParent: Child = {
    id: "doc-dlc-b", parentDocId: PARENT_ID, docType: "DLC_MT700",
    submittedByTeamMemberId: TM_B, sentToClientId: null,
  };

  test("only bank-draft types are attachable", () => {
    assert.deepEqual([...SPA_EMAIL_ATTACHABLE_TYPES].sort(), ["DLC_MT700", "PBG_MT760"]);
    const spaChild: Child = { ...draftOwnedByA, docType: "SPA" };
    assert.equal(canAttachDocToEmail({ ...asAdmin, parentDoc, child: spaChild }), false);
  });

  test("child must be a direct child of the parent being emailed", () => {
    const otherParentChild: Child = { ...draftOwnedByA, parentDocId: "doc-other-parent" };
    assert.equal(canAttachDocToEmail({ ...asAdmin, parentDoc, child: otherParentChild }), false);
    const orphanChild: Child = { ...draftOwnedByA, parentDocId: null };
    assert.equal(canAttachDocToEmail({ ...asAdmin, parentDoc, child: orphanChild }), false);
  });

  test("admin may attach any derived bank draft", () => {
    for (const child of [draftOwnedByA, adminDraftUnderParent, draftOwnedByBUnderParent]) {
      assert.equal(canAttachDocToEmail({ ...asAdmin, parentDoc, child }), true);
    }
  });

  test("team member may attach their own derived drafts", () => {
    assert.equal(canAttachDocToEmail({ ...asTeamA, parentDoc, child: draftOwnedByA }), true);
  });

  test("team member may NOT attach a draft outside their scope, even under their own parent", () => {
    // The invariant this task pins: derivation from an owned parent is NOT
    // enough — the sender must independently pass the download/email gate for
    // the child. An admin-created draft under a team member's SPA stays out.
    assert.equal(canAttachDocToEmail({ ...asTeamA, parentDoc, child: adminDraftUnderParent }), false);
    assert.equal(canAttachDocToEmail({ ...asTeamA, parentDoc, child: draftOwnedByBUnderParent }), false);
  });

  test("unresolved team-member id denies attaching everything, even null-owner drafts", () => {
    assert.equal(
      canAttachDocToEmail({ ...asTeamA, teamMemberId: null, parentDoc, child: adminDraftUnderParent }),
      false,
    );
    assert.equal(
      canAttachDocToEmail({ ...asTeamA, teamMemberId: null, parentDoc, child: draftOwnedByA }),
      false,
    );
  });

  test("attachment ownership decision matches canSendDocViaEmail exactly for eligible drafts", () => {
    // For any derived bank draft, per-attachment access must equal the pure
    // send/download gate on the child — attachments can never be more
    // permissive than downloading the child itself.
    const principals = [asAdmin, asTeamA, { ...asTeamA, teamMemberId: null }, asClientX,
      { role: undefined, teamMemberId: null, teamParticipantId: null, clientKycId: null }];
    for (const principal of principals) {
      for (const child of [draftOwnedByA, adminDraftUnderParent, draftOwnedByBUnderParent]) {
        assert.equal(
          canAttachDocToEmail({ ...principal, parentDoc, child }),
          canSendDocViaEmail({ ...principal, doc: child }),
          `drift for role=${principal.role} child=${child.id}`,
        );
      }
    }
  });

  test("unknown or missing role can never attach", () => {
    for (const role of [undefined, "guest", "investor"]) {
      assert.equal(
        canAttachDocToEmail({ role, teamMemberId: null, teamParticipantId: null, clientKycId: null, parentDoc, child: draftOwnedByA }),
        false,
      );
    }
  });
});

describe("zipAllUnauthorizedResponse — all-unauthorized request contract", () => {
  test("client denied on every document gets 403", () => {
    const denial = zipAllUnauthorizedResponse("client");
    assert.equal(denial.status, 403);
    assert.equal(denial.message, "Access denied");
  });

  test("team/admin denied on every document gets 404", () => {
    for (const role of ["team", "admin", undefined]) {
      const denial = zipAllUnauthorizedResponse(role);
      assert.equal(denial.status, 404);
      assert.equal(denial.message, "No downloadable documents found");
    }
  });
});
