// Pure tests: an enquiry cannot be accepted while key commercial details are
// blank. The PATCH status route is a thin wrapper around this shared validator.
import { test } from "node:test";
import assert from "node:assert/strict";
import { missingEnquiryAcceptanceDetails } from "@shared/schema";

const full = {
  side: "buy", quantity: "1000", price: "8000", incoterms: "FOB",
  buyerName: "Buyer Co", sellerName: "Seller Co",
  origin: "Zambia", loadingPort: "Dar es Salaam", dischargePort: "Shanghai",
};

test("complete enquiry has nothing missing", () => {
  assert.deepEqual(missingEnquiryAcceptanceDetails(full), []);
  assert.deepEqual(missingEnquiryAcceptanceDetails({ ...full, side: "sell" }), []);
});

test("blank commercial terms are reported by name", () => {
  const missing = missingEnquiryAcceptanceDetails({ ...full, quantity: " ", price: null, incoterms: undefined });
  assert.deepEqual(missing, ["Quantity", "Price", "Incoterms"]);
});

test("buy side requires buyer name and origin/loading port", () => {
  const missing = missingEnquiryAcceptanceDetails({ ...full, buyerName: "", origin: "", loadingPort: "" });
  assert.deepEqual(missing, ["Buyer name", "Origin or loading port"]);
  // origin alone satisfies the route requirement
  assert.deepEqual(missingEnquiryAcceptanceDetails({ ...full, loadingPort: "" }), []);
});

test("sell side requires seller name and discharge port", () => {
  const missing = missingEnquiryAcceptanceDetails({ ...full, side: "sell", sellerName: null, dischargePort: "" });
  assert.deepEqual(missing, ["Seller name", "Discharge port"]);
});
