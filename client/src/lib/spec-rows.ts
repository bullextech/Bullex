// Shared serialization for commodity chemical-composition rows.
//
// Specs are stored as a newline blob: "Param: Spec (Rejection: X) [Method: Y]".
// The enquiry form, the document generator's spec editor and this parser must
// stay in lockstep — parsing is end-anchored so values containing ':' or '('
// still round-trip.

export interface SpecRow {
  parameter: string;
  specification: string;
  rejection: string;
  testMethod: string;
}

export const serializeSpecRows = (rows: SpecRow[]): string =>
  rows
    .filter((r) => r.parameter || r.specification || r.rejection || r.testMethod)
    .map((r) => `${r.parameter}: ${r.specification}${r.rejection ? ` (Rejection: ${r.rejection})` : ""}${r.testMethod ? ` [Method: ${r.testMethod}]` : ""}`)
    .join("\n");

export const parseSpecRows = (raw: string | null | undefined): SpecRow[] | null => {
  const lines = (raw || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  return lines.map((line) => {
    let testMethod = "";
    let rejection = "";
    let rest = line;
    const methodMatch = rest.match(/\[Method:\s*(.*?)\]\s*$/i);
    if (methodMatch && methodMatch.index !== undefined) {
      testMethod = (methodMatch[1] || "").trim();
      rest = rest.slice(0, methodMatch.index).trim();
    }
    const rejMatch = rest.match(/\(Rejection:\s*(.*?)\)\s*$/i);
    if (rejMatch && rejMatch.index !== undefined) {
      rejection = (rejMatch[1] || "").trim();
      rest = rest.slice(0, rejMatch.index).trim();
    }
    const colon = rest.indexOf(":");
    if (colon >= 0) {
      return { parameter: rest.slice(0, colon).trim(), specification: rest.slice(colon + 1).trim(), rejection, testMethod };
    }
    return { parameter: "", specification: rest, rejection, testMethod };
  });
};
