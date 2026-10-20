import { test } from "node:test";
import assert from "node:assert/strict";
import { pickClosestProduct, productMatchScore } from "../product-match";

const CANDIDATES = [
  "Sunflower Oil Refined (fit for Human Consumption)",
  "Granulated Sulphur",
  "GRANULAR UREA",
  "Copper Cathode",
  "Diesel En590 10ppm",
];

test("exact match (case/whitespace-insensitive) wins", () => {
  assert.equal(pickClosestProduct("  granular urea ", CANDIDATES), "GRANULAR UREA");
  assert.equal(pickClosestProduct("COPPER CATHODE", CANDIDATES), "Copper Cathode");
});

test("shorter typed name matches a longer stored name (containment)", () => {
  assert.equal(pickClosestProduct("Sunflower Oil", CANDIDATES), "Sunflower Oil Refined (fit for Human Consumption)");
  assert.equal(pickClosestProduct("EN590", CANDIDATES), "Diesel En590 10ppm");
});

test("morphological variants match (granular vs granulated, refind vs refined)", () => {
  assert.equal(pickClosestProduct("Granular Sulphur", CANDIDATES), "Granulated Sulphur");
  assert.equal(pickClosestProduct("Refined Sunflower Oil", CANDIDATES), "Sunflower Oil Refined (fit for Human Consumption)");
});

test("word order does not matter", () => {
  assert.equal(pickClosestProduct("Urea Granular", CANDIDATES), "GRANULAR UREA");
});

test("short/generic tokens do NOT claim a product family (no false positives)", () => {
  assert.equal(pickClosestProduct("Oil", CANDIDATES), undefined);
  assert.equal(pickClosestProduct("Sulphur", CANDIDATES), undefined);
  assert.equal(pickClosestProduct("Copper", CANDIDATES), undefined);
  assert.equal(pickClosestProduct("Urea", CANDIDATES), undefined);
});

test("ambiguous input between two distinct close products returns nothing", () => {
  // "Refined Oil" fits both sunflower and palm equally — refuse to guess
  const oils = ["Refined Sunflower Oil", "Refined Palm Oil", "Copper Cathode"];
  assert.equal(pickClosestProduct("Refined Oil", oils), undefined);
  // exact match is never blocked by an ambiguity runner-up
  assert.equal(pickClosestProduct("Refined Palm Oil", oils), "Refined Palm Oil");
});

test("typed core name contained in TWO family variants picks the most recent", () => {
  // real production case: two accepted sunflower products both contain
  // "Sunflower Oil" — prefill from the most recent instead of refusing
  const family = [
    "Sunflower Oil Refined (fit for Human Consumption)",
    "Refind Sunflower Oil (4 Ltrs Pet Bottle Packing)",
    "Copper Cathode",
  ];
  assert.equal(pickClosestProduct("Sunflower Oil", family), "Sunflower Oil Refined (fit for Human Consumption)");
});

test("spelling variants of the SAME product do not trigger the ambiguity guard", () => {
  const variants = ["Granular Sulphur", "Granual Sulphur", "Copper Cathode"];
  assert.equal(pickClosestProduct("Granulated Sulphur", variants), "Granular Sulphur");
});

test("unrelated products do NOT match (no false positives)", () => {
  assert.equal(pickClosestProduct("Crude Palm Oil", CANDIDATES.filter((c) => !c.includes("Sunflower"))), undefined);
  assert.equal(pickClosestProduct("Aluminium Ingot", CANDIDATES), undefined);
  assert.equal(pickClosestProduct("LPG", CANDIDATES), undefined);
});

test("empty / blank input never matches", () => {
  assert.equal(pickClosestProduct("", CANDIDATES), undefined);
  assert.equal(pickClosestProduct("   ", CANDIDATES), undefined);
  assert.equal(productMatchScore("", "Copper Cathode"), 0);
});

test("most-recent-first tie-break: earlier candidate wins on equal score", () => {
  assert.equal(pickClosestProduct("Granulated Sulphur", ["Granulated Sulphur", "granulated  sulphur"]), "Granulated Sulphur");
});
