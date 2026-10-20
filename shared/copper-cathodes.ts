/** Reviewed sample from Copper_Cathodes_Specs_1791013621904.docx.
 * Available via explicit preset actions and as an empty-form template fallback.
 * Origin and packaging are editable commercial defaults.
 */
export const COPPER_CATHODE_NOTICE = "Uploaded copper cathodes specifications — review before use. Zambia origin and aluminium-band packaging are editable sample defaults. Existing specifications are preserved unless you confirm replacement.";

export function isCopperCathode(product: string): boolean {
  const name = product.replace(/[_–—-]/g, " ");
  return /\b(?:copper|cu)\b/i.test(name) && /\bcathodes?\b/i.test(name) &&
    !/\b(ores?|scrap|concentrates?|wires?|anodes?|alloys?)\b/i.test(name);
}

export const COPPER_CATHODE_ROWS = [
  ["Product", "Electrolytic copper cathodes, Grade A, non-LME registered"],
  ["Purity", "99.99% -99.97% minimum; rejection below 99.97%"],
  ["Dimensions", "914 mm × 914 mm × 12 mm (LME standards, as specified)"],
  ["Sheet weight", "125 kg (approximately ±2%)"],
  ["Net weight per pallet", "2,000 kg / 2.0 MT (approximately ±2%)"],
  ["Net weight per container", "20.0 MT (approximately ±2%)"],
  ["Packaging", "Palletised and secured with aluminium bands"],
  ["Origin", "Zambia"],
  ["Gross weight per container", "22.2 MT (approximately ±2%)"],
  ["Surface condition", "The length, width and thickness of each sheet shall conform to generally accepted as per international measurements. The copper cathode surfaces shall be free from imperfections and defects and shall not have been subjected to excessive exposure to outdoor weather."],
  ["Commodity", "Copper cathodes"],
  ["Grade", "A, Non-LME"],
  ["Copper content", "99.99%"],
  ["Selenium (Se)", "0.0002% maximum"],
  ["Tellurium (Te)", "0.0002% maximum"],
  ["Bismuth (Bi)", "0.0001% maximum"],
  ["Antimony (Sb)", "0.0004% maximum"],
  ["Lead (Pb)", "0.0005% maximum"],
  ["Arsenic (As)", "0.0005% maximum"],
  ["Iron (Fe)", "0.001% maximum"],
  ["Nickel (Ni)", "0.001% maximum"],
  ["Tin (Sn)", "0.0005% maximum"],
  ["Sulphur (S)", "0.0015% maximum"],
  ["Silver (Ag)", "0.0025% maximum"],
  ["Seller guarantee", "The Seller guarantees that the goods delivered under the contract will conform to the characteristics specified above."],
  ["Standard", "BS EN 1978:2022 copper cathodes, purity 99.99%–99.97%. Other materials may be present as described above."],
] as const;

/** Shared guard and preset used by enquiries and all three document forms. */
export function copperCathodePreset(current: {
  product: string; origin: string; packing: string; specifications: string;
}, rows: { parameter: string; specification: string; rejection: string; testMethod: string }[],
  confirm?: (message: string) => boolean) {
  const changeProduct = !!current.product.trim() && !isCopperCathode(current.product);
  const replaceSpecs = !!current.specifications.trim() ||
    rows.some(r => [r.parameter, r.specification, r.rejection, r.testMethod].some(v => v.trim()));
  if ((changeProduct || replaceSpecs) && !confirm?.([
    changeProduct ? `Change commodity from "${current.product}" to Copper Cathodes?` : "",
    replaceSpecs ? "Replace all existing specifications with the uploaded copper cathodes sample? Your current specifications will be removed." : "",
    "Existing origin and packing will be kept. Cancel to keep everything unchanged.",
  ].filter(Boolean).join("\n\n"))) return null;
  const origin = current.origin.trim() ? current.origin : "Zambia";
  const packing = current.packing.trim() ? current.packing : "Palletised and secured with aluminium bands";
  const specRows = COPPER_CATHODE_ROWS.map(([parameter, value]) => ({
    parameter,
    specification: parameter === "Origin" ? origin : parameter === "Packaging" ? packing : value,
    rejection: "", testMethod: "",
  }));
  return { product: !current.product.trim() || changeProduct ? "Copper Cathodes" : current.product, origin, packing, specRows };
}

/** Saved negotiated specifications always take precedence over the built-in sample. */
export function enquirySpecTemplate(product: string, saved?: { product: string; specifications: string } | null) {
  if (saved?.specifications.trim()) return { ...saved, source: "saved" as const };
  if (!isCopperCathode(product)) return { product: null, specifications: null, source: null };
  return {
    product: "Copper Cathodes",
    specifications: COPPER_CATHODE_ROWS.map(([parameter, value]) => `${parameter}: ${value}`).join("\n"),
    source: "builtin-copper" as const,
  };
}