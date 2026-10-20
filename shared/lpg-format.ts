/** Editable sample commercial terms; never contains parties, bank details or fixed dates. */
export const LPG_REVIEW_NOTICE = "LPG sample format — review all values before use. Applies only to empty fields; existing entries are preserved. Approximate component quantities are rounded and may not sum to the approximate total.";
const LPG_PURPOSE = {
  ENQUIRY: "Non-binding request for quotation, not an offer or purchase commitment; all sample terms requested for discussion only.",
  LOI: "Non-binding expression of purchase intent, not an offer or contract; proposed terms subject to mutually executed SPA.",
  FCO: "Full corporate offer for acceptance within stated validity; subject to execution and performance terms below.",
};

/** Change only the unedited sample purpose sentence when deriving a document;
 * preserve all negotiated notes and commercial data verbatim. */
export function lpgPurposeForDocument(note: string, kind: "LOI" | "FCO"): string {
  const original = Object.values(LPG_PURPOSE).find(p => note.startsWith(p));
  return original ? LPG_PURPOSE[kind] + note.slice(original.length) : note;
}

export type LpgSpec = [property: string, unit: string, limit: string, requirement: string, astm: string, iso: string];
export const LPG_GRADES: { name: string; description: string; rows: LpgSpec[] }[] = [
  {
    name: "n-Butane",
    description: "Commercial n-Butane; GPA 2140 / ASTM D1835; Tanks 1–2; approx. 10,311 MT; storage 0.0°C; SG at 0.0°C: 0.6012 t/m³",
    rows: [
      ["Storage temperature", "°C", "—", "0.0°C", "—", "—"],
      ["Specific gravity at 0.0°C", "t/m³", "Reported", "~0.590–0.605", "D1657", "ISO 8973"],
      ["n-Butane (C4H10) & Iso-Butane (iC4)", "% mol/mol", "Min ≥", "94.0", "D2163", "ISO 7941"],
      ["Butylene (C4H8) — all isomers", "% mol/mol", "Max ≤", "5.0", "D2163", "ISO 7941"],
      ["Propane (C3H8)", "% mol/mol", "Max ≤", "3.0", "D2163", "ISO 7941"],
      ["Propylene (C3H6)", "% mol/mol", "Max ≤", "1.0", "D2163", "ISO 7941"],
      ["Pentane+ (C5+)", "% mol/mol", "Max ≤", "1.0", "D2163", "ISO 7941"],
      ["Total C4 hydrocarbons (n-C4+iC4+C4=)", "% mol/mol", "Min ≥", "94.0", "D2163", "ISO 7941"],
      ["Vapour pressure @ 37.8°C", "kPa gauge", "Max ≤", "345", "D1267", "ISO 4256"],
      ["Volatile residue (95% evap.)", "°C", "Max ≤", "+2", "D1837", "ISO 7941"],
      ["Residual matter", "mL/100mL", "Max ≤", "0.05", "D2158", "ISO 13757"],
      ["Copper strip corrosion", "Class", "Max", "Class 1", "D1838", "ISO 6251"],
      ["H2S content", "ppm vol", "Max ≤", "5", "D2420", "ISO 8819"],
      ["Total sulphur", "mg/kg", "Max ≤", "50", "D6667", "ISO 6326-5"],
      ["Moisture / water", "mg/kg", "Max ≤", "60", "D5454", "ISO 10337"],
      ["Free water", "Visual", "Abs", "None", "Visual", "—"],
      ["Fluoride", "ppm", "Max ≤", "1", "D7923", "IP 431"],
      ["Higher heating value (HHV)", "MJ/kg", "Range", "48.5 – 49.5", "D3588", "ISO 6976"],
      ["Lower heating value (LHV)", "MJ/kg", "Range", "44.5 – 45.5", "D3588", "ISO 6976"],
    ],
  },
  {
    name: "Propane",
    description: "Commercial Propane; GPA 2140 / ASTM D1835; Tanks 3–4; approx. 6,874 MT; storage −42.5°C; SG at −42.5°C: 0.5807 t/m³",
    rows: [
      ["Storage temperature", "°C", "—", "−42.5°C", "—", "—"],
      ["Specific gravity at −42.5°C", "t/m³", "Reported", "~0.5807", "D1657", "ISO 8973"],
      ["Propane (C3H8)", "% mol/mol", "Min ≥", "90.0", "D2163", "ISO 7941"],
      ["Propylene (C3H6)", "% mol/mol", "Max ≤", "5.0", "D2163", "ISO 7941"],
      ["n-Butane (C4H10) & Iso-Butane (iC4)", "% mol/mol", "Max ≤", "4.0", "D2163", "ISO 7941"],
      ["Ethane (C2H6)", "% mol/mol", "Max ≤", "2.0", "D2163", "ISO 7941"],
      ["Pentane+ (C5+)", "% mol/mol", "Max ≤", "0.2", "D2163", "ISO 7941"],
      ["Total impurities (n-C4+iC4+C2H6+C5+)", "% mol/mol", "Max ≤", "6.2", "D2163", "ISO 7941"],
      ["Total olefins (propylene + butenyl)", "% mol/mol", "Max ≤", "6.0", "D2163", "ISO 7941"],
      ["Vapour pressure @ 37.8°C", "kPa", "Range", "950 – 1,380", "D1267", "ISO 4256"],
      ["Volatile residue (95% evap.)", "°C", "Max ≤", "−37", "D1837", "ISO 7941"],
      ["Residual matter", "mL/100mL", "Max ≤", "0.05", "D2158", "ISO 13757"],
      ["Copper strip corrosion", "Class", "Max", "Class 1", "D1838", "ISO 6251"],
      ["H2S content", "ppm vol", "Max ≤", "5", "D2420", "ISO 8819"],
      ["Total sulphur", "mg/kg", "Max ≤", "50", "D6667", "ISO 6326-5"],
      ["Moisture / water", "mg/kg", "Max ≤", "60", "D5454", "ISO 10337"],
      ["Free water", "Visual", "Abs", "None", "Visual", "—"],
      ["Higher heating value (HHV)", "MJ/kg", "Range", "49.5 – 50.5", "D3588", "ISO 6976"],
      ["Lower heating value (LHV)", "MJ/kg", "Range", "45.5 – 46.5", "D3588", "ISO 6976"],
    ],
  },
];

// Keep the established four-column serialization, including grade in every
// parameter so downstream derivation never loses the association.
export const LPG_SPECIFICATIONS = LPG_GRADES.flatMap(g => [
  `${g.name} grade: ${g.description}`,
  ...g.rows.map(([p, u, l, r, a, i]) =>
    `${g.name} — ${p}: ${r}; Unit: ${u}; Limit: ${l} [Method: ASTM: ${a}; ISO / other: ${i}]`),
]).join("\n");

export function lpgDocumentPreset(kind: "LOI" | "FCO") {
  return {
    commodity: "LPG — Segregated Dual Grade 60 / 40 by weight: Commercial n-Butane 60% (Tanks 1–2) + Commercial Propane 40% (Tanks 3–4)",
    origin: "Brazil",
    quantity: "Approximately 17,184 MT ± 5% Seller’s option — n-Butane approx. 10,311 MT + Propane approx. 6,874 MT (rounded estimates)",
    packing: "Bulk, segregated refrigerated grades",
    qualitySpecs: LPG_SPECIFICATIONS,
    loadingPort: "Salvador de Bahia, Brazil (CODEBA)",
    dischargePort: "Port Qasim (Port Muhammad Bin Qasim), Karachi, Pakistan — one safe berth, one safe port",
    laycan: "To be confirmed",
    price: "n-Butane (commercial, min 94.0% C4H10 + iC4): Saudi Aramco CP n-Butane + 50 USD/MT; Propane (commercial, min 95.0% C3H8 + C3H6): Saudi Aramco CP Propane + 50 USD/MT. Ruling month: calendar month in which discharge is completed; officially published Saudi Aramco CP for that month final and binding for both grades.",
    currency: "USD",
    incoterm: "CIF",
    paymentTerms: "Irrevocable, Confirmed Letter of Credit at Sight issued by a top-rated international bank acceptable to Seller at its sole discretion, confirmed by a Seller-approved confirming bank. Operative not later than five (5) working days prior to loading.",
    validity: "3 banking days from date of issue",
    contractConfirmation: "Subject to execution of SPA by both Parties",
    docsForPayment: "Separate Bill of Lading and separate Certificate of Analysis per grade. Independent inspector's load port Certificate of Analysis and Quality and Quantity certificates final and binding for invoicing. Presentation of documents in accordance with CIF Incoterms® 2020.",
    otherTerms: "CIF Port Qasim, Pakistan (Incoterms® 2020). English Law — London arbitration. Execution sequence: signed acceptance of FCO; SPA executed by both Parties incorporating Seller's sanctions, destination and end-user provisions; Seller provides vessel name and Q88 at least ten (10) working days prior to loading; Buyer approves or rejects within one (1) working day of receipt, failing which vessel deemed approved; operative confirmed LC at sight at least five (5) working days before loading; upon Seller-approved confirming bank's confirmation that LC is operative and acceptable, loading commences and Seller provides load port Quality and Quantity certificates; joint inspection upon discharge arrival and LC drawn against compliant CIF documents.",
    compliance: "SPA to incorporate Seller's standard sanctions, destination and end-user provisions.",
    specialNote: `${kind === "LOI" ? "Non-binding expression of purchase intent, not an offer or contract; proposed terms subject to mutually executed SPA." : "Full corporate offer for acceptance within stated validity; subject to execution and performance terms below."} Vessel: 35,000 m³ MGC, fully refrigerated; Cape of Good Hope routing, Red Sea excluded. Transit approximately 35 days berth-to-berth, confirmed on vessel nomination. Buyer must evidence segregated refrigerated propane and n-butane terminal reception capability and available ullage before vessel nomination. Inspection: SGS or appointed representative/affiliate at load and discharge; load port inspection Seller's account, discharge Buyer's account. Sample quantities approximate and rounded; review allocation before agreement.`,
  };
}

export function lpgEnquiryPreset() {
  const p = lpgDocumentPreset("LOI");
  const { commodity, qualitySpecs, laycan, incoterm, specialNote, ...rest } = p;
  return { ...rest, product: commodity, specifications: qualitySpecs, deliveryPeriod: laycan,
    incoterms: incoterm, unit: "MT",
    additionalInfo: specialNote.replace("Non-binding expression of purchase intent, not an offer or contract; proposed terms subject to mutually executed SPA.", "Non-binding request for quotation, not an offer or purchase commitment; all sample terms requested for discussion only.") };
}

/** Explicit apply actions only fill gaps, including on partially completed forms. */
export function fillEmptyLpgFields<T extends { [K in keyof T]: string }>(current: T, preset: Partial<T>): T {
  const next = { ...current };
  for (const key of Object.keys(preset) as (keyof T)[]) {
    if (!current[key]?.trim() && preset[key] !== undefined) next[key] = preset[key]!;
  }
  return next;
}