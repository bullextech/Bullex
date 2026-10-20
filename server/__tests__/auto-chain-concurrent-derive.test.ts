// Route-level idempotency for the signed-SPA auto-chain.
//
// When a SPA is signed, the sign endpoint fans out to three bank/report
// children — DLC_MT700, PBG_MT760 and TFR — via deriveNextDocument(..., true)
// (atomic mode). If buyer and seller sign near-simultaneously, both requests
// run the same fan-out, so deriveNextDocument itself must guarantee at most
// one child per (parent, docType). These tests drive two concurrent
// deriveNextDocument calls per child type against a real parent row in the
// dev DB and assert exactly one child of each type is created.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { storage } from "../storage";
import { deriveNextDocument } from "../routes";

const SPA_CHILD_TYPES = ["DLC_MT700", "PBG_MT760", "TFR"] as const;

const SPA_CONTENT = `SALES AND PURCHASE AGREEMENT

SELLER:
Company Name: Bullfrog Group Ltd
Address: 1 Fenchurch St, London, UK

BUYER:
Company Name: Almexo Trading FZE
Address: Jebel Ali Free Zone, Dubai, UAE

Commodity: Iron Ore Fines 62%
Origin: Brazil
Quantity: 50,000 MT
Contract Price: USD 105.50 per MT
Payment Terms: Irrevocable DLC at sight
Port of Loading: Port of Tubarao
Port of Discharge: Qingdao Port
`;

const createdIds: string[] = [];

after(async () => {
  for (const id of createdIds.reverse()) {
    try { await storage.deleteDocument(id); } catch {}
  }
});

async function makeSignedSpaParent(label: string) {
  const doc = await storage.createDocument({
    docType: "SPA",
    title: `SPA - concurrent derive test (${label})`,
    status: "draft",
    content: SPA_CONTENT,
    dealRecapNumber: `TST/TST-0000-${label}`,
    buyerSignature: "Buyer Signatory",
    sellerSignature: "Seller Signatory",
  } as any);
  createdIds.push(doc.id);
  return doc;
}

async function childrenOfType(parentId: string, docType: string) {
  const all = await storage.getDocuments();
  return all.filter((d) => d.parentDocId === parentId && d.docType === docType);
}

for (const childType of SPA_CHILD_TYPES) {
  test(`two concurrent deriveNextDocument calls create exactly one ${childType} from a signed SPA`, async () => {
    const parent = await makeSignedSpaParent(childType);

    const [a, b] = await Promise.all([
      deriveNextDocument(parent, childType, true, true),
      deriveNextDocument(parent, childType, true, true),
    ]);

    const winners = [a, b].filter((d) => d != null);
    assert.equal(winners.length, 1, `exactly one concurrent ${childType} derivation must win (got ${winners.length})`);
    for (const w of winners) createdIds.push(w.id);

    const children = await childrenOfType(parent.id, childType);
    assert.equal(children.length, 1, `exactly one ${childType} child row must exist for the parent`);
    assert.equal(children[0].parentDocId, parent.id);

    // A later single retry (e.g. the second signer's request arriving after
    // the first completed) must also be refused.
    const retry = await deriveNextDocument(parent, childType, true, true);
    assert.equal(retry, null, `a follow-up ${childType} derivation must be refused`);
  });
}

test("the full signed-SPA fan-out run twice concurrently yields one child per type", async () => {
  const parent = await makeSignedSpaParent("FANOUT");

  // Simulate two concurrent sign requests each running the AUTO_SIGN_CHAIN
  // fan-out sequentially (as the sign endpoint does).
  const runFanOut = async () => {
    const out: any[] = [];
    for (const t of SPA_CHILD_TYPES) {
      const created = await deriveNextDocument(parent, t, true, true);
      if (created) out.push(created);
    }
    return out;
  };

  const [r1, r2] = await Promise.all([runFanOut(), runFanOut()]);
  for (const d of [...r1, ...r2]) createdIds.push(d.id);

  for (const t of SPA_CHILD_TYPES) {
    const children = await childrenOfType(parent.id, t);
    assert.equal(children.length, 1, `exactly one ${t} child must exist after both fan-outs`);
  }
  assert.equal(r1.length + r2.length, SPA_CHILD_TYPES.length, "the two fan-outs together create exactly three children");
});
