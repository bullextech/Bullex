// Canonical "main product" grouping shared by server (enquiry board grouping,
// same-commodity pairing) and client (block images/labels). Product names vary
// per enquiry ("Granular Sulphur", "Sulphur 99.9%"...), so vault-style blocks
// group by keyword-matched main product rather than the exact string.
// IMPORTANT: these rules also gate PAIRING (deal formation, candidate TFRs,
// suggested matches), not just presentation — so each pattern must only match
// true variants of ONE tradable commodity. Never add generic catch-alls here
// (e.g. "fuel" would merge fuel oil/petcoke with EN590 diesel, "fertilizer"
// would merge NPK/DAP/potash with urea). Broad, image-only matching lives in
// client/src/lib/product-images.ts.
export const productGroupRules: { test: RegExp; label: string }[] = [
  {
    test: /\bdiesel\b|\ben\s*590\b|\ben590\b|\bgas\s*oil\b|\bgasoil\b|\bd2\b/i,
    label: "Diesel",
  },
  { test: /\bsulphur\b|\bsulfur\b/i, label: "Sulphur" },
  { test: /\burea\b/i, label: "Urea" },
  { test: /\blpg\b|liquefied petroleum gas/i, label: "LPG" },
  {
    test: /\b(?:crude\s+|refined\s+)?sunflower\s+oil\b|\bsunflower\s+seed\s+oil\b/i,
    label: "Sunflower Oil",
  },
];

// Resolve a product name to its canonical group. Known main products collapse
// onto a shared key/label; unknown products fall back to their own normalized
// name so unrelated commodities never merge.
export function canonicalProductGroup(product: string | null | undefined): { key: string; label: string } {
  const name = (product || "").trim();
  const rule = productGroupRules.find((r) => r.test.test(name));
  if (rule) return { key: rule.label.toLowerCase(), label: rule.label };
  return { key: name.toLowerCase(), label: name };
}

// True when two product names belong to the same main-product group.
export function sameProductGroup(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = canonicalProductGroup(a).key;
  return !!ka && ka === canonicalProductGroup(b).key;
}

// Stable identity for the logical product parent shown in the blockchain
// explorer. This deliberately considers the commodity name only — never grade,
// specifications, origin, parties, or commercial terms. Known main-product
// variants use the conservative pairing groups above; unknown names merge only
// across Unicode/case/whitespace differences.
export function canonicalCommodityBlockParent(
  commodity: string | null | undefined,
): { key: string; label: string } {
  const normalizedName = (commodity || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ");
  if (!normalizedName) {
    return { key: "unknown-commodity", label: "Unknown Commodity" };
  }

  const group = canonicalProductGroup(normalizedName);
  return {
    key: group.key.normalize("NFKC").toLocaleLowerCase("en-US"),
    label: group.label,
  };
}
