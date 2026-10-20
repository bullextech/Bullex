// Guard tests: joint co-seller/co-buyer companies must keep rendering on the
// bespoke party spots of DEAL_RECAP, SCO, NCNDA and LC templates.
//
// Joint parties render as SEPARATE labeled blocks: the primary party keeps its
// own Company/Address/Contact lines, and a "CO-SELLER DETAILS ..." /
// "CO-BUYER DETAILS ..." block (with "Co-Seller Company/Address/Contact"
// labels) follows. Table-style templates add dedicated Co-Seller/Co-Buyer
// rows. Signature spots still sign for both companies via the combined
// "jointly with" name. These templates have hand-written party blocks (not the
// shared buyerBlock/sellerBlock), so a future template rewrite could silently
// drop the joint company from a legal document. These tests render real
// content with the production templates and pin the rendering in each block.
//
// Run with:  npx tsx --test server/__tests__/joint-party-templates.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDocumentContent, type PartyDetails } from "../documentTemplates";

const jointBuyer: PartyDetails = {
  name: "Acme Buyers DMCC",
  address: "Dubai, UAE",
  contact: "buyer@acme.example",
  coName: "Beta Trading FZE",
  coAddress: "Sharjah, UAE",
  coContact: "co@beta.example",
};
const jointSeller: PartyDetails = {
  name: "Globex Sellers Ltd",
  address: "Singapore",
  contact: "seller@globex.example",
  coName: "Gamma Resources Pte",
  coAddress: "Jurong, Singapore",
  coContact: "co@gamma.example",
};
const plainBuyer: PartyDetails = { name: "Acme Buyers DMCC", address: "Dubai, UAE", contact: "buyer@acme.example" };
const plainSeller: PartyDetails = { name: "Globex Sellers Ltd", address: "Singapore", contact: "seller@globex.example" };

const product = {
  commodity: "Copper Cathode",
  origin: "Zambia",
  quantity: "5,000 MT",
  incoterm: "CIF",
  laycan: "15-30 July 2026",
  price: "8,500",
  currency: "USD",
  qualitySpecs: "Cu: 99.99% min",
  paymentTerms: "By DLC at sight against shipping documents",
};

const JOINT_SELLER = "Globex Sellers Ltd jointly with Gamma Resources Pte";
const JOINT_BUYER = "Acme Buyers DMCC jointly with Beta Trading FZE";

const CO_BUYER_BLOCK = [
  "CO-BUYER DETAILS (JOINT BUYER)",
  "Co-Buyer Company: Beta Trading FZE",
  "Co-Buyer Address: Sharjah, UAE",
  "Co-Buyer Contact: co@beta.example",
].join("\n");
const CO_SELLER_BLOCK = [
  "CO-SELLER DETAILS (JOINT SELLER)",
  "Co-Seller Company: Gamma Resources Pte",
  "Co-Seller Address: Jurong, Singapore",
  "Co-Seller Contact: co@gamma.example",
].join("\n");

// ── SCO ─────────────────────────────────────────────────────────────────────

test("SCO: TO/FROM blocks keep primaries and render co-parties separately", () => {
  const sco = generateDocumentContent("SCO", undefined, jointBuyer, jointSeller, product);
  assert.ok(sco.includes("Company: Acme Buyers DMCC"));
  assert.ok(sco.includes("Address: Dubai, UAE"));
  assert.ok(sco.includes("Attention: buyer@acme.example"));
  assert.ok(sco.includes(CO_BUYER_BLOCK));
  assert.ok(sco.includes("Company: Globex Sellers Ltd"));
  assert.ok(sco.includes("Address: Singapore"));
  assert.ok(sco.includes("Attention: seller@globex.example"));
  assert.ok(sco.includes(CO_SELLER_BLOCK));
});

test("SCO: signature block signs for the joint seller", () => {
  const sco = generateDocumentContent("SCO", undefined, jointBuyer, jointSeller, product);
  assert.ok(sco.includes(`For and on behalf of: ${JOINT_SELLER}`));
});

test("SCO: plain parties render unchanged, no co-party blocks", () => {
  const sco = generateDocumentContent("SCO", undefined, plainBuyer, plainSeller, product);
  assert.ok(sco.includes("Company: Acme Buyers DMCC"));
  assert.ok(sco.includes("Company: Globex Sellers Ltd"));
  assert.ok(sco.includes("For and on behalf of: Globex Sellers Ltd"));
  assert.ok(!sco.includes("jointly with"));
  assert.ok(!sco.includes("Co-Buyer"));
  assert.ok(!sco.includes("Co-Seller"));
});

// ── DEAL RECAP ──────────────────────────────────────────────────────────────

test("DEAL_RECAP: Chapter I table lists seller/buyer and co-parties in own rows", () => {
  const recap = generateDocumentContent("DEAL_RECAP", undefined, jointBuyer, jointSeller, product);
  assert.ok(recap.includes("Seller                        │ Globex Sellers Ltd"));
  assert.ok(recap.includes("Co-Seller                     │ Gamma Resources Pte"));
  assert.ok(recap.includes("Buyer                         │ Acme Buyers DMCC"));
  assert.ok(recap.includes("Co-Buyer                      │ Beta Trading FZE"));
});

test("DEAL_RECAP: signature block carries joint names and primary contacts", () => {
  const recap = generateDocumentContent("DEAL_RECAP", undefined, jointBuyer, jointSeller, product);
  assert.ok(recap.includes("For and on behalf of the Seller:"));
  assert.ok(recap.includes(JOINT_SELLER));
  assert.ok(recap.includes(JOINT_BUYER));
  assert.ok(recap.includes("Name: seller@globex.example"));
  assert.ok(recap.includes("Name: buyer@acme.example"));
});

test("DEAL_RECAP: plain parties render unchanged, no co rows", () => {
  const recap = generateDocumentContent("DEAL_RECAP", undefined, plainBuyer, plainSeller, product);
  assert.ok(recap.includes("Seller                        │ Globex Sellers Ltd"));
  assert.ok(recap.includes("Buyer                         │ Acme Buyers DMCC"));
  assert.ok(!recap.includes("jointly with"));
  assert.ok(!recap.includes("Co-Seller"));
  assert.ok(!recap.includes("Co-Buyer"));
});

// ── NCNDA ───────────────────────────────────────────────────────────────────

test("NCNDA: Party A/B recitals keep primaries and add separate co-party blocks", () => {
  const ncnda = generateDocumentContent("NCNDA", undefined, jointBuyer, jointSeller, product);
  // Party A is the seller side, Party B the buyer side
  assert.ok(ncnda.includes("1. Globex Sellers Ltd, a company incorporated"));
  assert.ok(ncnda.includes("2. Acme Buyers DMCC, a company incorporated"));
  assert.ok(ncnda.includes("registered office at Singapore"));
  assert.ok(ncnda.includes("registered office at Dubai, UAE"));
  assert.ok(ncnda.includes(CO_SELLER_BLOCK));
  assert.ok(ncnda.includes(CO_BUYER_BLOCK));
});

test("NCNDA: signature block signs for the primary parties", () => {
  const ncnda = generateDocumentContent("NCNDA", undefined, jointBuyer, jointSeller, product);
  assert.ok(ncnda.includes("For and on behalf of Party A:"));
  assert.ok(ncnda.includes("Globex Sellers Ltd"));
  assert.ok(ncnda.includes("Acme Buyers DMCC"));
});

test("NCNDA: plain parties render unchanged, no co-party blocks", () => {
  const ncnda = generateDocumentContent("NCNDA", undefined, plainBuyer, plainSeller, product);
  assert.ok(ncnda.includes("1. Globex Sellers Ltd, a company incorporated"));
  assert.ok(ncnda.includes("2. Acme Buyers DMCC, a company incorporated"));
  assert.ok(!ncnda.includes("jointly with"));
  assert.ok(!ncnda.includes("Co-Seller"));
  assert.ok(!ncnda.includes("Co-Buyer"));
});

// ── LC ──────────────────────────────────────────────────────────────────────

test("LC: applicant and beneficiary blocks keep primaries and add co blocks", () => {
  const lc = generateDocumentContent("LC", undefined, jointBuyer, jointSeller, product);
  const applicantIdx = lc.indexOf("APPLICANT (BUYER)");
  const beneficiaryIdx = lc.indexOf("BENEFICIARY (SELLER)");
  assert.ok(applicantIdx > -1 && beneficiaryIdx > applicantIdx);
  const applicantBlock = lc.slice(applicantIdx, beneficiaryIdx);
  const beneficiaryBlock = lc.slice(beneficiaryIdx, lc.indexOf("ADVISING BANK"));
  assert.ok(applicantBlock.includes("Company: Acme Buyers DMCC"));
  assert.ok(applicantBlock.includes("Address: Dubai, UAE"));
  assert.ok(applicantBlock.includes(CO_BUYER_BLOCK));
  assert.ok(beneficiaryBlock.includes("Company: Globex Sellers Ltd"));
  assert.ok(beneficiaryBlock.includes("Address: Singapore"));
  assert.ok(beneficiaryBlock.includes(CO_SELLER_BLOCK));
});

test("LC: plain parties render unchanged, no co-party blocks", () => {
  const lc = generateDocumentContent("LC", undefined, plainBuyer, plainSeller, product);
  assert.ok(lc.includes("Company: Acme Buyers DMCC"));
  assert.ok(lc.includes("Company: Globex Sellers Ltd"));
  assert.ok(!lc.includes("jointly with"));
  assert.ok(!lc.includes("Co-Buyer"));
  assert.ok(!lc.includes("Co-Seller"));
});
