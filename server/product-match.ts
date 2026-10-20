// Fuzzy product-name matching for spec-template reuse.
//
// Real-world commodity names vary between enquiries ("Granular Sulphur" vs
// "Granulated Sulphur", "GRANULAR UREA" vs "Urea Granular", "Sunflower Oil"
// vs "Sunflower Oil Refined (fit for Human Consumption)"). An exact match
// silently misses these, so after the exact lookup fails we score the typed
// product against the known accepted products and pick the closest one.
//
// Pure and DB-free so it can be unit-tested directly (see memory: pure
// helpers for shared-DB tests).

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) grams.add(padded.slice(i, i + 3));
  return grams;
}

// Dice coefficient over character trigrams (same idea as pg_trgm similarity).
function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ga = trigrams(a);
  const gb = trigrams(b);
  let shared = 0;
  ga.forEach((g) => { if (gb.has(g)) shared++; });
  const union = ga.size + gb.size - shared;
  return union === 0 ? 0 : shared / union;
}

// Word-level overlap: how much of the SHORTER name's words are covered by
// the longer one (order-insensitive, so "Urea Granular" ~ "Granular UREA").
function wordCoverage(a: string, b: string): number {
  const wa = a.split(" ").filter(Boolean);
  const wb = b.split(" ").filter(Boolean);
  if (wa.length === 0 || wb.length === 0) return 0;
  const [small, large] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  const largeSet = new Set(large);
  let hit = 0;
  for (const w of small) {
    if (largeSet.has(w)) { hit++; continue; }
    // tolerate morphological variants: granular/granulated, refined/refind
    if (w.length >= 5 && large.some((lw) => lw.length >= 5 && (lw.startsWith(w.slice(0, 5)) || w.startsWith(lw.slice(0, 5))))) hit += 0.9;
  }
  return hit / small.length;
}

// A normalized name is "specific" enough to drive a containment match when it
// is not a short generic token like "oil", "sulphur" or "copper": it must be
// reasonably long AND have either multiple words or a digit (grade/spec tokens
// like "en590" or "10ppm" are highly specific despite being single words).
function isSpecific(s: string): boolean {
  if (s.length < 5) return false;
  const words = s.split(" ").filter(Boolean);
  return words.length >= 2 || /\d/.test(s);
}

export function productMatchScore(typed: string, candidate: string): number {
  const a = normalize(typed);
  const b = normalize(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;
  // one contains the other (e.g. "sunflower oil" in "sunflower oil refined ...")
  // — but ONLY when the shorter side is specific enough that the containment
  // is meaningful. "oil" or "sulphur" alone must NOT claim a product family.
  const shorter = a.length <= b.length ? a : b;
  if ((a.includes(b) || b.includes(a)) && isSpecific(shorter)) return 0.95;
  // word coverage is also containment-like (the shorter name's words absorbed
  // by the longer), so it gets the same specificity gate; trigram similarity
  // needs no gate because generic short tokens score low against long names.
  const coverage = isSpecific(shorter) ? wordCoverage(a, b) * 0.9 : 0;
  return Math.max(trigramSimilarity(a, b), coverage);
}

const MATCH_THRESHOLD = 0.55;
// If the two best candidates score within this margin of each other, the
// input may be ambiguous — but only refuse when the candidates are genuinely
// DIFFERENT products, not spelling variants of the same commodity.
const AMBIGUITY_MARGIN = 0.08;
// Two candidate names scoring at least this against EACH OTHER are treated as
// variants of the same product ("Granular Sulphur" ~ "Granulated Sulphur"),
// so picking the more recent one is safe.
const SAME_PRODUCT_SCORE = 0.85;

// Returns the best-matching candidate product name, or undefined when nothing
// is close enough or the input is ambiguous between distinct products. Ties
// go to the earlier candidate, so callers should pass candidates ordered
// most-recent-first.
export function pickClosestProduct(typed: string, candidates: string[]): string | undefined {
  let best: string | undefined;
  let bestScore = 0;
  let runnerUp: string | undefined;
  let runnerUpScore = 0;
  for (const c of candidates) {
    const score = productMatchScore(typed, c);
    if (score > bestScore) {
      if (best !== undefined) { runnerUp = best; runnerUpScore = bestScore; }
      bestScore = score;
      best = c;
    } else if (score > runnerUpScore) {
      runnerUp = c;
      runnerUpScore = score;
    }
  }
  if (best === undefined || bestScore < MATCH_THRESHOLD) return undefined;
  if (bestScore === 1) return best; // exact match is never ambiguous
  // Containment matches (typed name literally inside the stored name, or vice
  // versa) mean the user typed the common core of a product family — e.g.
  // "Sunflower Oil" against both "Sunflower Oil Refined (...)" and "Refind
  // Sunflower Oil (...)". Picking the most recent family member beats
  // returning nothing; the guard below is for genuinely fuzzy guesses only.
  if (bestScore >= 0.95) return best;
  if (
    runnerUp !== undefined &&
    runnerUpScore >= MATCH_THRESHOLD &&
    bestScore - runnerUpScore < AMBIGUITY_MARGIN &&
    productMatchScore(best, runnerUp) < SAME_PRODUCT_SCORE
  ) {
    return undefined; // two genuinely different products are equally plausible
  }
  return best;
}
