// Shared product imagery for vault-style blocks (DocuVault, DealVault).
// Keyword-matched against product/commodity names; falls back to a generic
// trade image so every block always has a picture.
import imgDiesel from "@/assets/products/diesel.jpg";
import imgSulphur from "@/assets/products/sulphur.jpg";
import imgUrea from "@/assets/products/urea.jpg";
import imgLpg from "@/assets/products/lpg.jpg";
import imgSunflower from "@/assets/products/sunflower.jpg";
import imgGeneric from "@/assets/products/generic.jpg";
// Image-only matching: deliberately BROADER than the pairing rules in
// shared/product-groups.ts. A fuel-oil block showing the diesel picture is
// harmless; letting fuel oil PAIR with EN590 is not — keep the two rule sets
// separate.
export const productImageRules: { test: RegExp; img: string; name: string }[] = [
  { test: /diesel|en\s*590|en590|gas\s*oil|gasoil|d2\b|jet\s*a1|fuel/i, img: imgDiesel, name: "Diesel / Fuel" },
  { test: /sulphur|sulfur/i, img: imgSulphur, name: "Sulphur" },
  { test: /urea|fertili[sz]er/i, img: imgUrea, name: "Urea" },
  { test: /\blpg\b|petroleum gas|propane|butane/i, img: imgLpg, name: "LPG" },
  { test: /sunflower/i, img: imgSunflower, name: "Sunflower Oil" },
];

export const genericProductImage = imgGeneric;

// Match a single product name to its block image.
export function productImageFor(product: string): { img: string; name: string | null } {
  const rule = productImageRules.find((r) => r.test.test(product || ""));
  return rule ? { img: rule.img, name: rule.name } : { img: imgGeneric, name: null };
}
