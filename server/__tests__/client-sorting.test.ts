import { test } from "node:test";
import assert from "node:assert/strict";
import { compareClientDetails, sortClientDetails } from "../../shared/client-sorting";

test("client details sort case-insensitively without mutating the source", () => {
  const source = [
    { id: "3", companyName: "zeta Trading", contactName: "Zed" },
    { id: "2", companyName: "Alpha Commodities", contactName: "Bea" },
    { id: "1", companyName: "alpha commodities", contactName: "Ana" },
  ];

  const sorted = sortClientDetails(source);

  assert.deepEqual(sorted.map((client) => client.id), ["1", "2", "3"]);
  assert.deepEqual(source.map((client) => client.id), ["3", "2", "1"]);
});

test("client details put blank companies last and use stable fallbacks", () => {
  const sorted = sortClientDetails([
    { id: "2", companyName: "", contactPerson: "Zoe" },
    { id: "4", companyName: "Beta", contactName: "Alex" },
    { id: "3", companyName: null, contactPerson: "Ana" },
    { id: "1", companyName: "Beta", contactName: "  ", contactPerson: "Alex" },
  ]);

  assert.deepEqual(sorted.map((client) => client.id), ["1", "4", "3", "2"]);
  assert.ok(compareClientDetails(sorted[0], sorted[1]) < 0);
});