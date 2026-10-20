import test from "node:test";
import assert from "node:assert/strict";
import { COPPER_CATHODE_ROWS, copperCathodePreset, enquirySpecTemplate, isCopperCathode } from "../../shared/copper-cathodes";
import { parseSpecRows, serializeSpecRows } from "../../client/src/lib/spec-rows";
import { generateDocumentContent } from "../documentTemplates";

const empty = { product: "Copper cathodes", origin: "", packing: "", specifications: "" };
const sample = copperCathodePreset(empty, [])!;
const specifications = serializeSpecRows(sample.specRows);

test("complete source rows round-trip without precision loss or invented methods", () => {
  assert.equal(COPPER_CATHODE_ROWS.length, 26);
  assert.deepEqual(parseSpecRows(specifications), sample.specRows);
  for (const [parameter, specification] of COPPER_CATHODE_ROWS) {
    assert.deepEqual(sample.specRows.find(r => r.parameter === parameter), { parameter, specification, rejection: "", testMethod: "" });
  }
  const chemistry = sample.specRows.slice(12, 24).map(r => r.specification);
  assert.deepEqual(chemistry, ["99.99%", "0.0002% maximum", "0.0002% maximum", "0.0001% maximum", "0.0004% maximum", "0.0005% maximum", "0.0005% maximum", "0.001% maximum", "0.001% maximum", "0.0005% maximum", "0.0015% maximum", "0.0025% maximum"]);
  assert.match(specifications, /99.99% -99.97% minimum; rejection below 99.97%/);
  assert.match(specifications, /BS EN 1978:2022/);
});

test("matching is cathode-only and existing negotiated specifications block application", () => {
  for (const product of ["copper cathode", "Electrolytic Copper Cathodes Grade A", "Copper-cathodes", "Copper Grade A Cathodes", "Cathodes (Copper)", "Cu cathodes", "Copper_cathodes", "Copper – cathodes"]) assert.ok(isCopperCathode(product));
  for (const product of ["Copper", "Copper ore", "Copper scrap", "Copper cathode scrap", "Copper concentrates", "Copper cathode ore", "Copper cathode wire", "LPG"]) {
    assert.equal(copperCathodePreset({ ...empty, product }, []), null);
  }
  assert.equal(copperCathodePreset({ ...empty, specifications: "Negotiated" }, []), null);
  for (const key of ["parameter", "specification", "rejection", "testMethod"]) {
    assert.equal(copperCathodePreset(empty, [{ parameter: "", specification: "", rejection: "", testMethod: "", [key]: "Negotiated" }]), null);
  }
  const edited = copperCathodePreset({ ...empty, origin: "Chile", packing: "Negotiated packing" }, [])!;
  assert.equal(edited.origin, "Chile");
  assert.equal(edited.specRows.find(r => r.parameter === "Origin")!.specification, "Chile");
  assert.equal(edited.specRows.find(r => r.parameter === "Packaging")!.specification, "Negotiated packing");
});

test("blank form can apply explicitly and fills commodity and all specification rows", () => {
  const blank = { product: "", origin: "", packing: "", specifications: "" };
  const result = copperCathodePreset(blank, [], () => { throw new Error("Blank form needs no confirmation"); })!;
  assert.equal(result.product, "Copper Cathodes");
  assert.equal(result.origin, "Zambia");
  assert.equal(result.specRows.length, 26);
  assert.deepEqual(parseSpecRows(serializeSpecRows(result.specRows)), result.specRows);
  assert.equal(blank.product, "", "input is not mutated");
});

test("unrelated commodity and existing specs require explicit confirmation, cancellation preserves input", () => {
  const current = { product: "Iron Ore", origin: "Chile", packing: "Custom packing", specifications: "Negotiated text" };
  const rows = [{ parameter: "User row", specification: "Custom value", rejection: "Custom rejection", testMethod: "Custom method" }];
  const before = JSON.stringify({ current, rows });
  assert.equal(copperCathodePreset(current, rows), null);
  assert.equal(copperCathodePreset(current, rows, () => false), null);
  assert.equal(JSON.stringify({ current, rows }), before);
  let confirmations = 0;
  const result = copperCathodePreset(current, rows, message => {
    confirmations++;
    assert.match(message, /Change commodity.*Iron Ore/);
    assert.match(message, /Replace all existing specifications/);
    return true;
  })!;
  assert.equal(confirmations, 1);
  assert.equal(result.product, "Copper Cathodes");
  assert.equal(result.origin, "Chile");
  assert.equal(result.packing, "Custom packing");
  assert.equal(result.specRows.find(r => r.parameter === "Packaging")?.specification, "Custom packing");
  assert.equal(JSON.stringify({ current, rows }), before);
});

test("spec-template lookup prioritizes saved negotiated specs and falls back only for cathodes", () => {
  const saved = { product: "Copper Cathode", specifications: "Negotiated purity: 99.98%" };
  assert.deepEqual(enquirySpecTemplate("Copper Cathodes", saved), { ...saved, source: "saved" });
  const fallback = enquirySpecTemplate("Copper Grade A Cathodes");
  assert.equal(fallback.source, "builtin-copper");
  assert.deepEqual(parseSpecRows(fallback.specifications), sample.specRows);
  assert.equal(enquirySpecTemplate("Copper cathode", { ...saved, specifications: " " }).source, "builtin-copper");
  for (const product of ["", "Copper", "Copper ore", "Copper scrap", "Copper cathode scrap", "LPG"]) {
    assert.equal(enquirySpecTemplate(product).specifications, null);
  }
});

for (const kind of ["LOI", "FCO", "SPA"]) test(`${kind} generation carries every specification and preserves custom edits`, () => {
  const render = (qualitySpecs: string) => generateDocumentContent(kind, undefined,
    { name: "Fixture buyer" }, { name: "Fixture seller" },
    { commodity: empty.product, origin: sample.origin, packing: sample.packing, qualitySpecs });
  const content = render(specifications);
  for (const row of sample.specRows) assert.ok(content.includes(row.specification), `${kind}: ${row.parameter}`);
  const custom = render("Copper content: negotiated purity");
  assert.ok(custom.includes("negotiated purity"));
  assert.ok(!custom.includes("0.0002% maximum"));
});