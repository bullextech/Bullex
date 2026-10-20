import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPartyEmailAgainstEnquiry, extractEnquiryEmails } from "../routes";

// Enquiry contact fields are free text (e.g. "Vaman Kumar · +971-585416399" or
// "Cem Alaybeyi · +90545… · cem@almexo.com.tr"). The document create guard must
// validate a party's email ONLY against the same party's enquiry contact, and
// ONLY when that side actually recorded an email — otherwise legitimate SCO/LOI
// generation is wrongly blocked. See POST /api/documents in server/routes.ts.

test("extractEnquiryEmails pulls all emails from a free-text field, lowercased", () => {
  assert.deepEqual(
    [...extractEnquiryEmails("Cem Alaybeyi · +90545 · Cem.Alaybeyi@Almexo.com.tr")],
    ["cem.alaybeyi@almexo.com.tr"],
  );
  assert.deepEqual([...extractEnquiryEmails("Vaman Kumar · +971-585416399")], []);
  assert.deepEqual([...extractEnquiryEmails(null)], []);
  assert.deepEqual([...extractEnquiryEmails("")], []);
});

test("buyer email allowed when the enquiry recorded no buyer email (phone only)", () => {
  // The exact reported SCO bug: buyer contact is name+phone, only the seller has
  // an email. Entering the buyer's real email must NOT be rejected.
  const res = checkPartyEmailAgainstEnquiry({
    buyerContact: "buyer@realbuyer.com",
    sellerContact: "Cem · cem@almexo.com.tr",
    enquiryBuyerContact: "Vaman Kumar · +971-585416399",
    enquirySellerContact: "Cem Alaybeyi · +90545 · cem@almexo.com.tr",
  });
  assert.deepEqual(res, { ok: true });
});

test("buyer email rejected only when the enquiry DID record a mismatching buyer email", () => {
  const res = checkPartyEmailAgainstEnquiry({
    buyerContact: "someoneelse@evil.com",
    sellerContact: null,
    enquiryBuyerContact: "Vaman · vaman@bullfrog.ae",
    enquirySellerContact: null,
  });
  assert.deepEqual(res, { ok: false, side: "buyer" });
});

test("buyer email accepted when it matches the enquiry's buyer email (case-insensitive)", () => {
  const res = checkPartyEmailAgainstEnquiry({
    buyerContact: "Buyer Contact · VAMAN@bullfrog.ae",
    sellerContact: null,
    enquiryBuyerContact: "Vaman · vaman@bullfrog.ae",
    enquirySellerContact: null,
  });
  assert.deepEqual(res, { ok: true });
});

test("seller mismatch is reported as the seller side, independently of buyer", () => {
  const res = checkPartyEmailAgainstEnquiry({
    buyerContact: "vaman@bullfrog.ae",
    sellerContact: "wrong@nope.com",
    enquiryBuyerContact: "Vaman · vaman@bullfrog.ae",
    enquirySellerContact: "Cem · cem@almexo.com.tr",
  });
  assert.deepEqual(res, { ok: false, side: "seller" });
});

test("no party emails on the document at all is acceptable (not fail-closed)", () => {
  const res = checkPartyEmailAgainstEnquiry({
    buyerContact: "Vaman Kumar · +971-585416399",
    sellerContact: "Mr. Tom",
    enquiryBuyerContact: null,
    enquirySellerContact: null,
  });
  assert.deepEqual(res, { ok: true });
});
