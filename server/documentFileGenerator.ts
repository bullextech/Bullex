import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  VerticalAlign,
  VerticalMergeType,
  ShadingType,
  PageBreak,
  ImageRun,
} from "docx";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const docsDir = path.join(process.cwd(), "generated_docs");
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

function assertSafeDocId(docId: string): void {
  if (typeof docId !== "string" || !/^[A-Za-z0-9_-]+$/.test(docId)) {
    throw new Error("Invalid document id");
  }
}

function isInsideDocsDir(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  const root = path.resolve(docsDir);
  return resolved === root || resolved.startsWith(root + path.sep);
}

function sanitizeUnicode(text: string): string {
  return text
    .replace(/═/g, "=")
    .replace(/─/g, "-")
    .replace(/│/g, "|")
    .replace(/⬛\s*/g, "")
    .replace(/–/g, "-");
}

interface ParsedSection {
  type: "heading" | "subheading" | "separator" | "table-row" | "text";
  text: string;
  cells?: string[];
}

function parseContentToSections(content: string): ParsedSection[] {
  const sanitized = sanitizeUnicode(content);
  const lines = sanitized.split("\n");
  const sections: ParsedSection[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      sections.push({ type: "text", text: "" });
    } else if (trimmed.match(/^[=]{3,}$/)) {
      sections.push({ type: "separator", text: "" });
    } else if (trimmed.match(/^[-]{3,}$/)) {
      sections.push({ type: "separator", text: "" });
    } else if (trimmed.match(/^CHAPTER\s+[IVX]+\s*[-]/i)) {
      sections.push({ type: "subheading", text: trimmed });
    } else if (trimmed.match(/^ANNEX\s+[IVX]+/i)) {
      sections.push({ type: "subheading", text: trimmed });
    } else if (trimmed.includes("|")) {
      const cells = trimmed.split("|").map(c => c.trim());
      if (cells.length >= 2 && cells.filter(c => c.length > 0).length >= 2) {
        sections.push({ type: "table-row", text: trimmed, cells });
      } else {
        sections.push({ type: "text", text: trimmed });
      }
    } else if (trimmed.match(/^RECAP\s*[-]/) || (trimmed.match(/^[A-Z][A-Z &'/()\-]{2,}$/) && !trimmed.startsWith("["))) {
      if (sections.length <= 2) {
        sections.push({ type: "heading", text: trimmed });
      } else {
        sections.push({ type: "subheading", text: trimmed });
      }
    } else {
      sections.push({ type: "text", text: trimmed });
    }
  }
  return sections;
}

interface DealRecapData {
  tradeRef?: string;
  sellerName?: string;
  buyerName?: string;
  sellerContact?: string;
  buyerContact?: string;
  recapValidity?: string;
  commodity?: string;
  origin?: string;
  qualitySpecs?: string;
  deliveryBasis?: string;
  quantity?: string;
  price?: string;
  currency?: string;
  paymentTerms?: string;
  loadingWindow?: string;
  shippingTerms?: string;
  governingLaw?: string;
  annexSpecs?: string;
  qualityPremiums?: string;
  analysisAgency?: string;
  specialNote?: string;
}

function extractDealRecapData(content: string): DealRecapData {
  const data: DealRecapData = {};
  const sanitized = sanitizeUnicode(content);
  const lines = sanitized.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.includes("|")) continue;
    const parts = line.split("|").map(p => p.trim());
    if (parts.length < 2) continue;
    const key = parts[0].toLowerCase();
    const val = parts[1];
    if (!val || val === "_______________") continue;

    if (key.includes("contract reference")) data.tradeRef = val;
    else if (key === "seller") data.sellerName = val;
    else if (key === "buyer") data.buyerName = val;
    else if (key.includes("recap validity")) data.recapValidity = val;
    else if (key === "commodity") data.commodity = val;
    else if (key.includes("origin")) data.origin = val;
    else if (key.includes("quality") || key.includes("specification")) data.qualitySpecs = val;
    else if (key.includes("delivery basis")) data.deliveryBasis = val;
    else if (key.includes("quantity")) data.quantity = val;
    else if (key.includes("price") && key.includes("currency")) data.price = val;
    else if (key.includes("payment")) data.paymentTerms = val;
    else if (key.includes("loading")) data.loadingWindow = val;
    else if (key.includes("shipping")) data.shippingTerms = val;
    else if (key.includes("governing")) data.governingLaw = val;
  }

  const sigMatch = sanitized.match(/Name:\s*(.+?)(?:\s{4,}|$)/);
  if (sigMatch) data.sellerContact = sigMatch[1].trim();
  const buyerSigMatch = sanitized.match(/Name:\s*.+?\s{4,}Name:\s*(.+?)$/m);
  if (buyerSigMatch) data.buyerContact = buyerSigMatch[1].trim();

  const annexStart = sanitized.indexOf("PRODUCT SPECIFICATION");
  if (annexStart > -1) {
    const afterAnnex = sanitized.substring(annexStart);
    const specLines = afterAnnex.split("\n")
      .filter(l => l.includes("|") && !l.trim().match(/^[-=]+$/) && !l.includes("Parameter"))
      .map(l => l.trim());
    if (specLines.length > 0) data.annexSpecs = specLines.join("\n");

    const qpMatch = afterAnnex.match(/QUALITY PREMIUMS AND PENALTIES[\s\S]*?(?=\n\n(?:SAMPLING|$))/i);
    if (qpMatch) {
      const qpText = qpMatch[0].replace(/QUALITY PREMIUMS AND PENALTIES[:\s]*/i, "").replace(/^[-=]+$/gm, "").trim();
      if (qpText && qpText !== "To be agreed between Buyer and Seller.") data.qualityPremiums = qpText;
    }
  }

  const agencyMatch = sanitized.match(/inspection company such as ([^\n.]+)/);
  if (agencyMatch) data.analysisAgency = agencyMatch[1].trim();

  const productMatch = sanitized.match(/Product:\s*(.+)/);
  if (productMatch && !data.commodity) data.commodity = productMatch[1].trim();

  return data;
}

const thinBorder = {
  top: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
  left: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
  right: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
};

const headerShading = {
  type: ShadingType.SOLID as const,
  color: "F2F2F2",
  fill: "F2F2F2",
};

function makeDocxCell(text: string, bold: boolean = false, width?: number, shading?: any): TableCell {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, bold, size: 20, font: "Calibri" })],
      spacing: { before: 60, after: 60 },
    })],
    verticalAlign: VerticalAlign.CENTER,
    borders: thinBorder,
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: shading || undefined,
  });
}

function make2ColTable(rows: [string, string][]): Table {
  return new Table({
    rows: rows.map(([item, desc], idx) =>
      new TableRow({
        children: [
          makeDocxCell(item, true, 3200, idx === 0 ? headerShading : undefined),
          makeDocxCell(desc, idx === 0, 6800, idx === 0 ? headerShading : undefined),
        ],
      })
    ),
    width: { size: 10000, type: WidthType.DXA },
  });
}

function make4ColTable(rows: [string, string, string, string][]): Table {
  return new Table({
    rows: rows.map(([a, b, c, d], idx) =>
      new TableRow({
        children: [
          makeDocxCell(a, idx === 0, 2400, idx === 0 ? headerShading : undefined),
          makeDocxCell(b, idx === 0, 2600, idx === 0 ? headerShading : undefined),
          makeDocxCell(c, idx === 0, 2600, idx === 0 ? headerShading : undefined),
          makeDocxCell(d, idx === 0, 2400, idx === 0 ? headerShading : undefined),
        ],
      })
    ),
    width: { size: 10000, type: WidthType.DXA },
  });
}

function makeSignatoryTable(sellerName: string, buyerName: string, sellerContact: string, buyerContact: string, dateStr: string): Table {
  const rows = [
    ["For and on behalf of the Seller:", "For and on behalf of the Buyer:"],
    [sellerName, buyerName],
    [`Name: ${sellerContact}`, `Name: ${buyerContact}`],
    ["Authorised Signatory:", "Authorised Signatory:"],
    ["Title:", "Title:"],
    [`Date: ${dateStr}`, `Date: ${dateStr}`],
    ["", ""],
    ["Signature & Stamp:", "Signature & Stamp:"],
  ];
  return new Table({
    rows: rows.map(([left, right]) =>
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: left, size: 20, font: "Calibri", bold: left.startsWith("For ") })],
              spacing: { before: 40, after: 40 },
            })],
            borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
            width: { size: 5000, type: WidthType.DXA },
          }),
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: right, size: 20, font: "Calibri", bold: right.startsWith("For ") })],
              spacing: { before: 40, after: 40 },
            })],
            borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
            width: { size: 5000, type: WidthType.DXA },
          }),
        ],
      })
    ),
    width: { size: 10000, type: WidthType.DXA },
  });
}

function buildDealRecapDocx(content: string): (Paragraph | Table)[] {
  const d = extractDealRecapData(content);
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const children: (Paragraph | Table)[] = [];

  const heading = (text: string) => new Paragraph({
    children: [new TextRun({ text, bold: true, size: 28, font: "Calibri" })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
  });

  const chapterHeading = (text: string) => new Paragraph({
    children: [new TextRun({ text, bold: true, size: 24, font: "Calibri" })],
    spacing: { before: 300, after: 150 },
    shading: { type: ShadingType.SOLID, color: "E8E8E8", fill: "E8E8E8" },
  });

  const spacer = () => new Paragraph({ spacing: { before: 100, after: 100 } });

  const textPara = (text: string, bold: boolean = false) => new Paragraph({
    children: [new TextRun({ text, bold, size: 20, font: "Calibri" })],
    spacing: { before: 60, after: 60 },
  });

  children.push(heading("RECAP - COMMERCIAL TERMS CONFIRMATION"));
  children.push(spacer());

  children.push(chapterHeading("Chapter I - Introductory & Background"));
  children.push(make2ColTable([
    ["Item", "Description"],
    ["Contract Reference", d.tradeRef || ""],
    ["Effective Date", "Date of last authorized signature"],
    ["Seller", d.sellerName || ""],
    ["Buyer", d.buyerName || ""],
    ["Legal Model of Contract", "Sales and Purchase Agreement (SPA)"],
    ["Recap Validity", d.recapValidity || "Valid for acceptance for five (5) calendar days from issuance, subject to Seller's confirmation and product availability."],
  ]));
  children.push(spacer());

  children.push(chapterHeading("Chapter II - Scope & Commercial Terms"));
  children.push(make2ColTable([
    ["Item", "Description"],
    ["Commodity", d.commodity || ""],
    ["Country of Origin", d.origin || ""],
    ["Quality / Specification", d.qualitySpecs || "As per Annex 1 - Product Specifications"],
    ["Delivery Basis", d.deliveryBasis || ""],
    ["Contractual Quantity", d.quantity || ""],
  ]));
  children.push(spacer());

  children.push(chapterHeading("Chapter III - Financial & Operational Arrangements"));
  children.push(make2ColTable([
    ["Item", "Description"],
    ["Contract Price & Currency", d.price || ""],
    ["Payment Terms", d.paymentTerms || ""],
    ["Loading Window", d.loadingWindow || ""],
    ["Shipping Terms", d.shippingTerms || ""],
  ]));
  children.push(spacer());

  children.push(chapterHeading("Chapter IV - Miscellaneous & Boilerplate"));
  children.push(make2ColTable([
    ["Item", "Description"],
    ["Governing Law & Jurisdiction", d.governingLaw || ""],
    ["Application of Industry Standards", "Applicable international industry standards and ICC rules"],
  ]));
  children.push(spacer());

  children.push(makeSignatoryTable(
    d.sellerName || "",
    d.buyerName || "",
    d.sellerContact || "",
    d.buyerContact || "",
    today
  ));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  children.push(chapterHeading("ANNEX I - PRODUCT SPECIFICATION, QUALITY ADJUSTMENT & SAMPLING"));
  children.push(spacer());
  children.push(textPara(`Product: ${d.commodity || ""}`, true));
  children.push(textPara(`Grade: ${d.qualitySpecs || ""}`, false));
  children.push(spacer());
  children.push(textPara("The product supplied under this Contract shall comply with the following specifications. Guaranteed specifications represent binding commitments by the Seller. Typical specifications are provided for reference only and shall not constitute contractual guarantees."));
  children.push(spacer());

  children.push(textPara("PRODUCT SPECIFICATION", true));

  const specRows: [string, string, string, string][] = [
    ["Parameter", "Guaranteed Specification", "Typical Specification", "Rejection Limit"],
  ];

  if (d.annexSpecs) {
    const specLines = d.annexSpecs.split("\n");
    for (const line of specLines) {
      const cells = line.split("|").map(c => c.trim());
      if (cells.length >= 4) {
        specRows.push([cells[0], cells[1], cells[2], cells[3]]);
      } else if (cells.length >= 2) {
        specRows.push([cells[0], cells[1] || "", cells[2] || "", cells[3] || ""]);
      }
    }
  } else {
    const params = ["Moisture", "Ash", "Volatile Matter", "Fixed Carbon", "Sulphur", "Calorific Value", "Size Distribution"];
    for (const p of params) {
      specRows.push([p, "", "", ""]);
    }
  }

  children.push(make4ColTable(specRows));
  children.push(spacer());

  children.push(textPara("QUALITY PREMIUMS AND PENALTIES:", true));
  children.push(textPara(d.qualityPremiums || "To be agreed between Buyer and Seller."));
  children.push(spacer());

  children.push(textPara("SAMPLING PROCEDURE", true));
  children.push(textPara("Sampling shall be conducted during loading at the loading port following internationally recognized standards for sampling. Incremental samples shall be taken systematically and combined into representative composite samples. Sampling and sealing procedures shall be supervised and certified by the independent inspection company."));
  children.push(spacer());

  const agency = d.analysisAgency || "SGS, Intertek or Bureau Veritas";

  children.push(textPara("QUALITY DETERMINATION", true));
  children.push(textPara(`All quality determinations shall be performed by an internationally recognized inspection company such as ${agency} at the loading port. The inspection certificate issued at the loading port shall be final and binding for both Parties.`));
  children.push(spacer());

  children.push(textPara("SAMPLE RETENTION", true));
  children.push(textPara("One representative sealed sample shall be retained by the inspection company for ninety (90) days for reference in case of dispute."));
  children.push(spacer());

  children.push(textPara("MOISTURE DETERMINATION", true));
  children.push(textPara("Moisture content shall be determined at the loading port based on laboratory analysis of representative composite samples. The moisture value determined at the loading port shall be the contractual moisture value for the cargo. Any determination at the discharge port shall be for reference only and shall not affect commercial settlement."));
  children.push(spacer());

  children.push(textPara("QUANTITY AND WEIGHT DETERMINATION", true));
  children.push(textPara(`The quantity of the cargo shall be determined at the loading port by draft survey conducted by an independent inspection company such as ${agency}. The draft survey certificate issued at the loading port shall determine the official shipped quantity and shall be final and binding for both Parties. The quantity stated in the Bill of Lading and confirmed by the draft survey certificate shall be the contractual quantity for invoicing and settlement purposes.`));

  return children;
}

function isDealRecapContent(content: string): boolean {
  return content.includes("RECAP") && content.includes("CHAPTER I") && content.includes("ANNEX I");
}

function isTfrContent(content: string): boolean {
  return content.includes("TRANSACTION FEASIBILITY REPORT") && content.includes("OVERALL FEASIBILITY CONCLUSION");
}

function buildTfrDocx(content: string): (Paragraph | Table)[] {
  const lines = sanitizeUnicode(content).split("\n");
  const children: (Paragraph | Table)[] = [];

  let kvBuf: [string, string][] = [];
  let tblBuf: string[][] = [];

  const flushKv = () => {
    if (kvBuf.length === 0) return;
    children.push(new Table({
      rows: kvBuf.map(([label, val]) => new TableRow({
        children: [makeDocxCell(label, true, 3400), makeDocxCell(val, false, 6600)],
      })),
      width: { size: 10000, type: WidthType.DXA },
    }));
    kvBuf = [];
  };

  const flushTbl = () => {
    if (tblBuf.length === 0) return;
    children.push(new Table({
      rows: tblBuf.map((cells, idx) => new TableRow({
        children: [
          makeDocxCell(cells[0] || "", idx === 0, 6600, idx === 0 ? headerShading : undefined),
          makeDocxCell(cells[1] || "", idx === 0, 3400, idx === 0 ? headerShading : undefined),
        ],
      })),
      width: { size: 10000, type: WidthType.DXA },
    }));
    tblBuf = [];
  };

  const flushAll = () => { flushKv(); flushTbl(); };

  let titleDone = false;
  for (const raw of lines) {
    const line = raw.trim();

    if (!line) {
      flushAll();
      children.push(new Paragraph({ spacing: { before: 40, after: 40 } }));
      continue;
    }

    if (!titleDone && line === "TRANSACTION FEASIBILITY REPORT") {
      flushAll();
      titleDone = true;
      children.push(new Paragraph({
        children: [new TextRun({ text: line, bold: true, size: 30, font: "Calibri" })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 100, after: 200 },
      }));
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      flushAll();
      children.push(new Paragraph({
        children: [new TextRun({ text: line, bold: true, size: 24, font: "Calibri" })],
        spacing: { before: 300, after: 150 },
        shading: { type: ShadingType.SOLID, color: "E8E8E8", fill: "E8E8E8" },
      }));
      continue;
    }

    if (line.includes("|")) {
      flushKv();
      tblBuf.push(line.split("|").map(c => c.trim()));
      continue;
    }

    const kvMatch = line.match(/^([^:]{1,45}):\s+(.+)$/);
    if (kvMatch) {
      flushTbl();
      kvBuf.push([kvMatch[1].trim(), kvMatch[2].trim()]);
      continue;
    }

    if (line.includes("[X]") || line.includes("[ ]")) {
      flushAll();
      children.push(new Paragraph({
        children: [new TextRun({ text: line, size: 20, font: "Calibri" })],
        spacing: { before: 40, after: 40 },
      }));
      continue;
    }

    if (line.endsWith(":")) {
      flushAll();
      children.push(new Paragraph({
        children: [new TextRun({ text: line.replace(/:$/, ""), bold: true, size: 22, font: "Calibri" })],
        spacing: { before: 160, after: 60 },
      }));
      continue;
    }

    flushAll();
    children.push(new Paragraph({
      children: [new TextRun({ text: line, size: 20, font: "Calibri" })],
      spacing: { before: 40, after: 40 },
    }));
  }
  flushAll();
  return children;
}

function buildTfrPdf(doc: PDFKit.PDFDocument, content: string, leftMargin: number, pageWidth: number) {
  const lines = sanitizeUnicode(content).split("\n");

  let kvBuf: [string, string][] = [];
  let tblBuf: [string, string][] = [];

  const flushKv = () => {
    if (kvBuf.length === 0) return;
    const col1W = Math.floor(pageWidth * 0.4);
    const col2W = pageWidth - col1W;
    const padding = 5;
    for (const [label, val] of kvBuf) {
      const h1 = doc.font("Helvetica-Bold").fontSize(9).heightOfString(label, { width: col1W - padding * 2 });
      const h2 = doc.font("Helvetica").fontSize(9).heightOfString(val || " ", { width: col2W - padding * 2 });
      const rowH = Math.max(h1, h2) + padding * 2 + 2;
      pdfCheckPage(doc, rowH);
      const y = doc.y;
      doc.rect(leftMargin, y, col1W, rowH).stroke("#999999");
      doc.rect(leftMargin + col1W, y, col2W, rowH).stroke("#999999");
      doc.fillColor("#000000");
      doc.font("Helvetica-Bold").fontSize(9).text(label, leftMargin + padding, y + padding, { width: col1W - padding * 2 });
      doc.font("Helvetica").fontSize(9).text(val || "", leftMargin + col1W + padding, y + padding, { width: col2W - padding * 2 });
      doc.x = leftMargin;
      doc.y = y + rowH;
    }
    kvBuf = [];
    doc.moveDown(0.3);
  };

  const flushTbl = () => {
    if (tblBuf.length === 0) return;
    drawPdf2ColTable(doc, tblBuf, leftMargin, pageWidth);
    tblBuf = [];
    doc.x = leftMargin;
    doc.moveDown(0.3);
  };

  const flushAll = () => { flushKv(); flushTbl(); };

  let titleDone = false;
  for (const raw of lines) {
    const line = raw.trim();

    if (!line) { flushAll(); doc.moveDown(0.2); continue; }

    if (!titleDone && line === "TRANSACTION FEASIBILITY REPORT") {
      flushAll();
      titleDone = true;
      doc.font("Helvetica-Bold").fontSize(15).text(line, leftMargin, doc.y, { width: pageWidth, align: "center" });
      doc.moveDown(0.5);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      flushAll();
      pdfCheckPage(doc, 40);
      doc.moveDown(0.4);
      const y = doc.y;
      const h = doc.font("Helvetica-Bold").fontSize(12).heightOfString(line, { width: pageWidth - 8 });
      doc.rect(leftMargin, y - 2, pageWidth, h + 6).fill("#E8E8E8");
      doc.fillColor("#000000").font("Helvetica-Bold").fontSize(12).text(line, leftMargin + 4, y + 1, { width: pageWidth - 8 });
      doc.x = leftMargin;
      doc.moveDown(0.4);
      continue;
    }

    if (line.includes("|")) {
      flushKv();
      const cells = line.split("|").map(c => c.trim());
      tblBuf.push([cells[0] || "", cells[1] || ""]);
      continue;
    }

    const kvMatch = line.match(/^([^:]{1,45}):\s+(.+)$/);
    if (kvMatch) {
      flushTbl();
      kvBuf.push([kvMatch[1].trim(), kvMatch[2].trim()]);
      continue;
    }

    if (line.includes("[X]") || line.includes("[ ]")) {
      flushAll();
      doc.font("Helvetica").fontSize(9.5).text(line, leftMargin, doc.y, { width: pageWidth, lineGap: 2 });
      doc.moveDown(0.2);
      continue;
    }

    if (line.endsWith(":")) {
      flushAll();
      pdfCheckPage(doc, 24);
      doc.moveDown(0.2);
      doc.font("Helvetica-Bold").fontSize(10.5).text(line.replace(/:$/, ""), leftMargin, doc.y, { width: pageWidth });
      doc.moveDown(0.15);
      continue;
    }

    flushAll();
    doc.font("Helvetica").fontSize(9).text(line, leftMargin, doc.y, { width: pageWidth, lineGap: 2 });
    if (doc.y > 740) doc.addPage();
  }
  flushAll();
}

function isLoiContent(content: string): boolean {
  return content.includes("PURCHASE LETTER OF INTENT") && content.includes("Issued to Seller") && content.includes("Sr. No.");
}

function isNcndaContent(content: string): boolean {
  return content.includes("MUTUAL NON-CIRCUMVENTION NON-DISCLOSURE") || content.includes("NON-CIRCUMVENTION NON-DISCLOSURE AGREEMENT");
}

function isBlContent(content: string): boolean {
  return content.includes("BILL OF LADING") && content.includes("CONGENBILL");
}

interface BlData {
  shipper: string;
  consignee: string;
  notifyAddress: string;
  vessel: string;
  portOfLoading: string;
  portOfDischarge: string;
  commodityName: string;
  quantityMT: string;
  countryOfOrigin: string;
  packing: string;
  charterPartyDate: string;
  freightAdvance: string;
  loadingTimeDays: string;
  loadingTimeHours: string;
  placeOfIssue: string;
  dateOfIssue: string;
  companyOnBehalf: string;
  masterOfVessel: string;
  agentsName: string;
}

function parseBlContent(content: string): BlData {
  const sanitized = sanitizeUnicode(content);
  const lines = sanitized.split("\n");

  const lineAfterLabel = (label: string): string => {
    const idx = lines.findIndex(l => l.trim() === label);
    if (idx >= 0) {
      for (let i = idx + 1; i < lines.length; i++) {
        const t = lines[i].trim();
        if (t && !t.match(/^[=─\-]+$/)) return t;
      }
    }
    return "";
  };

  const extractAfterPrefix = (prefix: string): string => {
    const line = lines.find(l => l.trim().startsWith(prefix));
    return line ? line.trim().slice(prefix.length).trim() : "";
  };

  const vesselHeaderIdx = lines.findIndex(l => l.includes("VESSEL") && l.includes("PORT OF LOADING"));
  let vessel = "";
  let portOfLoading = "";
  if (vesselHeaderIdx >= 0 && vesselHeaderIdx + 1 < lines.length) {
    const vl = lines[vesselHeaderIdx + 1];
    vessel = vl.substring(0, 42).trim();
    portOfLoading = vl.substring(42).trim();
  }

  const loadingTimeLine = lines.find(l => l.includes(" days ") && l.includes(" hours") && !l.includes("used"));
  const daysMatch = loadingTimeLine?.match(/(\S+)\s+days/);
  const hoursMatch = loadingTimeLine?.match(/(\S+)\s+hours/);

  const placeIdx = lines.findIndex(l => l.trim() === "PLACE AND DATE OF ISSUE");
  let placeOfIssue = "";
  let dateOfIssue = "";
  if (placeIdx >= 0) {
    for (let i = placeIdx + 1; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t && !t.match(/^[─=\-]+$/)) {
        if (t.includes(" DATED ")) {
          const parts = t.split(" DATED ");
          placeOfIssue = parts[0].trim();
          dateOfIssue = parts[1]?.trim() || "";
        }
        break;
      }
    }
  }

  const agentsIdx = lines.findIndex(l => l.trim() === "AS AGENTS ONLY");
  const agentsRaw = agentsIdx > 0 ? lines[agentsIdx - 1].trim() : "";
  const agentsName = agentsRaw.startsWith("FOR ") ? agentsRaw.slice(4).trim() : agentsRaw;

  return {
    shipper: lineAfterLabel("SHIPPER"),
    consignee: lineAfterLabel("CONSIGNEE"),
    notifyAddress: lineAfterLabel("NOTIFY ADDRESS"),
    vessel,
    portOfLoading,
    portOfDischarge: lineAfterLabel("PORT OF DISCHARGE"),
    commodityName: extractAfterPrefix("NAME OF COMMODITY:"),
    quantityMT: (() => {
      const l = lines.find(l => l.trim().endsWith("METRIC TONS") && !l.includes("NUMBER OF"));
      return l ? l.trim().replace("METRIC TONS", "").trim() : "";
    })(),
    countryOfOrigin: extractAfterPrefix("COUNTRY OF ORIGIN:"),
    packing: extractAfterPrefix("PACKING:"),
    charterPartyDate: extractAfterPrefix("FREIGHT AS PER CHARTER PARTY DATED "),
    freightAdvance: extractAfterPrefix("Received on account of freight:"),
    loadingTimeDays: daysMatch?.[1] || "___",
    loadingTimeHours: hoursMatch?.[1] || "___",
    placeOfIssue,
    dateOfIssue,
    companyOnBehalf: extractAfterPrefix("FOR AND ON BEHALF OF "),
    masterOfVessel: extractAfterPrefix("MASTER OF "),
    agentsName,
  };
}

const BL_CLAUSES = [
  {
    num: "1.", title: "Terms and Conditions of Charter Party",
    paras: ["All terms and conditions, liberties and exceptions of the Charter Party dated as overleaf, including the Law and Arbitration Clauses, are herewith incorporated."],
  },
  {
    num: "2.", title: "General Paramount Clause",
    paras: [
      "(a)  The Hague Rules contained in the International Convention for the Unification of certain rules relating to Bills of Lading, dated Brussels the 25th August 1924 as enacted in the country of shipment, shall apply to this Bill of Lading. When no such enactment is in force in the country of shipment, the corresponding legislation of the country of destination shall apply, but in respect of shipments to which no such enactments are compulsorily applicable, the terms of the said Convention shall apply.",
      "(b)  Trades where Hague-Visby Rules apply. In trades where the International Brussels Convention 1924 as amended by the Protocol signed at Brussels on February 23rd 1968 — the Hague Visby Rules — apply compulsorily, the provisions of the respective legislation shall apply to this Bill of Lading.",
      "(c)  The Carrier shall in no case be responsible for loss or damage to the cargo, howsoever arising prior to loading into and after discharge from the vessel or while the cargo is in the charge of another Carrier, or in respect of deck cargo or live animals.",
    ],
  },
  {
    num: "3.", title: "General Average",
    paras: ["General Average shall be adjusted, stated and settled according to York-Antwerp Rules 1994, or any subsequent modification thereof, in London unless another place is agreed in the Charter Party. Cargo's contribution to General Average shall be paid to the Carrier even when such average is the result of a fault, neglect or error of the Master, Pilot or Crew. The Charterers, Shippers and Consignees expressly renounce the Belgian Commercial Code Part II, Art. 148."],
  },
  {
    num: "4.", title: "New Jason Clause",
    paras: ["In the event of accident, danger, damage or disaster before or after the commencement of the voyage, resulting from any cause whatsoever, whether due to negligence or not, for which, or for the consequence of which, the Carrier is not responsible, by statute, contract or otherwise, the cargo, Shippers, consignees or the owners of the cargo shall contribute with the Carrier in General Average to the payment of any sacrifices, losses or expenses of a General Average nature that may be made or incurred and shall pay salvage and special charges incurred in respect of the cargo. If a salving vessel is owned or operated by the Carrier, salvage shall be paid for as fully as if the said salving vessel or vessels belonged to strangers. Such deposit as the Carrier, or his agents, may deem sufficient to cover the estimated contribution of the goods and any salvage and special charges thereon shall, if required, be made by the cargo Shippers, Consignees or owners of the goods to the Carrier before delivery."],
  },
  {
    num: "5.", title: "Both-to-Blame Collision Clause",
    paras: [
      "If the Vessel comes into collision with another vessel as a result of the negligence of the other vessel and any act, neglect or default of the Master, Mariner, Pilot or the servants of the Carrier in the navigation or in the management of the Vessel, the owners of the cargo carried hereunder will indemnify the Carrier against all loss or liability to the other or non-carrying vessel or her owners in so far as such loss or liability represents loss of, or damage to, or any claim whatsoever of the owners of said cargo, paid or payable by the other or non-carrying ship or her Owners to the owners of said cargo and set-off, recouped or recovered by the other or non-carrying vessel or her Owners as part of their claim against the carrying Vessel or the Carrier.",
      "The foregoing provisions shall also apply where the owners, operators or those in charge of any vessel or vessels or objects other than, or in addition to, the colliding vessels, or objects are at fault in respect of a collision or contact.",
    ],
  },
];

function buildBlDocx(content: string): (Paragraph | Table)[] {
  const bl = parseBlContent(content);
  const children: (Paragraph | Table)[] = [];

  const S = { style: BorderStyle.SINGLE as const, size: 4, color: "000000" };
  const BB = { top: S, bottom: S, left: S, right: S };

  const lbl = (t: string) => new Paragraph({ children: [new TextRun({ text: t, size: 14, font: "Arial", color: "444444" })], spacing: { before: 30, after: 10 } });
  const val = (t: string, bold = false, sz = 18) => new Paragraph({ children: [new TextRun({ text: t || " ", bold, size: sz, font: "Arial" })], spacing: { before: 10, after: 30 } });
  const sp = (n = 60) => new Paragraph({ children: [new TextRun({ text: " ", size: 12 })], spacing: { before: 0, after: n } });

  // ── Column widths (total 9360 DXA = A4 with 0.5-inch margins) ──
  const CA = 3640; // vessel col
  const CB = 2780; // port-of-loading col
  const CC = 2940; // B/L title col  (CA+CB+CC = 9360)
  const TW = CA + CB + CC;

  // Helper: cell with blBorder spanning 2 cols (CA+CB)
  const leftCell = (paras: Paragraph[]): TableCell =>
    new TableCell({ children: paras, borders: BB, columnSpan: 2, width: { size: CA + CB, type: WidthType.DXA }, verticalAlign: VerticalAlign.TOP });

  // Helper: right title cell (vertically merged RESTART)
  const titleCellStart = (): TableCell => new TableCell({
    children: [
      sp(40),
      new Paragraph({ children: [new TextRun({ text: "B/L No. 01", bold: true, size: 18, font: "Arial" })], alignment: AlignmentType.CENTER, spacing: { before: 20, after: 30 } }),
      new Paragraph({ children: [new TextRun({ text: "BILL OF LADING", bold: true, size: 36, font: "Arial" })], alignment: AlignmentType.CENTER, spacing: { before: 20, after: 30 } }),
      new Paragraph({ children: [new TextRun({ text: "TO BE USED WITH CHARTER-PARTIES", size: 15, font: "Arial" })], alignment: AlignmentType.CENTER, spacing: { before: 10, after: 30 } }),
      sp(20),
      new Paragraph({ children: [new TextRun({ text: 'CODE NAME: "CONGENBILL"', bold: true, size: 17, font: "Arial" })], alignment: AlignmentType.CENTER, spacing: { before: 10, after: 16 } }),
      new Paragraph({ children: [new TextRun({ text: "EDITION 1994", bold: true, size: 17, font: "Arial" })], alignment: AlignmentType.CENTER, spacing: { after: 16 } }),
      new Paragraph({ children: [new TextRun({ text: "ADOPTED BY THE BALTIC AND", size: 13, font: "Arial" })], alignment: AlignmentType.CENTER, spacing: { after: 8 } }),
      new Paragraph({ children: [new TextRun({ text: "INTERNATIONAL MARITIME COUNCIL (BIMCO)", size: 13, font: "Arial" })], alignment: AlignmentType.CENTER, spacing: { after: 40 } }),
    ],
    borders: BB,
    width: { size: CC, type: WidthType.DXA },
    verticalMerge: VerticalMergeType.RESTART,
    verticalAlign: VerticalAlign.TOP,
  });

  const titleCellCont = (): TableCell => new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: "" })] })],
    borders: BB,
    width: { size: CC, type: WidthType.DXA },
    verticalMerge: VerticalMergeType.CONTINUE,
  });

  // ── TOP SECTION (3-col table, right col vertically merged) ──
  children.push(new Table({
    width: { size: TW, type: WidthType.DXA },
    rows: [
      // Row 1 — Shipper + B/L title (RESTART)
      new TableRow({ children: [leftCell([lbl("Shipper"), val(bl.shipper), sp(60), sp(60)]), titleCellStart()] }),
      // Row 2 — Consignee + CONTINUE
      new TableRow({ children: [leftCell([lbl("Consignee"), val(bl.consignee), sp(60), sp(60)]), titleCellCont()] }),
      // Row 3 — Notify address + CONTINUE
      new TableRow({ children: [leftCell([lbl("Notify address"), val(bl.notifyAddress), sp(40)]), titleCellCont()] }),
      // Row 4 — Vessel | Port of Loading + CONTINUE
      new TableRow({
        children: [
          new TableCell({ children: [lbl("Vessel"), val(bl.vessel), sp(40)], borders: BB, width: { size: CA, type: WidthType.DXA }, verticalAlign: VerticalAlign.TOP }),
          new TableCell({ children: [lbl("Port of Loading"), val(bl.portOfLoading), sp(40)], borders: BB, width: { size: CB, type: WidthType.DXA }, verticalAlign: VerticalAlign.TOP }),
          titleCellCont(),
        ],
      }),
      // Row 5 — Port of discharge + CONTINUE
      new TableRow({ children: [leftCell([lbl("Port of discharge"), val(bl.portOfDischarge), sp(20)]), titleCellCont()] }),
    ],
  }));

  // ── DESCRIPTION OF GOODS ──
  const descCell = new TableCell({
    children: [
      lbl("Description of goods"),
      sp(20),
      val(`NAME OF COMMODITY: ${bl.commodityName || "_______________"}`),
      val(`${bl.quantityMT || "_______________"} METRIC TONS`),
      val(`COUNTRY OF ORIGIN: ${bl.countryOfOrigin || "_______________"}`),
      val(`PACKING: ${bl.packing || "_______________"}`),
      sp(30),
      new Paragraph({ children: [new TextRun({ text: "\u2018CLEAN ON BOARD\u2019", bold: true, size: 17, font: "Arial" })], alignment: AlignmentType.CENTER, spacing: { before: 30, after: 16 } }),
      new Paragraph({ children: [new TextRun({ text: "\u2018FREIGHT PAYABLE AS PER CHARTER PARTY\u2019", bold: true, size: 17, font: "Arial" })], alignment: AlignmentType.CENTER, spacing: { after: 30 } }),
      new Paragraph({ children: [new TextRun({ text: "(of which NIL on deck at Shipper\u2019s risk; the Carrier not being responsible for loss or damage howsoever arising)", size: 14, font: "Arial", italics: true })], alignment: AlignmentType.CENTER, spacing: { after: 50 } }),
    ],
    borders: BB,
    width: { size: TW, type: WidthType.DXA },
  });
  children.push(new Table({
    width: { size: TW, type: WidthType.DXA },
    rows: [new TableRow({ children: [descCell] })],
  }));

  // ── CHARTER PARTY | SHIPPED STATEMENT ──
  const shipped = "SHIPPED at the Port of Loading in apparent good order and condition on board the Vessel for carriage to the Port of Discharge or so near thereto as she may safely get the goods specified above. Weight, measure, quality, quantity, condition, contents and value unknown.";
  const witness = "IN WITNESS whereof the Master or Agent of the said Vessel has signed the number of Bills of Lading indicated below all this tenor and date, any one of which being accomplished the others shall be void.";
  const CL = Math.round(TW * 0.4), CR = TW - CL;
  children.push(new Table({
    width: { size: TW, type: WidthType.DXA },
    rows: [new TableRow({ children: [
      new TableCell({
        children: [
          lbl("Freight payable as per"),
          val(`CHARTER PARTY DATED ${bl.charterPartyDate || "_______________"}`),
          sp(30),
          new Paragraph({ children: [new TextRun({ text: "FREIGHT ADVANCE", bold: true, size: 15, font: "Arial" })], spacing: { before: 30, after: 8 } }),
          new Paragraph({ children: [new TextRun({ text: `Received on account of freight: ${bl.freightAdvance || "_______________"}`, size: 16, font: "Arial" })], spacing: { before: 8, after: 30 } }),
          new Paragraph({ children: [new TextRun({ text: "\u2500".repeat(24), size: 10, color: "888888" })], spacing: { before: 10, after: 16 } }),
          new Paragraph({ children: [new TextRun({ text: `Time used for loading  ${bl.loadingTimeDays || "___"} days   ${bl.loadingTimeHours || "___"} hours`, size: 16, font: "Arial" })], spacing: { before: 8, after: 40 } }),
        ],
        borders: BB, width: { size: CL, type: WidthType.DXA }, verticalAlign: VerticalAlign.TOP,
      }),
      new TableCell({
        children: [
          new Paragraph({ children: [new TextRun({ text: shipped, size: 14, font: "Arial" })], spacing: { before: 30, after: 30 } }),
          new Paragraph({ children: [new TextRun({ text: witness, size: 14, font: "Arial" })], spacing: { before: 30, after: 30 } }),
          new Paragraph({ children: [new TextRun({ text: "FOR CONDITIONS OF CARRIAGE SEE OVERLEAF", bold: true, size: 14, font: "Arial" })], alignment: AlignmentType.CENTER, spacing: { before: 40, after: 30 } }),
        ],
        borders: BB, width: { size: CR, type: WidthType.DXA }, verticalAlign: VerticalAlign.TOP,
      }),
    ]})],
  }));

  // ── FREIGHT PAYABLE / THREE(3) | PLACE/DATE/SIGNATURE ──
  const BL = Math.round(TW * 0.33), BR = TW - BL;
  children.push(new Table({
    width: { size: TW, type: WidthType.DXA },
    rows: [new TableRow({ children: [
      new TableCell({
        children: [
          lbl("Freight payable at"),
          sp(30), sp(30),
          lbl("Number of original B/Ls"),
          new Paragraph({ children: [new TextRun({ text: "THREE (3)", bold: true, size: 32, font: "Arial" })], alignment: AlignmentType.CENTER, spacing: { before: 50, after: 60 } }),
        ],
        borders: BB, width: { size: BL, type: WidthType.DXA }, verticalAlign: VerticalAlign.TOP,
      }),
      new TableCell({
        children: [
          lbl("Place and date of issue"),
          val(`${bl.placeOfIssue || "_______________"}   DATED   ${bl.dateOfIssue || "_______________"}`),
          sp(16),
          lbl("Signature"),
          new Paragraph({ children: [new TextRun({ text: "\u2500".repeat(50), size: 14, color: "777777" })], spacing: { before: 14, after: 36 } }),
          sp(10),
          new Paragraph({ children: [new TextRun({ text: `FOR AND ON BEHALF OF  ${bl.companyOnBehalf || "_______________"}`, bold: true, size: 16, font: "Arial" })], spacing: { before: 16, after: 8 } }),
          new Paragraph({ children: [new TextRun({ text: `MASTER OF  ${bl.masterOfVessel || "_______________"}`, size: 16, font: "Arial" })], spacing: { before: 8, after: 30 } }),
          sp(10),
          new Paragraph({ children: [new TextRun({ text: `FOR  ${bl.agentsName || "_______________"}`, size: 16, font: "Arial" })], spacing: { before: 14, after: 8 } }),
          new Paragraph({ children: [new TextRun({ text: "AS AGENTS ONLY", size: 16, font: "Arial" })], spacing: { before: 8, after: 40 } }),
        ],
        borders: BB, width: { size: BR, type: WidthType.DXA }, verticalAlign: VerticalAlign.TOP,
      }),
    ]})],
  }));

  // ── PAGE BREAK ──
  children.push(new Paragraph({ children: [new PageBreak()], spacing: { before: 0, after: 0 } }));

  // ── CONDITIONS OF CARRIAGE — PAGE 2 ──
  children.push(new Paragraph({ children: [new TextRun({ text: "CONDITIONS OF CARRIAGE", bold: true, size: 28, font: "Arial" })], alignment: AlignmentType.CENTER, spacing: { before: 200, after: 80 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" } } }));
  children.push(new Paragraph({ children: [new TextRun({ text: 'BILL OF LADING  \u2022  CODE NAME: "CONGENBILL"  \u2022  EDITION 1994', size: 16, font: "Arial", italics: true })], alignment: AlignmentType.CENTER, spacing: { before: 80, after: 200 } }));
  for (const clause of BL_CLAUSES) {
    children.push(new Paragraph({ children: [new TextRun({ text: `${clause.num}  `, bold: true, size: 20, font: "Arial" }), new TextRun({ text: clause.title, bold: true, size: 20, font: "Arial" })], spacing: { before: 200, after: 80 } }));
    for (const para of clause.paras) {
      children.push(new Paragraph({ children: [new TextRun({ text: para, size: 17, font: "Arial" })], spacing: { before: 40, after: 80 }, indent: { left: 240 } }));
    }
  }
  return children;
}

function buildBlPdf(doc: PDFKit.PDFDocument, content: string, leftMargin: number, pageWidth: number) {
  const bl = parseBlContent(content);
  const x = leftMargin;
  const W = pageWidth;

  // Draw a filled white box with black border
  const box = (bx: number, by: number, bw: number, bh: number) => {
    doc.rect(bx, by, bw, bh).lineWidth(0.5).fillAndStroke("#FFFFFF", "#000000");
  };
  const fieldBox = (bx: number, by: number, bw: number, bh: number, label: string, value: string) => {
    box(bx, by, bw, bh);
    doc.font("Helvetica").fontSize(6.5).fillColor("#444444").text(label, bx + 3, by + 3, { width: bw - 6, lineBreak: false });
    if (value) doc.font("Helvetica").fontSize(9).fillColor("#000000").text(value, bx + 3, by + 13, { width: bw - 6, lineBreak: false });
  };

  // ── TOP SECTION ──
  // Left column (65%): stacked field boxes
  // Right column (35%): B/L title spanning same height
  const leftW = Math.floor(W * 0.65);
  const rightW = W - leftW;

  const shipperH = 58;
  const consigneeH = 58;
  const notifyH = 48;
  const vesselRowH = 42;
  const podH = 36;
  const topH = shipperH + consigneeH + notifyH + vesselRowH + podH; // total left height

  let y = doc.y;

  // Right: B/L title box (spans full topH height)
  box(x + leftW, y, rightW, topH);
  const rx = x + leftW + 4, rw = rightW - 8;
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000").text("B/L No. 01", rx, y + 8, { width: rw, align: "center", lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(16).text("BILL OF LADING", rx, y + 24, { width: rw, align: "center", lineBreak: false });
  doc.font("Helvetica").fontSize(7.5).text("TO BE USED WITH CHARTER-PARTIES", rx, y + 48, { width: rw, align: "center", lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(8).text('CODE NAME: "CONGENBILL"', rx, y + 65, { width: rw, align: "center", lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(8).text("EDITION 1994", rx, y + 78, { width: rw, align: "center", lineBreak: false });
  doc.font("Helvetica").fontSize(6.5).text("ADOPTED BY THE BALTIC AND", rx, y + 95, { width: rw, align: "center", lineBreak: false });
  doc.font("Helvetica").fontSize(6.5).text("INTERNATIONAL MARITIME COUNCIL (BIMCO)", rx, y + 105, { width: rw, align: "center", lineBreak: false });

  // Left: stacked boxes
  fieldBox(x, y, leftW, shipperH, "Shipper", bl.shipper);
  y += shipperH;
  fieldBox(x, y, leftW, consigneeH, "Consignee", bl.consignee);
  y += consigneeH;
  fieldBox(x, y, leftW, notifyH, "Notify address", bl.notifyAddress);
  y += notifyH;

  const vesselW = Math.floor(leftW * 0.56);
  const polW = leftW - vesselW;
  fieldBox(x, y, vesselW, vesselRowH, "Vessel", bl.vessel);
  fieldBox(x + vesselW, y, polW, vesselRowH, "Port of Loading", bl.portOfLoading);
  y += vesselRowH;

  fieldBox(x, y, leftW, podH, "Port of discharge", bl.portOfDischarge);
  y += podH; // y is now aligned with bottom of right column too

  // ── DESCRIPTION OF GOODS ──
  const dH = 118;
  box(x, y, W, dH);
  doc.font("Helvetica").fontSize(6.5).fillColor("#444444").text("Description of goods", x + 3, y + 3, { width: W - 6, lineBreak: false });
  doc.font("Helvetica").fontSize(8).fillColor("#000000").text(`NAME OF COMMODITY: ${bl.commodityName || "_______________"}`, x + 3, y + 14, { width: W - 6, lineBreak: false });
  doc.font("Helvetica").fontSize(8).text(`${bl.quantityMT || "_______________"} METRIC TONS`, x + 3, y + 24, { width: W - 6, lineBreak: false });
  doc.font("Helvetica").fontSize(8).text(`COUNTRY OF ORIGIN: ${bl.countryOfOrigin || "_______________"}`, x + 3, y + 34, { width: W - 6, lineBreak: false });
  doc.font("Helvetica").fontSize(8).text(`PACKING: ${bl.packing || "_______________"}`, x + 3, y + 44, { width: W - 6, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(8.5).text("\u2018CLEAN ON BOARD\u2019", x + 3, y + 58, { width: W - 6, align: "center", lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(8.5).text("\u2018FREIGHT PAYABLE AS PER CHARTER PARTY\u2019", x + 3, y + 70, { width: W - 6, align: "center", lineBreak: false });
  doc.font("Helvetica-Oblique").fontSize(6.5).fillColor("#333333").text("(of which NIL on deck at Shipper\u2019s risk; the Carrier not being responsible for loss or damage howsoever arising)", x + 3, y + 84, { width: W - 6, align: "center" });
  y += dH;

  // ── CHARTER PARTY | SHIPPED STATEMENT ──
  const mH = 100;
  const mLW = Math.floor(W * 0.38);
  const mRW = W - mLW;
  box(x, y, mLW, mH);
  box(x + mLW, y, mRW, mH);

  doc.font("Helvetica").fontSize(6.5).fillColor("#444444").text("Freight payable as per", x + 3, y + 3, { width: mLW - 6, lineBreak: false });
  doc.font("Helvetica").fontSize(8).fillColor("#000000").text(`CHARTER PARTY DATED ${bl.charterPartyDate || "_______________"}`, x + 3, y + 12, { width: mLW - 6, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(7).text("FREIGHT ADVANCE", x + 3, y + 29, { width: mLW - 6, lineBreak: false });
  doc.font("Helvetica").fontSize(7).text(`Received on account of freight: ${bl.freightAdvance || "_______________"}`, x + 3, y + 38, { width: mLW - 6 });
  doc.moveTo(x + 3, y + 56).lineTo(x + mLW - 3, y + 56).lineWidth(0.3).stroke("#888888");
  doc.font("Helvetica").fontSize(7).fillColor("#000000").text(`Time used for loading  ${bl.loadingTimeDays || "___"} days   ${bl.loadingTimeHours || "___"} hours`, x + 3, y + 60, { width: mLW - 6 });

  const combined = "SHIPPED at the Port of Loading in apparent good order and condition on board the Vessel for carriage to the Port of Discharge or so near thereto as she may safely get the goods specified above. Weight, measure, quality, quantity, condition, contents and value unknown. IN WITNESS whereof the Master or Agent of the said Vessel has signed the number of Bills of Lading indicated below all this tenor and date, any one of which being accomplished the others shall be void.";
  doc.font("Helvetica").fontSize(7).fillColor("#000000").text(combined, x + mLW + 3, y + 4, { width: mRW - 6, align: "justify", lineGap: 1.2 });
  doc.font("Helvetica-Bold").fontSize(7).text("FOR CONDITIONS OF CARRIAGE SEE OVERLEAF", x + mLW + 3, y + mH - 12, { width: mRW - 6, align: "center", lineBreak: false });
  y += mH;

  // ── THREE (3) | PLACE/DATE/SIGNATURE ──
  const bH = 108;
  const bLW = Math.floor(W * 0.32);
  const bRW = W - bLW;
  box(x, y, bLW, bH);
  box(x + bLW, y, bRW, bH);

  doc.font("Helvetica").fontSize(6.5).fillColor("#444444").text("Freight payable at", x + 3, y + 3, { width: bLW - 6, lineBreak: false });
  doc.font("Helvetica").fontSize(6.5).text("Number of original B/Ls", x + 3, y + 46, { width: bLW - 6, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#000000").text("THREE (3)", x + 3, y + 57, { width: bLW - 6, align: "center", lineBreak: false });

  doc.font("Helvetica").fontSize(6.5).fillColor("#444444").text("Place and date of issue", x + bLW + 3, y + 3, { width: bRW - 6, lineBreak: false });
  doc.font("Helvetica").fontSize(8).fillColor("#000000").text(`${bl.placeOfIssue || "_______________"}  DATED  ${bl.dateOfIssue || "_______________"}`, x + bLW + 3, y + 13, { width: bRW - 6, lineBreak: false });
  doc.font("Helvetica").fontSize(6.5).fillColor("#444444").text("Signature", x + bLW + 3, y + 29, { width: bRW - 6, lineBreak: false });
  doc.moveTo(x + bLW + 3, y + 40).lineTo(x + W - 3, y + 40).lineWidth(0.3).stroke("#888888");
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#000000").text(`FOR AND ON BEHALF OF  ${bl.companyOnBehalf || "_______________"}`, x + bLW + 3, y + 52, { width: bRW - 6 });
  doc.font("Helvetica").fontSize(8).text(`MASTER OF  ${bl.masterOfVessel || "_______________"}`, x + bLW + 3, y + 65, { width: bRW - 6, lineBreak: false });
  doc.font("Helvetica").fontSize(8).text(`FOR  ${bl.agentsName || "_______________"}`, x + bLW + 3, y + 82, { width: bRW - 6, lineBreak: false });
  doc.font("Helvetica").fontSize(8).text("AS AGENTS ONLY", x + bLW + 3, y + 94, { width: bRW - 6, lineBreak: false });
  y += bH;
  doc.y = y;

  // ── PAGE 2: CONDITIONS OF CARRIAGE ──
  doc.addPage();
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#000000").text("CONDITIONS OF CARRIAGE", leftMargin, doc.y, { width: pageWidth, align: "center" });
  doc.moveDown(0.2);
  doc.moveTo(leftMargin, doc.y).lineTo(leftMargin + pageWidth, doc.y).lineWidth(1).stroke("#000000");
  doc.moveDown(0.5);
  doc.font("Helvetica-Oblique").fontSize(8).text('BILL OF LADING  \u2022  CODE NAME: "CONGENBILL"  \u2022  EDITION 1994', leftMargin, doc.y, { width: pageWidth, align: "center" });
  doc.moveDown(1);
  for (const clause of BL_CLAUSES) {
    if (doc.y > 700) doc.addPage();
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000").text(`${clause.num}  ${clause.title}`, leftMargin, doc.y, { width: pageWidth });
    doc.moveDown(0.4);
    for (const para of clause.paras) {
      doc.font("Helvetica").fontSize(8).text(para, leftMargin + 12, doc.y, { width: pageWidth - 12, align: "justify", lineGap: 1.5 });
      doc.moveDown(0.5);
    }
    doc.moveDown(0.5);
  }
}

function isCooContent(content: string): boolean {
  return content.trimStart().startsWith("CERTIFICATE OF ORIGIN") && content.includes("CERTIFICATION");
}

function isCoaContent(content: string): boolean {
  return content.trimStart().startsWith("CERTIFICATE OF QUALITY") && content.includes("SAMPLING PROCEDURE");
}

interface CoaData {
  certNo: string;
  date: string;
  commodity: string;
  quantity: string;
  origin: string;
  packing: string;
  vessel: string;
  portOfLoading: string;
  portOfDischarge: string;
  blDate: string;
  inspFrom: string;
  inspTo: string;
  loadStart: string;
  loadEnd: string;
  chemSpecs: string;
  moisture: string;
  physSizes: string;
  agency: string;
}

function parseCoaContent(content: string): CoaData {
  const lines = content.split("\n");

  const extractColon = (label: string): string => {
    const line = lines.find(l => l.trimStart().startsWith(label));
    if (!line) return "_______________";
    const idx = line.indexOf(":");
    return idx >= 0 ? line.substring(idx + 1).trim() : "";
  };

  const certNoLine = lines.find(l => l.startsWith("REF:  Certificate No. "));
  const certNo = certNoLine ? certNoLine.replace("REF:  Certificate No. ", "").trim() : "";

  const dateLine = lines.find(l => l.startsWith("DATE:  "));
  const date = dateLine ? dateLine.replace("DATE:  ", "").trim() : "";

  const commodity = extractColon("NAME OF COMMODITY");
  const quantityRaw = extractColon("QUANTITY");
  const quantity = quantityRaw.replace(" METRIC TONS", "").trim();
  const origin = extractColon("COUNTRY OF ORIGIN");
  const packing = extractColon("PACKING");
  const vessel = extractColon("NAME OF THE CARRYING VESSEL");
  const portOfLoading = extractColon("PORT OF LOADING");
  const portOfDischarge = extractColon("PORT OF DISCHARGE");
  const blRaw = extractColon("B/L NO. & DATE");
  const blDate = blRaw.replace(/^01 & DATED\s*/i, "").trim();

  const narrativeLine = lines.find(l => l.includes("during the period"));
  let inspFrom = "_______________", inspTo = "_______________";
  if (narrativeLine) {
    const m = narrativeLine.match(/during the period (.+?) to (.+?) for the/);
    if (m) { inspFrom = m[1].trim(); inspTo = m[2].trim(); }
  }

  const loadStartLine = lines.find(l => l.includes("Cargo loading commenced on"));
  const loadStart = loadStartLine ? loadStartLine.split("Cargo loading commenced on")[1].trim() : "_______________";
  const loadEndLine = lines.find(l => l.includes("Cargo loading completed on"));
  const loadEnd = loadEndLine ? loadEndLine.split("Cargo loading completed on")[1].trim() : "_______________";

  const percentIdx = lines.findIndex(l => l.includes("(Percentage by weight)"));
  const moistureIdx = lines.findIndex(l => l.includes("THE ACTUAL RESULT OF THE TEST FOR FREE MOISTURE"));
  let chemSpecs = "";
  if (percentIdx >= 0 && moistureIdx > percentIdx) {
    chemSpecs = lines.slice(percentIdx + 1, moistureIdx).filter(l => l.trim()).join("\n");
  }

  const centiLine = lines.find(l => l.includes("CENTIGRADE           :"));
  let moisture = "_______________";
  if (centiLine) {
    const m = centiLine.match(/:\s+(.+?)\s+PCT/);
    if (m) moisture = m[1].trim();
  }

  const sizeIdx = lines.findIndex(l => l.trim() === "SIZE :");
  const reflectsIdx = lines.findIndex(l => l.includes("This Certificate reflects"));
  let physSizes = "";
  if (sizeIdx >= 0 && reflectsIdx > sizeIdx) {
    physSizes = lines.slice(sizeIdx + 1, reflectsIdx).filter(l => l.trim()).join("\n");
  }

  const forLine = lines.find(l => l.startsWith("FOR ") && !l.includes("future reference"));
  const agency = forLine ? forLine.replace("FOR ", "").trim() : "_______________";

  return { certNo, date, commodity, quantity, origin, packing, vessel, portOfLoading, portOfDischarge, blDate, inspFrom, inspTo, loadStart, loadEnd, chemSpecs, moisture, physSizes, agency };
}

function buildCoaDocx(content: string): (Paragraph | Table)[] {
  const coa = parseCoaContent(content);
  const ch: (Paragraph | Table)[] = [];
  const mono = "Courier New";
  const fs = 18;
  const p = (text: string, opts: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; spaceBefore?: number; spaceAfter?: number; pageBreak?: boolean } = {}) =>
    new Paragraph({
      children: [new TextRun({ text, bold: opts.bold || false, size: opts.size || fs, font: mono })],
      alignment: opts.align,
      pageBreakBefore: opts.pageBreak,
      spacing: { before: opts.spaceBefore || 0, after: opts.spaceAfter || 60 },
    });

  ch.push(p("CERTIFICATE OF QUALITY", { bold: true, size: 26, align: AlignmentType.CENTER, spaceAfter: 80 }));
  ch.push(p("'TO WHOM IT MAY CONCERN'", { bold: true, size: 22, align: AlignmentType.CENTER, spaceAfter: 160 }));

  ch.push(new Paragraph({ children: [new TextRun({ text: "PAGE 1 OF 2", size: fs, font: mono })], alignment: AlignmentType.RIGHT, spacing: { after: 40 } }));
  ch.push(p(`REF:  Certificate No. ${coa.certNo}`));
  ch.push(p(`DATE:  ${coa.date}`, { spaceAfter: 160 }));

  ch.push(p("DESCRIPTION OF GOODS", { bold: true, spaceAfter: 120 }));

  const descRows: [string, string][] = [
    ["NAME OF COMMODITY", coa.commodity],
    ["QUANTITY", `${coa.quantity} METRIC TONS`],
    ["COUNTRY OF ORIGIN", coa.origin],
    ["PACKING", coa.packing],
    ["NAME OF THE CARRYING VESSEL", coa.vessel],
    ["PORT OF LOADING", coa.portOfLoading],
    ["PORT OF DISCHARGE", coa.portOfDischarge],
    ["B/L NO. & DATE", `01 & DATED ${coa.blDate}`],
  ];
  for (const [label, val] of descRows) {
    ch.push(new Paragraph({
      children: [
        new TextRun({ text: label.padEnd(34), size: fs, font: mono }),
        new TextRun({ text: ":     ", size: fs, font: mono }),
        new TextRun({ text: val, bold: true, size: fs, font: mono }),
      ],
      spacing: { before: 40, after: 80 },
    }));
  }

  ch.push(p("=".repeat(73), { spaceBefore: 120, spaceAfter: 120 }));

  ch.push(p(`In accordance with the instructions received from the shipper, we attended at, ${coa.portOfLoading} during the period ${coa.inspFrom} to ${coa.inspTo} for the purpose of drawing representative samples of the consignment of ${coa.commodity} while the cargo was being loaded on board the vessel ${coa.vessel} at ${coa.portOfLoading}. We certify as under:`, { spaceAfter: 120 }));

  ch.push(new Paragraph({
    children: [
      new TextRun({ text: `AT ${coa.portOfLoading}       :     Cargo loading commenced on  ${coa.loadStart}`, size: fs, font: mono }),
    ],
    spacing: { before: 60, after: 40 },
  }));
  ch.push(new Paragraph({
    children: [
      new TextRun({ text: `${"".padEnd(34 + coa.portOfLoading.length)}Cargo loading completed on  ${coa.loadEnd}`, size: fs, font: mono }),
    ],
    spacing: { before: 0, after: 160 },
  }));

  ch.push(p("SAMPLING PROCEDURE", { bold: true, spaceAfter: 100 }));
  ch.push(p(`Systematic mass based sampling carried out in accordance with BIS 1405 throughout course of loading. Sublotwise gross sample was constituted by collecting requisite number of sample increments while loading the cargo into the vessel at ${coa.portOfLoading}. Individual, Sublotwise gross samples were subject to size analysis and further processed to obtain for moisture determination and chemical analysis.`, { spaceAfter: 120 }));
  ch.push(p("Sub-lot wise samples drawn as above mixed together to prepare composite sample representing the entire shipment.", { spaceAfter: 400 }));

  // ── PAGE 2 ──
  ch.push(new Paragraph({ children: [new TextRun({ text: "PAGE 2 OF 2", size: fs, font: mono })], pageBreakBefore: true, alignment: AlignmentType.RIGHT, spacing: { after: 40 } }));
  ch.push(p(`REF:  Certificate No. ${coa.certNo}`));
  ch.push(p(`DATE:  ${coa.date}`, { spaceAfter: 160 }));

  ch.push(p(`Composite sample representing the shipment at ${coa.portOfLoading} was divided into 3 parts and sealed with our monogram. After retaining 2 parts for future reference, one part tested in our lab with the following results.`, { spaceAfter: 120 }));
  ch.push(p("The analysis as per IS 1493 for the specifications computed for the cargo shipped are as under:", { spaceAfter: 160 }));

  ch.push(p("SPECIFICATIONS:", { bold: true, spaceAfter: 40 }));
  ch.push(p("THE ACTUAL RESULT OF THE TEST FOR CHEMICAL COMPOSITIONS (ON DRY BASIS)", { spaceAfter: 40 }));
  ch.push(p("        (Percentage by weight)", { spaceAfter: 120 }));

  for (const line of (coa.chemSpecs || "").split("\n")) {
    if (line.trim()) ch.push(p(line, { spaceAfter: 40 }));
  }

  ch.push(p("THE ACTUAL RESULT OF THE TEST FOR FREE MOISTURE LOSS AT 105 DEGREES", { spaceBefore: 120, spaceAfter: 40 }));
  ch.push(p(`CENTIGRADE           :  ${coa.moisture}   PCT`, { spaceAfter: 160 }));

  ch.push(p("THE ACTUAL RESULT OF THE TEST FOR PHYSICAL SIZES  (ON NATURAL BASIS) :", { spaceAfter: 40 }));
  ch.push(p("SIZE :", { spaceAfter: 60 }));
  for (const line of (coa.physSizes || "").split("\n")) {
    if (line.trim()) ch.push(p(line, { spaceAfter: 40 }));
  }

  ch.push(p("This Certificate reflects our findings at the time and place of inspection only and does not refer to and any other matter.", { spaceBefore: 200, spaceAfter: 200 }));
  ch.push(p(`FOR ${coa.agency}`, { bold: true, spaceAfter: 400 }));
  ch.push(p("AUTHORIZED SIGNATORY", { bold: true, spaceAfter: 60 }));
  ch.push(p("ISSUED AT LOADING PORT", { spaceAfter: 200 }));
  ch.push(p("This certificate contains only two pages.", { size: 16 }));

  return ch;
}

function buildCoaPdf(doc: PDFKit.PDFDocument, content: string, leftMargin: number, pageWidth: number) {
  const coa = parseCoaContent(content);
  const x = leftMargin;
  const W = pageWidth;
  const mono = "Courier";
  const monoBold = "Courier-Bold";

  doc.font(monoBold).fontSize(14).fillColor("#000000").text("CERTIFICATE OF QUALITY", x, doc.y, { width: W, align: "center" });
  doc.moveDown(0.3);
  doc.font(monoBold).fontSize(12).text("'TO WHOM IT MAY CONCERN'", x, doc.y, { width: W, align: "center" });
  doc.moveDown(0.8);

  doc.font(mono).fontSize(8).text("PAGE 1 OF 2", x, doc.y, { width: W, align: "right" });
  doc.font(mono).fontSize(8).text(`REF:  Certificate No. ${coa.certNo}`, x, doc.y);
  doc.font(mono).fontSize(8).text(`DATE:  ${coa.date}`, x, doc.y);
  doc.moveDown(0.8);

  doc.font(monoBold).fontSize(9).text("DESCRIPTION OF GOODS", x, doc.y);
  doc.moveDown(0.5);

  const descRows: [string, string][] = [
    ["NAME OF COMMODITY", coa.commodity],
    ["QUANTITY", `${coa.quantity} METRIC TONS`],
    ["COUNTRY OF ORIGIN", coa.origin],
    ["PACKING", coa.packing],
    ["NAME OF THE CARRYING VESSEL", coa.vessel],
    ["PORT OF LOADING", coa.portOfLoading],
    ["PORT OF DISCHARGE", coa.portOfDischarge],
    ["B/L NO. & DATE", `01 & DATED ${coa.blDate}`],
  ];
  for (const [label, val] of descRows) {
    const labelPad = label.padEnd(34);
    doc.font(mono).fontSize(8).text(`${labelPad}:     `, x, doc.y, { continued: true });
    doc.font(monoBold).fontSize(8).text(val, { continued: false });
  }

  doc.moveDown(0.5);
  doc.font(mono).fontSize(7).text("=".repeat(73), x, doc.y);
  doc.moveDown(0.5);

  doc.font(mono).fontSize(8).text(`In accordance with the instructions received from the shipper, we attended at, ${coa.portOfLoading} during the period ${coa.inspFrom} to ${coa.inspTo} for the purpose of drawing representative samples of the consignment of ${coa.commodity} while the cargo was being loaded on board the vessel ${coa.vessel} at ${coa.portOfLoading}. We certify as under:`, x, doc.y, { width: W });
  doc.moveDown(0.6);

  doc.font(mono).fontSize(8).text(`AT ${coa.portOfLoading}       :     Cargo loading commenced on  ${coa.loadStart}`, x, doc.y);
  const indentX = x + doc.widthOfString(`AT ${coa.portOfLoading}       `) + 20;
  doc.font(mono).fontSize(8).text(`Cargo loading completed on  ${coa.loadEnd}`, Math.min(indentX, x + 200), doc.y);
  doc.moveDown(0.6);

  doc.font(monoBold).fontSize(8).text("SAMPLING PROCEDURE", x, doc.y);
  doc.moveDown(0.3);
  doc.font(mono).fontSize(8).text(`Systematic mass based sampling carried out in accordance with BIS 1405 throughout course of loading. Sublotwise gross sample was constituted by collecting requisite number of sample increments while loading the cargo into the vessel at ${coa.portOfLoading}. Individual, Sublotwise gross samples were subject to size analysis and further processed to obtain for moisture determination and chemical analysis.`, x, doc.y, { width: W });
  doc.moveDown(0.5);
  doc.font(mono).fontSize(8).text("Sub-lot wise samples drawn as above mixed together to prepare composite sample representing the entire shipment.", x, doc.y, { width: W });

  // ── PAGE 2 ──
  doc.addPage();
  doc.font(mono).fontSize(8).text("PAGE 2 OF 2", x, doc.y, { width: W, align: "right" });
  doc.font(mono).fontSize(8).text(`REF:  Certificate No. ${coa.certNo}`, x, doc.y);
  doc.font(mono).fontSize(8).text(`DATE:  ${coa.date}`, x, doc.y);
  doc.moveDown(0.8);

  doc.font(mono).fontSize(8).text(`Composite sample representing the shipment at ${coa.portOfLoading} was divided into 3 parts and sealed with our monogram. After retaining 2 parts for future reference, one part tested in our lab with the following results.`, x, doc.y, { width: W });
  doc.moveDown(0.5);
  doc.font(mono).fontSize(8).text("The analysis as per IS 1493 for the specifications computed for the cargo shipped are as under:", x, doc.y, { width: W });
  doc.moveDown(0.8);

  doc.font(monoBold).fontSize(8).text("SPECIFICATIONS:", x, doc.y);
  doc.font(mono).fontSize(8).text("THE ACTUAL RESULT OF THE TEST FOR CHEMICAL COMPOSITIONS (ON DRY BASIS)", x, doc.y);
  doc.font(mono).fontSize(8).text("        (Percentage by weight)", x, doc.y);
  doc.moveDown(0.5);

  for (const line of (coa.chemSpecs || "").split("\n")) {
    if (line.trim()) {
      pdfCheckPage(doc, 20);
      doc.font(mono).fontSize(8).text(line, x, doc.y);
    }
  }

  doc.moveDown(0.6);
  doc.font(mono).fontSize(8).text("THE ACTUAL RESULT OF THE TEST FOR FREE MOISTURE LOSS AT 105 DEGREES", x, doc.y);
  doc.font(mono).fontSize(8).text(`CENTIGRADE           :  ${coa.moisture}   PCT`, x, doc.y);
  doc.moveDown(0.6);

  doc.font(mono).fontSize(8).text("THE ACTUAL RESULT OF THE TEST FOR PHYSICAL SIZES  (ON NATURAL BASIS) :", x, doc.y);
  doc.font(mono).fontSize(8).text("SIZE :", x, doc.y);
  for (const line of (coa.physSizes || "").split("\n")) {
    if (line.trim()) {
      pdfCheckPage(doc, 20);
      doc.font(mono).fontSize(8).text(line, x, doc.y);
    }
  }

  doc.moveDown(0.8);
  doc.font(mono).fontSize(8).text("This Certificate reflects our findings at the time and place of inspection only and does not refer to and any other matter.", x, doc.y, { width: W });
  doc.moveDown(0.8);
  doc.font(monoBold).fontSize(9).text(`FOR ${coa.agency}`, x, doc.y);
  doc.moveDown(2.5);
  doc.font(monoBold).fontSize(8).text("AUTHORIZED SIGNATORY", x, doc.y);
  doc.font(mono).fontSize(8).text("ISSUED AT LOADING PORT", x, doc.y);
  doc.moveDown(0.8);
  doc.font(mono).fontSize(7).text("This certificate contains only two pages.", x, doc.y);
}

function isCowContent(content: string): boolean {
  return content.trimStart().startsWith("CERTIFICATE OF WEIGHT") && content.includes("Draft Survey");
}

interface CowData {
  certNo: string;
  date: string;
  commodity: string;
  quantity: string;
  origin: string;
  packing: string;
  vessel: string;
  portOfLoading: string;
  portOfDischarge: string;
  blDate: string;
  loadPeriod: string;
  moisture: string;
  dryQty: string;
  agency: string;
}

function parseCowContent(content: string): CowData {
  const lines = content.split("\n");

  const extractColon = (label: string): string => {
    const line = lines.find(l => l.trimStart().startsWith(label));
    if (!line) return "_______________";
    const idx = line.indexOf(":");
    return idx >= 0 ? line.substring(idx + 1).trim() : "";
  };

  const certNoLine = lines.find(l => l.startsWith("REF:  Certificate No. "));
  const certNo = certNoLine ? certNoLine.replace("REF:  Certificate No. ", "").trim() : "";

  const dateLine = lines.find(l => l.startsWith("DATE:  "));
  const date = dateLine ? dateLine.replace("DATE:  ", "").trim() : "";

  const commodity = extractColon("NAME OF COMMODITY");
  const quantityRaw = extractColon("QUANTITY");
  const quantity = quantityRaw.replace(" METRIC TONS", "").trim();
  const origin = extractColon("COUNTRY OF ORIGIN");
  const packing = extractColon("PACKING");
  const vessel = extractColon("NAME OF THE CARRYING VESSEL");
  const portOfLoading = extractColon("PORT OF LOADING");
  const portOfDischarge = extractColon("PORT OF DISCHARGE");
  const blRaw = extractColon("B/L NO. & DATE");
  const blDate = blRaw.replace(/^01 & DATED\s*/i, "").trim();

  const loadLine = lines.find(l => l.match(/^Port of loading at .+?\s+:\s+/));
  let loadPeriod = "_______________    TO   _______________";
  if (loadLine) {
    const colonIdx = loadLine.indexOf(":");
    if (colonIdx >= 0) loadPeriod = loadLine.substring(colonIdx + 1).trim();
  }

  const moistureLine = lines.find(l => l.includes("Free Moisture loss at 105 degrees Centigrade"));
  let moisture = "_______________";
  if (moistureLine) {
    const m = moistureLine.match(/:\s+(.+?)\s+PCT/);
    if (m) moisture = m[1].trim();
  }

  const dryLine = lines.find(l => l.startsWith("Dry Quantity"));
  let dryQty = "_______________";
  if (dryLine) {
    const colonIdx = dryLine.indexOf(":");
    if (colonIdx >= 0) dryQty = dryLine.substring(colonIdx + 1).replace("METRIC TONS", "").trim();
  }

  const forLine = lines.find(l => l.startsWith("FOR ") && !l.includes("future reference"));
  const agency = forLine ? forLine.replace("FOR ", "").trim() : "_______________";

  return { certNo, date, commodity, quantity, origin, packing, vessel, portOfLoading, portOfDischarge, blDate, loadPeriod, moisture, dryQty, agency };
}

function buildCowDocx(content: string): (Paragraph | Table)[] {
  const cow = parseCowContent(content);
  const ch: (Paragraph | Table)[] = [];
  const mono = "Courier New";
  const fs = 18;
  const p = (text: string, opts: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; spaceBefore?: number; spaceAfter?: number; pageBreak?: boolean } = {}) =>
    new Paragraph({
      children: [new TextRun({ text, bold: opts.bold || false, size: opts.size || fs, font: mono })],
      alignment: opts.align,
      pageBreakBefore: opts.pageBreak,
      spacing: { before: opts.spaceBefore || 0, after: opts.spaceAfter || 60 },
    });

  ch.push(p("CERTIFICATE OF WEIGHT", { bold: true, size: 26, align: AlignmentType.CENTER, spaceAfter: 80 }));
  ch.push(p("'TO WHOM IT MAY CONCERN'", { bold: true, size: 22, align: AlignmentType.CENTER, spaceAfter: 160 }));

  ch.push(new Paragraph({ children: [new TextRun({ text: "PAGE 1 OF 1", size: fs, font: mono })], alignment: AlignmentType.RIGHT, spacing: { after: 40 } }));
  ch.push(p(`REF:  Certificate No. ${cow.certNo}`));
  ch.push(p(`DATE:  ${cow.date}`, { spaceAfter: 160 }));

  ch.push(p("DESCRIPTION OF GOODS", { bold: true, spaceAfter: 120 }));

  const descRows: [string, string][] = [
    ["NAME OF COMMODITY", cow.commodity],
    ["QUANTITY", `${cow.quantity} METRIC TONS`],
    ["COUNTRY OF ORIGIN", cow.origin],
    ["PACKING", cow.packing],
    ["NAME OF THE CARRYING VESSEL", cow.vessel],
    ["PORT OF LOADING", cow.portOfLoading],
    ["PORT OF DISCHARGE", cow.portOfDischarge],
    ["B/L NO. & DATE", `01 & DATED ${cow.blDate}`],
  ];
  for (const [label, val] of descRows) {
    ch.push(new Paragraph({
      children: [
        new TextRun({ text: label.padEnd(34), size: fs, font: mono }),
        new TextRun({ text: ":     ", size: fs, font: mono }),
        new TextRun({ text: val, bold: true, size: fs, font: mono }),
      ],
      spacing: { before: 40, after: 80 },
    }));
  }

  ch.push(p("=".repeat(73), { spaceBefore: 120, spaceAfter: 120 }));

  ch.push(p(`In accordance with the instructions received from the shipper, we attended for consignment of ${cow.commodity} while the cargo was being loaded on board the vessel ${cow.vessel} and the weight loaded was determined at ${cow.portOfLoading}, by Draft Survey.  We hereby certifying the actual surveyed weight of cargo shipped at loading port in wet metric tons and dry metric tons as under:`, { spaceAfter: 120 }));

  ch.push(new Paragraph({
    children: [new TextRun({ text: `Port of loading at ${cow.portOfLoading}    :     ${cow.loadPeriod}`, size: fs, font: mono })],
    spacing: { before: 60, after: 80 },
  }));

  ch.push(new Paragraph({
    children: [new TextRun({ text: `Quantity loaded at ${cow.portOfLoading}     :     ${cow.quantity} METRIC TONS`, size: fs, font: mono })],
    spacing: { before: 40, after: 80 },
  }));

  ch.push(new Paragraph({
    children: [new TextRun({ text: `Free Moisture loss at 105 degrees Centigrade :     ${cow.moisture}    PCT`, size: fs, font: mono })],
    spacing: { before: 40, after: 80 },
  }));

  ch.push(new Paragraph({
    children: [new TextRun({ text: `Dry Quantity     :     ${cow.dryQty} METRIC TONS`, size: fs, font: mono })],
    spacing: { before: 40, after: 160 },
  }));

  ch.push(p("This certificate reflects our findings at the time, date and place of inspection and does not refer to any other matter.", { spaceAfter: 200 }));

  ch.push(p(`FOR ${cow.agency}`, { bold: true, spaceAfter: 400 }));
  ch.push(p("AUTHORIZED SIGNATORY", { bold: true, spaceAfter: 60 }));
  ch.push(p("ISSUED AT LOADING PORT", { spaceAfter: 200 }));
  ch.push(p("This certificate contains only one page.", { size: 16 }));

  return ch;
}

function buildCowPdf(doc: PDFKit.PDFDocument, content: string, leftMargin: number, pageWidth: number) {
  const cow = parseCowContent(content);
  const x = leftMargin;
  const W = pageWidth;
  const mono = "Courier";
  const monoBold = "Courier-Bold";

  doc.font(monoBold).fontSize(14).fillColor("#000000").text("CERTIFICATE OF WEIGHT", x, doc.y, { width: W, align: "center" });
  doc.moveDown(0.3);
  doc.font(monoBold).fontSize(12).text("'TO WHOM IT MAY CONCERN'", x, doc.y, { width: W, align: "center" });
  doc.moveDown(0.8);

  doc.font(mono).fontSize(8).text("PAGE 1 OF 1", x, doc.y, { width: W, align: "right" });
  doc.font(mono).fontSize(8).text(`REF:  Certificate No. ${cow.certNo}`, x, doc.y);
  doc.font(mono).fontSize(8).text(`DATE:  ${cow.date}`, x, doc.y);
  doc.moveDown(0.8);

  doc.font(monoBold).fontSize(9).text("DESCRIPTION OF GOODS", x, doc.y);
  doc.moveDown(0.5);

  const descRows: [string, string][] = [
    ["NAME OF COMMODITY", cow.commodity],
    ["QUANTITY", `${cow.quantity} METRIC TONS`],
    ["COUNTRY OF ORIGIN", cow.origin],
    ["PACKING", cow.packing],
    ["NAME OF THE CARRYING VESSEL", cow.vessel],
    ["PORT OF LOADING", cow.portOfLoading],
    ["PORT OF DISCHARGE", cow.portOfDischarge],
    ["B/L NO. & DATE", `01 & DATED ${cow.blDate}`],
  ];
  for (const [label, val] of descRows) {
    const labelPad = label.padEnd(34);
    doc.font(mono).fontSize(8).text(`${labelPad}:     `, x, doc.y, { continued: true });
    doc.font(monoBold).fontSize(8).text(val, { continued: false });
  }

  doc.moveDown(0.5);
  doc.font(mono).fontSize(7).text("=".repeat(73), x, doc.y);
  doc.moveDown(0.5);

  doc.font(mono).fontSize(8).text(`In accordance with the instructions received from the shipper, we attended for consignment of ${cow.commodity} while the cargo was being loaded on board the vessel ${cow.vessel} and the weight loaded was determined at ${cow.portOfLoading}, by Draft Survey.  We hereby certifying the actual surveyed weight of cargo shipped at loading port in wet metric tons and dry metric tons as under:`, x, doc.y, { width: W });
  doc.moveDown(0.6);

  doc.font(mono).fontSize(8).text(`Port of loading at ${cow.portOfLoading}    :     ${cow.loadPeriod}`, x, doc.y, { width: W });
  doc.moveDown(0.3);
  doc.font(mono).fontSize(8).text(`Quantity loaded at ${cow.portOfLoading}     :     ${cow.quantity} METRIC TONS`, x, doc.y, { width: W });
  doc.moveDown(0.3);
  doc.font(mono).fontSize(8).text(`Free Moisture loss at 105 degrees Centigrade :     ${cow.moisture}    PCT`, x, doc.y, { width: W });
  doc.moveDown(0.3);
  doc.font(mono).fontSize(8).text(`Dry Quantity     :     ${cow.dryQty} METRIC TONS`, x, doc.y, { width: W });
  doc.moveDown(0.8);

  doc.font(mono).fontSize(8).text("This certificate reflects our findings at the time, date and place of inspection and does not refer to any other matter.", x, doc.y, { width: W });
  doc.moveDown(0.8);
  doc.font(monoBold).fontSize(9).text(`FOR ${cow.agency}`, x, doc.y);
  doc.moveDown(2.5);
  doc.font(monoBold).fontSize(8).text("AUTHORIZED SIGNATORY", x, doc.y);
  doc.font(mono).fontSize(8).text("ISSUED AT LOADING PORT", x, doc.y);
  doc.moveDown(0.8);
  doc.font(mono).fontSize(7).text("This certificate contains only one page.", x, doc.y);
}

function isCiContent(content: string): boolean {
  return content.trimStart().startsWith("COMMERCIAL INVOICE") && content.includes("SELLER (BENEFICIARY)");
}

interface CiData {
  invoiceNo: string;
  date: string;
  sellerName: string;
  sellerAddr: string;
  sellerContact: string;
  sellerBank: string;
  sellerSwift: string;
  buyerName: string;
  buyerAddr: string;
  buyerContact: string;
  lcNo: string;
  lcBank: string;
  vessel: string;
  voyage: string;
  portOfLoading: string;
  portOfDischarge: string;
  origin: string;
  blNo: string;
  blDate: string;
  commodity: string;
  quantity: string;
  unitPrice: string;
  currency: string;
  totalAmount: string;
  tolerance: string;
  paymentTerms: string;
}

function parseCiContent(content: string): CiData {
  const lines = content.split("\n");

  const extractColon = (label: string): string => {
    const line = lines.find(l => l.trimStart().startsWith(label));
    if (!line) return "_______________";
    const idx = line.indexOf(":");
    return idx >= 0 ? line.substring(idx + 1).trim() : "_______________";
  };

  const findSectionIdx = (header: string): number => lines.findIndex(l => l.trim() === header);

  const sellerIdx = findSectionIdx("SELLER (BENEFICIARY)");
  const buyerIdx = findSectionIdx("BUYER (APPLICANT)");
  const lcIdx = findSectionIdx("LETTER OF CREDIT DETAILS");
  const shipIdx = findSectionIdx("SHIPMENT DETAILS");

  const extractFromRange = (startIdx: number, endIdx: number, label: string): string => {
    const end = endIdx > 0 ? endIdx : lines.length;
    const slice = lines.slice(startIdx + 1, end);
    const line = slice.find(l => l.trimStart().startsWith(label));
    if (!line) return "_______________";
    const idx = line.indexOf(":");
    return idx >= 0 ? line.substring(idx + 1).trim() : "_______________";
  };

  const sellerName = extractFromRange(sellerIdx, buyerIdx, "Company");
  const sellerAddr = extractFromRange(sellerIdx, buyerIdx, "Address");
  const sellerContact = extractFromRange(sellerIdx, buyerIdx, "Contact");
  const sellerBank = extractFromRange(sellerIdx, buyerIdx, "Bank");
  const sellerSwift = extractFromRange(sellerIdx, buyerIdx, "SWIFT");

  const buyerName = extractFromRange(buyerIdx, lcIdx, "Company");
  const buyerAddr = extractFromRange(buyerIdx, lcIdx, "Address");
  const buyerContact = extractFromRange(buyerIdx, lcIdx, "Contact");

  const lcNo = extractFromRange(lcIdx, shipIdx, "LC Number");
  const lcBank = extractFromRange(lcIdx, shipIdx, "LC Issuing Bank");

  const vessel = extractColon("Vessel");
  const voyage = extractColon("Voyage No.");
  const pol = extractColon("Port of Loading");
  const pod = extractColon("Port of Discharge");
  const origin = extractColon("Country of Origin");

  const blRaw = extractColon("B/L No. & Date");
  const blParts = blRaw.split("&");
  const blNo = blParts[0].trim() || "01";
  const blDate = blParts.length > 1 ? blParts[1].replace(/DATED\s*/i, "").trim() : "_______________";

  const goodsHeaderIdx = lines.findIndex(l => l.includes("| Commodity |"));
  let commodity = "_______________", quantity = "_______________", unitPrice = "_______________", currency = "USD", totalAmount = "_______________";
  if (goodsHeaderIdx >= 0 && goodsHeaderIdx + 1 < lines.length) {
    const dataLine = lines[goodsHeaderIdx + 1];
    const cells = dataLine.split("|").map(c => c.trim()).filter(Boolean);
    if (cells.length >= 4) {
      commodity = cells[0] || "_______________";
      quantity = (cells[1] || "").replace(/\s*MT\s*$/i, "").trim() || "_______________";
      const upMatch = (cells[2] || "").match(/^([A-Z]+)\s+(.+?)\/MT$/);
      if (upMatch) { currency = upMatch[1]; unitPrice = upMatch[2]; }
      const taMatch = (cells[3] || "").match(/^([A-Z]+)\s+(.+)$/);
      if (taMatch) totalAmount = taMatch[2];
    }
  }

  const tolerance = extractColon("Tolerance");
  const paymentTerms = extractColon("Payment Terms");
  const invoiceNo = extractColon("Invoice No.");
  const date = extractColon("Invoice Date");

  return { invoiceNo, date, sellerName, sellerAddr, sellerContact, sellerBank, sellerSwift, buyerName, buyerAddr, buyerContact, lcNo, lcBank, vessel, voyage, portOfLoading: pol, portOfDischarge: pod, origin, blNo, blDate, commodity, quantity, unitPrice, currency, totalAmount, tolerance, paymentTerms };
}

function buildCiDocx(content: string): (Paragraph | Table)[] {
  const ci = parseCiContent(content);
  const ch: (Paragraph | Table)[] = [];
  const S = { style: BorderStyle.SINGLE as const, size: 4, color: "000000" };
  const BB = { top: S, bottom: S, left: S, right: S };
  const NB = { top: { style: BorderStyle.NONE as const, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE as const, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE as const, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE as const, size: 0, color: "FFFFFF" } };

  const p = (text: string, opts: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; spaceBefore?: number; spaceAfter?: number } = {}) =>
    new Paragraph({
      children: [new TextRun({ text, bold: opts.bold || false, size: opts.size || 20, font: "Calibri" })],
      alignment: opts.align,
      spacing: { before: opts.spaceBefore || 0, after: opts.spaceAfter || 60 },
    });

  const cell = (paras: Paragraph[], w: number, shaded = false, borders = BB) => new TableCell({
    children: paras,
    borders,
    width: { size: w, type: WidthType.DXA },
    verticalAlign: VerticalAlign.TOP,
    shading: shaded ? { fill: "F5F5F5", type: ShadingType.CLEAR } : undefined,
  });

  const row2 = (lbl: string, val: string) => new TableRow({
    children: [
      cell([new Paragraph({ children: [new TextRun({ text: lbl, bold: true, size: 18, font: "Calibri" })], spacing: { before: 40, after: 40 } })], 3000, true),
      cell([new Paragraph({ children: [new TextRun({ text: val, size: 18, font: "Calibri" })], spacing: { before: 40, after: 40 } })], 6000),
    ],
  });

  ch.push(p("COMMERCIAL INVOICE", { bold: true, size: 32, align: AlignmentType.CENTER, spaceAfter: 80 }));
  ch.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" } }, spacing: { after: 120 } }));

  ch.push(new Table({
    width: { size: 9000, type: WidthType.DXA },
    rows: [
      row2("Invoice No.", ci.invoiceNo),
      row2("Invoice Date", ci.date),
    ],
  }));
  ch.push(p("", { spaceAfter: 80 }));

  const halfW = 4500;
  const partyCell = (title: string, name: string, addr: string, contact: string, bank?: string, swift?: string) => {
    const paras: Paragraph[] = [
      new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 18, font: "Calibri" })], spacing: { before: 40, after: 60 } }),
      new Paragraph({ children: [new TextRun({ text: name, bold: true, size: 20, font: "Calibri" })], spacing: { before: 20, after: 40 } }),
      new Paragraph({ children: [new TextRun({ text: `Address: ${addr}`, size: 17, font: "Calibri" })], spacing: { before: 20, after: 30 } }),
      new Paragraph({ children: [new TextRun({ text: `Contact: ${contact}`, size: 17, font: "Calibri" })], spacing: { before: 20, after: 30 } }),
    ];
    if (bank) paras.push(new Paragraph({ children: [new TextRun({ text: `Bank: ${bank}`, size: 17, font: "Calibri" })], spacing: { before: 20, after: 30 } }));
    if (swift) paras.push(new Paragraph({ children: [new TextRun({ text: `SWIFT: ${swift}`, size: 17, font: "Calibri" })], spacing: { before: 20, after: 40 } }));
    return cell(paras, halfW, false, BB);
  };

  ch.push(new Table({
    width: { size: 9000, type: WidthType.DXA },
    rows: [new TableRow({ children: [partyCell("SELLER (BENEFICIARY)", ci.sellerName, ci.sellerAddr, ci.sellerContact, ci.sellerBank, ci.sellerSwift), partyCell("BUYER (APPLICANT)", ci.buyerName, ci.buyerAddr, ci.buyerContact)] })],
  }));
  ch.push(p("", { spaceAfter: 80 }));

  ch.push(p("LETTER OF CREDIT DETAILS", { bold: true, size: 22, spaceAfter: 40 }));
  ch.push(new Table({
    width: { size: 9000, type: WidthType.DXA },
    rows: [row2("LC Number", ci.lcNo), row2("LC Issuing Bank", ci.lcBank)],
  }));
  ch.push(p("", { spaceAfter: 80 }));

  ch.push(p("SHIPMENT DETAILS", { bold: true, size: 22, spaceAfter: 40 }));
  ch.push(new Table({
    width: { size: 9000, type: WidthType.DXA },
    rows: [
      row2("Vessel", ci.vessel),
      row2("Voyage No.", ci.voyage),
      row2("Port of Loading", ci.portOfLoading),
      row2("Port of Discharge", ci.portOfDischarge),
      row2("Country of Origin", ci.origin),
      row2("B/L No. & Date", `${ci.blNo} & DATED ${ci.blDate}`),
    ],
  }));
  ch.push(p("", { spaceAfter: 80 }));

  ch.push(p("DESCRIPTION OF GOODS", { bold: true, size: 22, spaceAfter: 40 }));
  const colW = [2500, 1800, 2000, 2700];
  const hdrCell = (text: string, w: number) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 18, font: "Calibri" })], spacing: { before: 40, after: 40 } })], borders: BB, width: { size: w, type: WidthType.DXA }, shading: { fill: "E8E8E8", type: ShadingType.CLEAR } });
  const dataCell = (text: string, w: number) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, size: 18, font: "Calibri" })], spacing: { before: 40, after: 40 } })], borders: BB, width: { size: w, type: WidthType.DXA } });
  ch.push(new Table({
    width: { size: 9000, type: WidthType.DXA },
    rows: [
      new TableRow({ children: [hdrCell("Commodity", colW[0]), hdrCell("Quantity (MT)", colW[1]), hdrCell(`Unit Price (${ci.currency}/MT)`, colW[2]), hdrCell(`Total Amount (${ci.currency})`, colW[3])] }),
      new TableRow({ children: [dataCell(ci.commodity, colW[0]), dataCell(`${ci.quantity} MT`, colW[1]), dataCell(`${ci.currency} ${ci.unitPrice}/MT`, colW[2]), dataCell(`${ci.currency} ${ci.totalAmount}`, colW[3])] }),
    ],
  }));
  ch.push(p("", { spaceAfter: 40 }));
  ch.push(p(`Tolerance: ${ci.tolerance}`, { spaceAfter: 40 }));
  ch.push(p(`TOTAL INVOICE VALUE: ${ci.currency} ${ci.totalAmount}`, { bold: true, size: 22, spaceAfter: 40 }));
  ch.push(p(`Payment Terms: ${ci.paymentTerms}`, { spaceAfter: 200 }));

  ch.push(new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 2, color: "AAAAAA" } }, spacing: { before: 200, after: 80 } }));
  ch.push(p(`FOR AND ON BEHALF OF ${ci.sellerName}`, { bold: true, spaceAfter: 40 }));
  ch.push(p("Authorised Signatory", { spaceAfter: 160 }));
  ch.push(p("Name:  _______________", { spaceAfter: 40 }));
  ch.push(p("Title: _______________", { spaceAfter: 40 }));
  ch.push(p(`Date:  ${ci.date}`, { spaceAfter: 40 }));
  ch.push(p("Signature & Stamp: _______________", { spaceAfter: 40 }));

  return ch;
}

function buildCiPdf(doc: PDFKit.PDFDocument, content: string, leftMargin: number, pageWidth: number) {
  const ci = parseCiContent(content);
  const x = leftMargin;
  const W = pageWidth;

  doc.font("Helvetica-Bold").fontSize(16).fillColor("#000000").text("COMMERCIAL INVOICE", x, doc.y, { width: W, align: "center" });
  doc.moveDown(0.3);
  const lineY = doc.y;
  doc.moveTo(x, lineY).lineTo(x + W, lineY).stroke("#000000");
  doc.moveDown(0.6);

  drawPdf2ColTable(doc, [["Invoice No.", ci.invoiceNo], ["Invoice Date", ci.date]], x, W);
  doc.moveDown(0.6);

  const halfW = Math.floor(W / 2) - 5;
  const rightX = x + halfW + 10;
  const partyStartY = doc.y;

  const renderPartyBlock = (xPos: number, title: string, name: string, addr: string, contact: string, bank?: string, swift?: string) => {
    doc.font("Helvetica-Bold").fontSize(8).text(title, xPos, partyStartY, { width: halfW });
    doc.font("Helvetica-Bold").fontSize(9).text(name, xPos, doc.y, { width: halfW });
    doc.font("Helvetica").fontSize(8).text(`Address: ${addr}`, xPos, doc.y, { width: halfW });
    doc.font("Helvetica").fontSize(8).text(`Contact: ${contact}`, xPos, doc.y, { width: halfW });
    if (bank) doc.font("Helvetica").fontSize(8).text(`Bank: ${bank}`, xPos, doc.y, { width: halfW });
    if (swift) doc.font("Helvetica").fontSize(8).text(`SWIFT: ${swift}`, xPos, doc.y, { width: halfW });
  };

  renderPartyBlock(x, "SELLER (BENEFICIARY)", ci.sellerName, ci.sellerAddr, ci.sellerContact, ci.sellerBank, ci.sellerSwift);
  const sellerEndY = doc.y;
  doc.y = partyStartY;
  renderPartyBlock(rightX, "BUYER (APPLICANT)", ci.buyerName, ci.buyerAddr, ci.buyerContact);
  doc.y = Math.max(sellerEndY, doc.y);
  doc.x = x;
  doc.moveDown(0.6);

  doc.font("Helvetica-Bold").fontSize(10).text("LETTER OF CREDIT DETAILS", x, doc.y, { width: W });
  doc.moveDown(0.3);
  drawPdf2ColTable(doc, [["LC Number", ci.lcNo], ["LC Issuing Bank", ci.lcBank]], x, W);
  doc.moveDown(0.6);

  doc.font("Helvetica-Bold").fontSize(10).text("SHIPMENT DETAILS", x, doc.y, { width: W });
  doc.moveDown(0.3);
  drawPdf2ColTable(doc, [
    ["Vessel", ci.vessel],
    ["Voyage No.", ci.voyage],
    ["Port of Loading", ci.portOfLoading],
    ["Port of Discharge", ci.portOfDischarge],
    ["Country of Origin", ci.origin],
    ["B/L No. & Date", `${ci.blNo} & DATED ${ci.blDate}`],
  ], x, W);
  doc.moveDown(0.6);

  doc.font("Helvetica-Bold").fontSize(10).text("DESCRIPTION OF GOODS", x, doc.y, { width: W });
  doc.moveDown(0.3);
  drawPdf4ColTable(doc, [
    ["Commodity", "Quantity (MT)", `Unit Price (${ci.currency}/MT)`, `Total Amount (${ci.currency})`],
    [ci.commodity, `${ci.quantity} MT`, `${ci.currency} ${ci.unitPrice}/MT`, `${ci.currency} ${ci.totalAmount}`],
  ], x, W);
  doc.moveDown(0.5);

  doc.font("Helvetica").fontSize(9).text(`Tolerance: ${ci.tolerance}`, x, doc.y, { width: W });
  doc.moveDown(0.3);
  doc.font("Helvetica-Bold").fontSize(10).text(`TOTAL INVOICE VALUE: ${ci.currency} ${ci.totalAmount}`, x, doc.y, { width: W });
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(9).text(`Payment Terms: ${ci.paymentTerms}`, x, doc.y, { width: W });
  doc.moveDown(1);

  const sigLineY = doc.y;
  doc.moveTo(x, sigLineY).lineTo(x + W, sigLineY).stroke("#AAAAAA");
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(9).text(`FOR AND ON BEHALF OF ${ci.sellerName}`, x, doc.y, { width: W });
  doc.font("Helvetica").fontSize(9).text("Authorised Signatory", x, doc.y, { width: W });
  doc.moveDown(1.5);
  doc.font("Helvetica").fontSize(9).text("Name:  _______________", x, doc.y, { width: W });
  doc.font("Helvetica").fontSize(9).text("Title: _______________", x, doc.y, { width: W });
  doc.font("Helvetica").fontSize(9).text(`Date:  ${ci.date}`, x, doc.y, { width: W });
  doc.font("Helvetica").fontSize(9).text("Signature & Stamp: _______________", x, doc.y, { width: W });
}

interface CooData {
  certNo: string;
  shipper: string;
  consignee: string;
  portOfLoading: string;
  vesselName: string;
  portOfDischarge: string;
  finalDestination: string;
  commodityName: string;
  quantityMT: string;
  packing: string;
  countryOfOrigin: string;
}

function parseCooContent(content: string): CooData {
  const lines = content.split("\n").map(l => l.trimEnd());

  const findIdx = (keyword: string): number => lines.findIndex(l => l.trim() === keyword);

  const nextNonEmpty = (fromIdx: number): string => {
    for (let i = fromIdx + 1; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t && !t.match(/^[=─]+$/)) return t;
    }
    return "";
  };

  const extractAfter = (prefix: string): string => {
    const line = lines.find(l => l.trim().startsWith(prefix));
    return line ? line.substring(line.indexOf(prefix) + prefix.length).trim() : "";
  };

  const certLine = lines.find(l => l.startsWith("CERT NO.:"));
  const certNo = certLine ? certLine.replace("CERT NO.: ", "").trim() : "";

  const qtyLine = lines.find(l => l.includes("METRIC TONS") && !l.toLowerCase().includes("metric tons of"));
  const quantityMT = qtyLine ? qtyLine.replace("METRIC TONS", "").trim() : "";

  return {
    certNo,
    shipper: nextNonEmpty(findIdx("SHIPPER")),
    consignee: nextNonEmpty(findIdx("CONSIGNEE")),
    portOfLoading: nextNonEmpty(findIdx("PORT OF LOADING")),
    vesselName: nextNonEmpty(findIdx("VESSEL NAME")),
    portOfDischarge: nextNonEmpty(findIdx("PORT OF DISCHARGE")),
    finalDestination: nextNonEmpty(findIdx("FINAL DESTINATION")),
    commodityName: extractAfter("NAME OF COMMODITY: "),
    quantityMT,
    packing: extractAfter("PACKING: "),
    countryOfOrigin: extractAfter("COUNTRY OF ORIGIN: "),
  };
}

function buildCooDocx(content: string): (Paragraph | Table)[] {
  const coo = parseCooContent(content);
  const children: (Paragraph | Table)[] = [];

  const S = { style: BorderStyle.SINGLE as const, size: 4, color: "000000" };
  const BB = { top: S, bottom: S, left: S, right: S };

  const lbl = (t: string, bold = false) => new Paragraph({
    children: [new TextRun({ text: t, size: 16, font: "Arial", bold })],
    spacing: { before: 20, after: 20 },
  });
  const val = (t: string, sz = 18) => new Paragraph({
    children: [new TextRun({ text: t || " ", size: sz, font: "Arial", bold: true })],
    spacing: { before: 10, after: 30 },
  });
  const sp = (n = 60) => new Paragraph({ children: [new TextRun({ text: " ", size: 12 })], spacing: { before: 0, after: n } });

  // Title
  children.push(new Paragraph({
    children: [new TextRun({ text: "CERTIFICATE OF ORIGIN", bold: true, size: 36, font: "Arial" })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 240 },
  }));

  // ── TOP 3-COLUMN TABLE ──
  // Col A (left): 2600 | Col B (mid): 2600 | Col C (right, No.:): 4160 → total 9360
  const CA = 2600, CB = 2600, CC = 4160, TW = CA + CB + CC;

  const rightCellRestart = new TableCell({
    children: [
      lbl("No.:"),
      val(coo.certNo || " "),
      sp(200),
    ],
    borders: BB,
    width: { size: CC, type: WidthType.DXA },
    verticalMerge: VerticalMergeType.RESTART,
    verticalAlign: VerticalAlign.TOP,
  });

  const rightCellContinue = () => new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: "" })] })],
    borders: BB,
    width: { size: CC, type: WidthType.DXA },
    verticalMerge: VerticalMergeType.CONTINUE,
  });

  const mergedAB = (paras: Paragraph[]) => new TableCell({
    children: paras,
    borders: BB,
    columnSpan: 2,
    width: { size: CA + CB, type: WidthType.DXA },
    verticalAlign: VerticalAlign.TOP,
  });

  const cellA = (paras: Paragraph[]) => new TableCell({
    children: paras,
    borders: BB,
    width: { size: CA, type: WidthType.DXA },
    verticalAlign: VerticalAlign.TOP,
  });

  const cellB = (paras: Paragraph[]) => new TableCell({
    children: paras,
    borders: BB,
    width: { size: CB, type: WidthType.DXA },
    verticalAlign: VerticalAlign.TOP,
  });

  children.push(new Table({
    width: { size: TW, type: WidthType.DXA },
    rows: [
      // Row 1: Shipper (A+B merged) | No.: (C, RESTART)
      new TableRow({
        children: [
          mergedAB([lbl("Shipper"), val(coo.shipper), sp(30)]),
          rightCellRestart,
        ],
      }),
      // Row 2: Consignee (A+B merged) | CONTINUE
      new TableRow({
        children: [
          mergedAB([lbl("CONSIGNEE:"), val(coo.consignee || "TO ORDER"), sp(20)]),
          rightCellContinue(),
        ],
      }),
      // Row 3: Pre-Carriage by (A) | Place of Receipt / Port of Loading (B) | CONTINUE
      new TableRow({
        children: [
          cellA([lbl("Pre-Carriage by:"), sp(40), sp(40)]),
          cellB([lbl("Place of Receipt by Pre-Carrier"), lbl("Port of Loading:"), val(coo.portOfLoading)]),
          rightCellContinue(),
        ],
      }),
      // Row 4: Vessel Name (A) | blank (B) | CONTINUE
      new TableRow({
        children: [
          cellA([lbl("VESSEL NAME"), val(coo.vesselName)]),
          cellB([sp(60)]),
          rightCellContinue(),
        ],
      }),
      // Row 5: Port of Discharge (A) | Final Destination (B) | CONTINUE
      new TableRow({
        children: [
          cellA([lbl("Port of Discharge:"), val(coo.portOfDischarge)]),
          cellB([lbl("Final Destination:"), val(coo.finalDestination)]),
          rightCellContinue(),
        ],
      }),
    ],
  }));

  // ── GOODS 4-COLUMN TABLE ──
  // Marks & Nos | Description | Quantity | Remark
  const GM = 1560, GD = 4200, GQ = 2000, GR = 1600; // = 9360
  const hdrCell = (paras: Paragraph[], w: number) => new TableCell({
    children: paras,
    borders: BB,
    width: { size: w, type: WidthType.DXA },
    shading: { fill: "F0F0F0", type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.TOP,
  });
  const dataCell = (paras: Paragraph[], w: number) => new TableCell({
    children: paras,
    borders: BB,
    width: { size: w, type: WidthType.DXA },
    verticalAlign: VerticalAlign.TOP,
  });

  children.push(new Table({
    width: { size: TW, type: WidthType.DXA },
    rows: [
      // Header row
      new TableRow({
        children: [
          hdrCell([lbl("Marks &"), lbl("Nos."), lbl("Container"), lbl("No.")], GM),
          hdrCell([lbl("No. & Kind of Pkgs."), sp(16), lbl("Quantity"), lbl("Description of Goods")], GD),
          hdrCell([lbl("QUANTITY")], GQ),
          hdrCell([lbl("Remark")], GR),
        ],
      }),
      // Data row
      new TableRow({
        children: [
          dataCell([sp(40), sp(60)], GM),
          dataCell([
            sp(20),
            new Paragraph({ children: [new TextRun({ text: `NAME OF COMMODITY: ${coo.commodityName}`, size: 18, font: "Arial" })], spacing: { before: 10, after: 14 } }),
            new Paragraph({ children: [new TextRun({ text: `PACKING: ${coo.packing}`, size: 18, font: "Arial" })], spacing: { before: 8, after: 14 } }),
            new Paragraph({ children: [new TextRun({ text: `COUNTRY OF ORIGIN: ${coo.countryOfOrigin}`, size: 18, font: "Arial" })], spacing: { before: 8, after: 20 } }),
            sp(20),
          ], GD),
          dataCell([
            sp(20),
            new Paragraph({ children: [new TextRun({ text: coo.quantityMT, size: 18, font: "Arial", bold: true })], spacing: { before: 10, after: 10 } }),
            new Paragraph({ children: [new TextRun({ text: "METRIC TONS", size: 18, font: "Arial" })], spacing: { before: 6, after: 20 } }),
          ], GQ),
          dataCell([sp(20)], GR),
        ],
      }),
    ],
  }));

  // ── CERTIFICATION FULL-WIDTH TABLE ──
  children.push(new Table({
    width: { size: TW, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({ children: [new TextRun({ text: "CERTIFICATION", bold: true, size: 22, font: "Arial" })], spacing: { before: 60, after: 30 } }),
              new Paragraph({ children: [new TextRun({ text: " " })], spacing: { before: 0, after: 20 } }),
              new Paragraph({
                children: [new TextRun({
                  text: `IT IS HEREBY CERTIFIED THAT TO THE BEST OF OUR KNOWLEDGE AND BELIEF THE ABOVE MENTIONED GOODS ARE OF ${coo.countryOfOrigin || "_______________"} ORIGIN.`,
                  size: 18, font: "Arial",
                })],
                spacing: { before: 10, after: 80 },
              }),
              sp(100),
            ],
            borders: BB,
            width: { size: TW, type: WidthType.DXA },
            columnSpan: 1,
          }),
        ],
      }),
    ],
  }));

  return children;
}

function buildCooPdf(doc: PDFKit.PDFDocument, content: string, leftMargin: number, pageWidth: number) {
  const coo = parseCooContent(content);
  const x = leftMargin;
  const W = pageWidth;

  // ── TITLE ──
  doc.font("Helvetica-Bold").fontSize(16).fillColor("#000000")
    .text("CERTIFICATE OF ORIGIN", x, doc.y, { width: W, align: "center" });
  doc.moveDown(0.5);

  // ── TOP SECTION: 3 columns ──
  // Col A+B (left 60%) | Col C (right 40%: No.:)
  const leftW = Math.round(W * 0.6);
  const rightW = W - leftW;
  const gap = 0;
  const pad = 5;
  const bw = 0.5;

  // We'll draw top section rows as stacked boxes
  // Right column (No.:) spans the height of all 5 left rows
  // We compute row heights first, then draw
  const fLbl = "Helvetica";
  const fVal = "Helvetica-Bold";
  const fsLbl = 7.5;
  const fsVal = 8.5;

  const halfW = Math.round(leftW * 0.5);

  const drawBorder = (bx: number, by: number, bw2: number, bh: number) => {
    doc.rect(bx, by, bw2, bh).lineWidth(bw).stroke("#000000");
  };

  const textH = (text: string, font: string, fs: number, w: number): number =>
    doc.font(font).fontSize(fs).heightOfString(text, { width: w - pad * 2 });

  // Row heights
  const shipperH = Math.max(
    textH("Shipper", fLbl, fsLbl, leftW) + textH(coo.shipper || " ", fVal, fsVal, leftW) + 20,
    40,
  );
  const consigneeH = Math.max(
    textH("CONSIGNEE:", fLbl, fsLbl, leftW) + textH(coo.consignee || "TO ORDER", fVal, fsVal, leftW) + 20,
    36,
  );
  const preCarriageH = Math.max(
    textH("Pre-Carriage by:", fLbl, fsLbl, halfW) + 16,
    textH("Place of Receipt by Pre-Carrier\nPort of Loading:\n" + (coo.portOfLoading || " "), fLbl, fsLbl, halfW - 2) + 16,
    36,
  );
  const vesselH = Math.max(
    textH("VESSEL NAME", fLbl, fsLbl, halfW) + textH(coo.vesselName || " ", fVal, fsVal, halfW) + 16,
    32,
  );
  const podH = Math.max(
    textH("Port of Discharge:\n" + (coo.portOfDischarge || " "), fLbl, fsLbl, halfW) + 16,
    textH("Final Destination:\n" + (coo.finalDestination || " "), fLbl, fsLbl, halfW) + 16,
    36,
  );

  const totalLeftH = shipperH + consigneeH + preCarriageH + vesselH + podH;
  const startY = doc.y;

  // Draw right (No.:) box spanning all rows
  drawBorder(x + leftW, startY, rightW, totalLeftH);
  doc.font(fLbl).fontSize(fsLbl).fillColor("#000000")
    .text("No.:", x + leftW + pad, startY + pad, { width: rightW - pad * 2 });
  doc.font(fVal).fontSize(fsVal)
    .text(coo.certNo || " ", x + leftW + pad, startY + pad + 12, { width: rightW - pad * 2 });

  // Row 1: Shipper (full left width)
  let cy = startY;
  drawBorder(x, cy, leftW, shipperH);
  doc.font(fLbl).fontSize(fsLbl).fillColor("#444444").text("Shipper", x + pad, cy + pad, { width: leftW - pad * 2 });
  doc.font(fVal).fontSize(fsVal).fillColor("#000000").text(coo.shipper || " ", x + pad, cy + pad + 12, { width: leftW - pad * 2 });
  cy += shipperH;

  // Row 2: Consignee (full left width)
  drawBorder(x, cy, leftW, consigneeH);
  doc.font(fLbl).fontSize(fsLbl).fillColor("#444444").text("CONSIGNEE:", x + pad, cy + pad, { width: leftW - pad * 2 });
  doc.font(fVal).fontSize(fsVal).fillColor("#000000").text(coo.consignee || "TO ORDER", x + pad, cy + pad + 12, { width: leftW - pad * 2 });
  cy += consigneeH;

  // Row 3: Pre-Carriage (left half) | Place of Receipt / Port of Loading (right half)
  drawBorder(x, cy, halfW, preCarriageH);
  doc.font(fLbl).fontSize(fsLbl).fillColor("#444444").text("Pre-Carriage by:", x + pad, cy + pad, { width: halfW - pad * 2 });
  drawBorder(x + halfW, cy, halfW, preCarriageH);
  doc.font(fLbl).fontSize(fsLbl).fillColor("#444444").text("Place of Receipt by Pre-Carrier", x + halfW + pad, cy + pad, { width: halfW - pad * 2 });
  doc.font(fLbl).fontSize(fsLbl).fillColor("#444444").text("Port of Loading:", x + halfW + pad, cy + pad + 10, { width: halfW - pad * 2 });
  doc.font(fVal).fontSize(fsVal).fillColor("#000000").text(coo.portOfLoading || " ", x + halfW + pad, cy + pad + 20, { width: halfW - pad * 2 });
  cy += preCarriageH;

  // Row 4: Vessel Name (left half) | blank (right half)
  drawBorder(x, cy, halfW, vesselH);
  doc.font(fLbl).fontSize(fsLbl).fillColor("#444444").text("VESSEL NAME", x + pad, cy + pad, { width: halfW - pad * 2 });
  doc.font(fVal).fontSize(fsVal).fillColor("#000000").text(coo.vesselName || " ", x + pad, cy + pad + 12, { width: halfW - pad * 2 });
  drawBorder(x + halfW, cy, halfW, vesselH);
  cy += vesselH;

  // Row 5: Port of Discharge (left half) | Final Destination (right half)
  drawBorder(x, cy, halfW, podH);
  doc.font(fLbl).fontSize(fsLbl).fillColor("#444444").text("Port of Discharge:", x + pad, cy + pad, { width: halfW - pad * 2 });
  doc.font(fVal).fontSize(fsVal).fillColor("#000000").text(coo.portOfDischarge || " ", x + pad, cy + pad + 12, { width: halfW - pad * 2 });
  drawBorder(x + halfW, cy, halfW, podH);
  doc.font(fLbl).fontSize(fsLbl).fillColor("#444444").text("Final Destination:", x + halfW + pad, cy + pad, { width: halfW - pad * 2 });
  doc.font(fVal).fontSize(fsVal).fillColor("#000000").text(coo.finalDestination || " ", x + halfW + pad, cy + pad + 12, { width: halfW - pad * 2 });
  cy += podH;

  doc.y = cy;
  doc.moveDown(0.3);

  // ── GOODS TABLE: 4 columns ──
  // Marks (17%) | Description (44%) | Quantity (22%) | Remark (17%)
  const GMarks = Math.round(W * 0.17);
  const GDesc  = Math.round(W * 0.44);
  const GQty   = Math.round(W * 0.22);
  const GRem   = W - GMarks - GDesc - GQty;

  const hdrY = doc.y;
  const hdrH = 42;

  // Header boxes
  doc.rect(x, hdrY, GMarks, hdrH).lineWidth(bw).fillAndStroke("#F0F0F0", "#000000");
  doc.rect(x + GMarks, hdrY, GDesc, hdrH).lineWidth(bw).fillAndStroke("#F0F0F0", "#000000");
  doc.rect(x + GMarks + GDesc, hdrY, GQty, hdrH).lineWidth(bw).fillAndStroke("#F0F0F0", "#000000");
  doc.rect(x + GMarks + GDesc + GQty, hdrY, GRem, hdrH).lineWidth(bw).fillAndStroke("#F0F0F0", "#000000");

  doc.fillColor("#000000");
  doc.font(fLbl).fontSize(fsLbl)
    .text("Marks &\nNos.\nContainer\nNo.", x + pad, hdrY + pad, { width: GMarks - pad * 2 });
  doc.font(fLbl).fontSize(fsLbl)
    .text("No. & Kind of Pkgs.", x + GMarks + pad, hdrY + pad, { width: GDesc - pad * 2 });
  doc.font(fLbl).fontSize(fsLbl)
    .text("\nQuantity\nDescription of Goods", x + GMarks + pad, hdrY + pad + 8, { width: GDesc - pad * 2 });
  doc.font(fLbl).fontSize(fsLbl)
    .text("QUANTITY", x + GMarks + GDesc + pad, hdrY + pad, { width: GQty - pad * 2 });
  doc.font(fLbl).fontSize(fsLbl)
    .text("Remark", x + GMarks + GDesc + GQty + pad, hdrY + pad, { width: GRem - pad * 2 });

  // Data row
  const descText = [
    `NAME OF COMMODITY: ${coo.commodityName}`,
    `PACKING: ${coo.packing}`,
    `COUNTRY OF ORIGIN: ${coo.countryOfOrigin}`,
  ].join("\n");
  const descH = doc.font(fVal).fontSize(fsVal).heightOfString(descText, { width: GDesc - pad * 2 });
  const dataH = Math.max(descH + pad * 4, 60);
  const dataY = hdrY + hdrH;

  doc.rect(x, dataY, GMarks, dataH).lineWidth(bw).stroke("#000000");
  doc.rect(x + GMarks, dataY, GDesc, dataH).lineWidth(bw).stroke("#000000");
  doc.rect(x + GMarks + GDesc, dataY, GQty, dataH).lineWidth(bw).stroke("#000000");
  doc.rect(x + GMarks + GDesc + GQty, dataY, GRem, dataH).lineWidth(bw).stroke("#000000");

  doc.font("Helvetica").fontSize(fsVal).fillColor("#000000")
    .text(descText, x + GMarks + pad, dataY + pad, { width: GDesc - pad * 2, lineGap: 1 });
  doc.font(fVal).fontSize(fsVal)
    .text(coo.quantityMT || " ", x + GMarks + GDesc + pad, dataY + pad, { width: GQty - pad * 2 });
  doc.font("Helvetica").fontSize(fsLbl)
    .text("METRIC TONS", x + GMarks + GDesc + pad, dataY + pad + 12, { width: GQty - pad * 2 });

  doc.y = dataY + dataH;
  doc.moveDown(0.3);

  // ── CERTIFICATION SECTION ──
  const certStartY = doc.y;
  const certTextContent = `IT IS HEREBY CERTIFIED THAT TO THE BEST OF OUR KNOWLEDGE AND BELIEF THE ABOVE MENTIONED GOODS ARE OF ${coo.countryOfOrigin || "_______________"} ORIGIN.`;
  const certH = doc.font("Helvetica").fontSize(fsVal).heightOfString(certTextContent, { width: W - pad * 2 }) + 60;

  doc.rect(x, certStartY, W, certH).lineWidth(bw).stroke("#000000");
  doc.font(fVal).fontSize(10).fillColor("#000000")
    .text("CERTIFICATION", x + pad, certStartY + pad, { width: W - pad * 2 });
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(fsVal)
    .text(certTextContent, x + pad, certStartY + 22, { width: W - pad * 2, lineGap: 1.5 });

  doc.y = certStartY + certH;
  doc.moveDown(1);
}

function buildNcndaSignatoryDocx(content: string): Table {
  const partyAMatch = content.match(/1\.\s+([^\n,]+),\s*a company/);
  const partyBMatch = content.match(/2\.\s+([^\n,]+),\s*a company/);
  const partyA = partyAMatch ? partyAMatch[1].trim() : "";
  const partyB = partyBMatch ? partyBMatch[1].trim() : "";
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const rows = [
    ["For and on behalf of Party A:", "For and on behalf of Party B:"],
    [partyA, partyB],
    ["Name: ___________________________", "Name: ___________________________"],
    ["Title: __________________________", "Title: __________________________"],
    [`Date: ${today}`, `Date: ${today}`],
    ["Signature: ______________________", "Signature: ______________________"],
    ["(who by their signature hereto warrants their authority)", "(who by their signature hereto warrants their authority)"],
  ];
  const noBorder = { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } };
  return new Table({
    rows: rows.map(([left, right]) => new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: left, size: 20, font: "Calibri", bold: left.startsWith("For ") })], spacing: { before: 40, after: 40 } })],
          borders: noBorder,
          width: { size: 5000, type: WidthType.DXA },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: right, size: 20, font: "Calibri", bold: right.startsWith("For ") })], spacing: { before: 40, after: 40 } })],
          borders: noBorder,
          width: { size: 5000, type: WidthType.DXA },
        }),
      ],
    })),
    width: { size: 10000, type: WidthType.DXA },
  });
}

function buildNcndaDocx(content: string): (Paragraph | Table)[] {
  const sanitized = sanitizeUnicode(content);
  const witnessIdx = sanitized.indexOf("IN WITNESS WHEREOF");
  const bodyContent = witnessIdx > -1 ? sanitized.substring(0, witnessIdx).trim() : sanitized;
  const children: (Paragraph | Table)[] = buildGenericDocx(bodyContent);
  children.push(new Paragraph({
    children: [new TextRun({ text: "IN WITNESS WHEREOF, the Parties hereto execute this Agreement by their authorised representatives.", size: 20, font: "Calibri" })],
    spacing: { before: 200, after: 200 },
  }));
  children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "333333" } }, spacing: { after: 100 } }));
  children.push(buildNcndaSignatoryDocx(content));
  children.push(new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 2, color: "333333" } }, spacing: { before: 100 } }));
  return children;
}

function buildNcndaPdf(doc: PDFKit.PDFDocument, content: string, leftMargin: number, pageWidth: number) {
  const sanitized = sanitizeUnicode(content);
  const witnessIdx = sanitized.indexOf("IN WITNESS WHEREOF");
  const bodyContent = witnessIdx > -1 ? sanitized.substring(0, witnessIdx).trim() : sanitized;
  buildGenericPdf(doc, bodyContent, leftMargin, pageWidth);

  pdfCheckPage(doc, 120);
  doc.moveDown(0.8);
  doc.font("Helvetica").fontSize(9).text("IN WITNESS WHEREOF, the Parties hereto execute this Agreement by their authorised representatives.", leftMargin, doc.y, { width: pageWidth });
  doc.moveDown(0.6);
  doc.moveTo(leftMargin, doc.y).lineTo(leftMargin + pageWidth, doc.y).stroke("#333333");
  doc.moveDown(0.5);

  const partyAMatch = content.match(/1\.\s+([^\n,]+),\s*a company/);
  const partyBMatch = content.match(/2\.\s+([^\n,]+),\s*a company/);
  const partyA = partyAMatch ? partyAMatch[1].trim() : "";
  const partyB = partyBMatch ? partyBMatch[1].trim() : "";
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const halfW = Math.floor(pageWidth / 2) - 5;
  const rightX = leftMargin + Math.floor(pageWidth / 2) + 5;

  const sigLines: [string, string][] = [
    ["For and on behalf of Party A:", "For and on behalf of Party B:"],
    [partyA, partyB],
    ["Name: ___________________________", "Name: ___________________________"],
    ["Title: __________________________", "Title: __________________________"],
    [`Date: ${today}`, `Date: ${today}`],
    ["Signature: ______________________", "Signature: ______________________"],
    ["(who by their signature hereto warrants their authority)", "(who by their signature hereto warrants their authority)"],
  ];
  for (const [left, right] of sigLines) {
    pdfCheckPage(doc, 20);
    const y = doc.y;
    const isBold = left.startsWith("For ");
    const lh = doc.font(isBold ? "Helvetica-Bold" : "Helvetica").fontSize(9).heightOfString(left, { width: halfW });
    const rh = doc.font(isBold ? "Helvetica-Bold" : "Helvetica").fontSize(9).heightOfString(right, { width: halfW });
    doc.font(isBold ? "Helvetica-Bold" : "Helvetica").fontSize(9).text(left, leftMargin, y, { width: halfW });
    doc.font(isBold ? "Helvetica-Bold" : "Helvetica").fontSize(9).text(right, rightX, y, { width: halfW });
    doc.x = leftMargin;
    doc.y = y + Math.max(lh, rh) + 4;
  }
  doc.moveDown(0.3);
  doc.moveTo(leftMargin, doc.y).lineTo(leftMargin + pageWidth, doc.y).stroke("#333333");
}

interface LoiParsed {
  headerRows: { label: string; value: string }[];
  buyerRows: { label: string; value: string }[];
  paramRows: { sr: string; param: string; detail: string }[];
  specialNote: string;
  closingLines: string[];
  buyerSignatory: string;
}

function parseLoiContent(content: string): LoiParsed {
  const sanitized = sanitizeUnicode(content);
  const lines = sanitized.split("\n");
  const result: LoiParsed = { headerRows: [], buyerRows: [], paramRows: [], specialNote: "", closingLines: [], buyerSignatory: "" };

  let section: "pre" | "seller" | "buyer" | "table" | "note" | "closing" = "pre";
  let currentLabel = "";
  let currentValue = "";

  const flushHeader = () => {
    if (currentLabel) {
      if (section === "buyer") {
        result.buyerRows.push({ label: currentLabel, value: currentValue.trim() });
      } else {
        result.headerRows.push({ label: currentLabel, value: currentValue.trim() });
      }
      currentLabel = "";
      currentValue = "";
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "PURCHASE LETTER OF INTENT" || trimmed.match(/^={3,}$/)) continue;

    if (trimmed === "Issued to Seller") {
      section = "seller";
      continue;
    }
    if (trimmed === "Issued by Buyer") {
      flushHeader();
      section = "buyer";
      continue;
    }
    if (trimmed.match(/^-{3,}$/) && (section === "seller" || section === "buyer")) continue;

    if (section === "seller" || section === "buyer") {
      if (trimmed.match(/^={3,}$/) || (trimmed.includes("|") && trimmed.includes("Sr. No."))) {
        flushHeader();
        section = "table";
        continue;
      }

      const knownLabels = ["Attention (PIC)", "Ref", "LOI Issue No. and Date", "Valid Till", "Purchase Incoterms"];
      const matchedLabel = knownLabels.find(l => trimmed.startsWith(l));
      if (matchedLabel) {
        flushHeader();
        currentLabel = matchedLabel;
        currentValue = trimmed.substring(matchedLabel.length).trim();
        continue;
      }

      if (!currentLabel && trimmed && section === "seller") {
        currentLabel = "Seller";
        currentValue = (currentValue ? currentValue + "\n" : "") + trimmed;
      } else if (!currentLabel && trimmed && section === "buyer") {
        currentLabel = "Buyer";
        currentValue = (currentValue ? currentValue + "\n" : "") + trimmed;
      } else if (currentLabel) {
        currentValue = (currentValue ? currentValue + "\n" : "") + trimmed;
      }
      continue;
    }

    if (section === "table") {
      if (trimmed.match(/^[=-]{3,}$/)) continue;
      if (trimmed.includes("|") && trimmed.includes("Sr. No.")) continue;
      if (trimmed.includes("|")) {
        const cells = trimmed.split("|").map(c => c.trim());
        if (cells.length >= 3 && cells[0].match(/^\d{2}$/)) {
          result.paramRows.push({ sr: cells[0], param: cells[1], detail: cells.slice(2).join(" ").trim() });
        } else if (cells.length >= 3) {
          const lastParam = result.paramRows[result.paramRows.length - 1];
          if (lastParam) {
            const contParam = cells[1];
            const contDetail = cells.slice(2).join(" ").trim();
            if (contParam) {
              lastParam.param += (lastParam.param ? " " : "") + contParam;
            }
            if (contDetail) {
              lastParam.detail += (lastParam.detail ? "\n" : "") + contDetail;
            }
          }
        }
        continue;
      }
      if (trimmed.startsWith("SPECIAL NOTES")) {
        section = "note";
        continue;
      }
      if (trimmed.startsWith("We look forward") || trimmed.startsWith("With warm regards") || trimmed.startsWith("For & On Behalf")) {
        section = "closing";
        result.closingLines.push(trimmed);
        continue;
      }
      if (!trimmed) {
        section = "closing";
        continue;
      }
    }

    if (section === "note") {
      if (trimmed.startsWith("We look forward") || trimmed.startsWith("With warm regards") || trimmed.startsWith("For & On Behalf")) {
        section = "closing";
        result.closingLines.push(trimmed);
        continue;
      }
      if (trimmed) result.specialNote += (result.specialNote ? "\n" : "") + trimmed;
      continue;
    }

    if (section === "closing") {
      if (trimmed.startsWith("For & On Behalf")) {
        result.closingLines.push(trimmed);
        for (let j = i + 1; j < lines.length; j++) {
          const next = lines[j].trim();
          if (next && !next.match(/^[-=]{3,}$/)) {
            result.buyerSignatory = next;
            break;
          }
        }
        break;
      }
      if (trimmed) result.closingLines.push(trimmed);
      continue;
    }
  }
  flushHeader();
  return result;
}

function buildLoiDocx(content: string): (Paragraph | Table)[] {
  const loi = parseLoiContent(content);
  const children: (Paragraph | Table)[] = [];

  children.push(new Paragraph({
    children: [new TextRun({ text: "PURCHASE LETTER OF INTENT", bold: true, size: 28, font: "Calibri" })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: 200 },
  }));
  children.push(new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: "000000" } },
    spacing: { after: 200 },
  }));

  const headerLabel = (text: string) => new Paragraph({
    children: [new TextRun({ text, bold: true, size: 18, font: "Calibri", color: "555555" })],
    spacing: { before: 20, after: 20 },
  });
  const headerValue = (text: string) => new Paragraph({
    children: [new TextRun({ text, size: 18, font: "Calibri" })],
    spacing: { before: 20, after: 20 },
  });

  const buildHeaderTable = (title: string, rows: { label: string; value: string }[]) => {
    children.push(new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 20, font: "Calibri" })],
      spacing: { before: 200, after: 100 },
      shading: { type: ShadingType.SOLID, color: "F0F0F0" },
    }));
    const tableRows = rows.map(r => new TableRow({
      children: [
        new TableCell({
          children: [headerLabel(r.label)],
          width: { size: 2800, type: WidthType.DXA },
          shading: { type: ShadingType.SOLID, color: "F8F8F8" },
          borders: { top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" }, bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" }, left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" }, right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } },
        }),
        new TableCell({
          children: [headerValue(r.value)],
          width: { size: 6200, type: WidthType.DXA },
          borders: { top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" }, bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" }, left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" }, right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } },
        }),
      ],
    }));
    if (tableRows.length > 0) {
      children.push(new Table({ rows: tableRows, width: { size: 9000, type: WidthType.DXA } }));
    }
  };

  buildHeaderTable("Issued to Seller", loi.headerRows);
  buildHeaderTable("Issued by Buyer", loi.buyerRows);

  children.push(new Paragraph({ spacing: { before: 300 } }));
  const paramTableRows: TableRow[] = [];
  paramTableRows.push(new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: "Sr. No.", bold: true, size: 16, font: "Calibri" })], alignment: AlignmentType.CENTER, spacing: { before: 40, after: 40 } })],
        width: { size: 800, type: WidthType.DXA },
        shading: { type: ShadingType.SOLID, color: "E8E8E8" },
        borders: { top: { style: BorderStyle.SINGLE, size: 2, color: "333333" }, bottom: { style: BorderStyle.SINGLE, size: 2, color: "333333" }, left: { style: BorderStyle.SINGLE, size: 2, color: "333333" }, right: { style: BorderStyle.SINGLE, size: 1, color: "333333" } },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: "Parameters", bold: true, size: 16, font: "Calibri" })], spacing: { before: 40, after: 40 } })],
        width: { size: 2700, type: WidthType.DXA },
        shading: { type: ShadingType.SOLID, color: "E8E8E8" },
        borders: { top: { style: BorderStyle.SINGLE, size: 2, color: "333333" }, bottom: { style: BorderStyle.SINGLE, size: 2, color: "333333" }, left: { style: BorderStyle.SINGLE, size: 1, color: "333333" }, right: { style: BorderStyle.SINGLE, size: 1, color: "333333" } },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: "Details", bold: true, size: 16, font: "Calibri" })], spacing: { before: 40, after: 40 } })],
        width: { size: 5500, type: WidthType.DXA },
        shading: { type: ShadingType.SOLID, color: "E8E8E8" },
        borders: { top: { style: BorderStyle.SINGLE, size: 2, color: "333333" }, bottom: { style: BorderStyle.SINGLE, size: 2, color: "333333" }, left: { style: BorderStyle.SINGLE, size: 1, color: "333333" }, right: { style: BorderStyle.SINGLE, size: 2, color: "333333" } },
      }),
    ],
  }));

  for (const row of loi.paramRows) {
    const cellBorder = { top: { style: BorderStyle.SINGLE as const, size: 1, color: "CCCCCC" }, bottom: { style: BorderStyle.SINGLE as const, size: 1, color: "CCCCCC" }, left: { style: BorderStyle.SINGLE as const, size: 1, color: "CCCCCC" }, right: { style: BorderStyle.SINGLE as const, size: 1, color: "CCCCCC" } };
    paramTableRows.push(new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: row.sr, size: 16, font: "Calibri" })], alignment: AlignmentType.CENTER, spacing: { before: 30, after: 30 } })],
          width: { size: 800, type: WidthType.DXA },
          borders: cellBorder,
          verticalAlign: VerticalAlign.CENTER,
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: row.param, bold: true, size: 16, font: "Calibri", color: "555555" })], spacing: { before: 30, after: 30 } })],
          width: { size: 2700, type: WidthType.DXA },
          borders: cellBorder,
          verticalAlign: VerticalAlign.CENTER,
        }),
        new TableCell({
          children: (row.detail || "").split("\n").map((ln, i, arr) => new Paragraph({
            children: [new TextRun({ text: ln, size: 16, font: "Calibri" })],
            spacing: { before: i === 0 ? 30 : 0, after: i === arr.length - 1 ? 30 : 0 },
          })),
          width: { size: 5500, type: WidthType.DXA },
          borders: cellBorder,
          verticalAlign: VerticalAlign.CENTER,
        }),
      ],
    }));
  }
  children.push(new Table({ rows: paramTableRows, width: { size: 9000, type: WidthType.DXA } }));

  if (loi.specialNote) {
    children.push(new Paragraph({ spacing: { before: 400 } }));
    children.push(new Paragraph({
      children: [new TextRun({ text: "SPECIAL NOTES", bold: true, size: 20, font: "Calibri" })],
      spacing: { before: 200, after: 120 },
    }));
    children.push(new Paragraph({
      children: [new TextRun({ text: loi.specialNote, size: 18, font: "Calibri" })],
      spacing: { after: 200 },
    }));
  }

  const skipPatterns = /^(AUTHORISED SIGNATORY|Name:|Title:|Date:|Signature:|For & On Behalf)/i;
  children.push(new Paragraph({ spacing: { before: 500 } }));
  let issuerName = loi.buyerSignatory;
  for (const line of loi.closingLines) {
    if (skipPatterns.test(line)) continue;
    const isItalic = line.startsWith("We look forward") || line.startsWith("With warm regards");
    children.push(new Paragraph({
      children: [new TextRun({ text: line, size: 18, font: "Calibri", italics: isItalic })],
      spacing: { after: isItalic ? 200 : 80 },
    }));
    if (!isItalic && line.trim()) issuerName = line;
  }

  children.push(new Paragraph({ spacing: { before: 100 } }));
  children.push(new Paragraph({
    children: [new TextRun({ text: "Digital Signature:", size: 16, font: "Calibri", color: "555555" })],
    spacing: { after: 60 },
  }));
  children.push(new Paragraph({
    border: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
    },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text: " ", size: 18 })],
  }));
  children.push(new Paragraph({
    border: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
    },
    spacing: { before: 0, after: 0 },
    children: [new TextRun({ text: " ", size: 18 })],
  }));
  children.push(new Paragraph({
    border: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
    },
    spacing: { before: 0, after: 40 },
    children: [new TextRun({ text: " ", size: 18 })],
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: `Date: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`, size: 16, font: "Calibri", color: "555555" })],
    spacing: { before: 80, after: 200 },
  }));

  return children;
}

function buildLoiPdf(doc: PDFKit.PDFDocument, content: string, leftMargin: number, pageWidth: number) {
  const loi = parseLoiContent(content);

  doc.font("Helvetica-Bold").fontSize(16).text("PURCHASE LETTER OF INTENT", leftMargin, doc.y, { width: pageWidth, align: "center" });
  doc.moveDown(0.3);
  doc.moveTo(leftMargin, doc.y).lineTo(leftMargin + pageWidth, doc.y).lineWidth(2).stroke("#333333");
  doc.moveDown(0.8);

  const drawHeaderSection = (title: string, rows: { label: string; value: string }[]) => {
    pdfCheckPage(doc, 80);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#333333").text(title, leftMargin, doc.y, { width: pageWidth });
    doc.moveDown(0.3);
    const col1W = 130;
    const col2W = pageWidth - col1W;
    for (const row of rows) {
      pdfCheckPage(doc, 20);
      const rowY = doc.y;
      doc.rect(leftMargin, rowY, col1W, 18).fill("#F8F8F8").stroke("#CCCCCC");
      doc.rect(leftMargin + col1W, rowY, col2W, 18).stroke("#CCCCCC");
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#555555").text(row.label, leftMargin + 4, rowY + 4, { width: col1W - 8 });
      doc.font("Helvetica").fontSize(7).fillColor("#000000").text(row.value, leftMargin + col1W + 4, rowY + 4, { width: col2W - 8 });
      doc.y = rowY + 18;
    }
    doc.moveDown(0.5);
  };

  drawHeaderSection("Issued to Seller", loi.headerRows);
  drawHeaderSection("Issued by Buyer", loi.buyerRows);

  doc.moveDown(0.5);
  pdfCheckPage(doc, 40);

  const srW = 40;
  const paramW = 120;
  const detailW = pageWidth - srW - paramW;
  const headerRowH = 18;

  let tableY = doc.y;
  doc.rect(leftMargin, tableY, pageWidth, headerRowH).fill("#E8E8E8").stroke("#333333");
  doc.font("Helvetica-Bold").fontSize(7).fillColor("#333333");
  doc.text("Sr. No.", leftMargin + 2, tableY + 5, { width: srW - 4, align: "center" });
  doc.text("Parameters", leftMargin + srW + 4, tableY + 5, { width: paramW - 8 });
  doc.text("Details", leftMargin + srW + paramW + 4, tableY + 5, { width: detailW - 8 });
  doc.y = tableY + headerRowH;

  for (const row of loi.paramRows) {
    pdfCheckPage(doc, 22);
    const rowY = doc.y;
    const textH = Math.max(16, doc.heightOfString(row.detail, { width: detailW - 8 }) + 8);
    doc.rect(leftMargin, rowY, srW, textH).stroke("#CCCCCC");
    doc.rect(leftMargin + srW, rowY, paramW, textH).stroke("#CCCCCC");
    doc.rect(leftMargin + srW + paramW, rowY, detailW, textH).stroke("#CCCCCC");
    doc.font("Helvetica").fontSize(7).fillColor("#000000");
    doc.text(row.sr, leftMargin + 2, rowY + 4, { width: srW - 4, align: "center" });
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#555555");
    doc.text(row.param, leftMargin + srW + 4, rowY + 4, { width: paramW - 8 });
    doc.font("Helvetica").fontSize(7).fillColor("#000000");
    doc.text(row.detail, leftMargin + srW + paramW + 4, rowY + 4, { width: detailW - 8 });
    doc.y = rowY + textH;
  }

  doc.moveTo(leftMargin, doc.y).lineTo(leftMargin + pageWidth, doc.y).lineWidth(2).stroke("#333333");
  doc.moveDown(0.8);

  if (loi.specialNote) {
    doc.moveDown(1.2);
    pdfCheckPage(doc, 50);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000").text("SPECIAL NOTES", leftMargin, doc.y);
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(8).text(loi.specialNote, leftMargin, doc.y, { width: pageWidth });
    doc.moveDown(1);
  }

  const pdfSkipPatterns = /^(AUTHORISED SIGNATORY|Name:|Title:|Date:|Signature:|For & On Behalf)/i;
  doc.moveDown(1.5);
  for (const line of loi.closingLines) {
    if (pdfSkipPatterns.test(line)) continue;
    pdfCheckPage(doc, 20);
    if (line.startsWith("We look forward") || line.startsWith("With warm regards")) {
      doc.font("Helvetica-Oblique").fontSize(8).fillColor("#000000").text(line, leftMargin, doc.y, { width: pageWidth });
      doc.moveDown(0.8);
    } else {
      doc.font("Helvetica").fontSize(8).fillColor("#000000").text(line, leftMargin, doc.y, { width: pageWidth });
      doc.moveDown(0.4);
    }
  }

  pdfCheckPage(doc, 80);
  doc.font("Helvetica").fontSize(7).fillColor("#555555").text("Digital Signature:", leftMargin, doc.y);
  doc.moveDown(0.3);
  const boxX = leftMargin;
  const boxY = doc.y;
  const boxW = 200;
  const boxH = 50;
  doc.rect(boxX, boxY, boxW, boxH).stroke("#CCCCCC");
  doc.y = boxY + boxH + 8;
  doc.font("Helvetica").fontSize(7).fillColor("#555555")
    .text(`Date: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`, leftMargin, doc.y);
  doc.moveDown(1);
}

const DISCLAIMER_TEXT =
  "DISCLAIMER: The information contained in this document may be privileged and/or confidential, and is intended only for the use of the person to whom it is addressed. If the reader of this message is not the intended recipient (or such recipient's employee or agent), you are hereby notified not to read, distribute, use or copy this document or the materials attached. If you have received this document in error, please notify the sender and delete the document from your computer. In compliance with regulatory requirements, all messages sent to or from this server are archived and may be read by someone other than the recipient. This document has been scanned for viruses and malware, and may have been automatically archived by Bullfrog Group.";

function buildFooterParagraphs(submittedBy?: string, agentCode?: string): Paragraph[] {
  const out: Paragraph[] = [
    new Paragraph({ spacing: { before: 600 } }),
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 1, color: "999999" } },
      spacing: { before: 200, after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({ text: DISCLAIMER_TEXT, italics: true, size: 14, font: "Calibri", color: "666666" })],
      spacing: { after: 60 },
    }),
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" } },
      spacing: { before: 60, after: 40 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "Issued by Bullex Trading Platform", italics: true, size: 16, font: "Calibri", color: "666666" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    }),
  ];
  if (submittedBy) {
    out.push(new Paragraph({
      children: [new TextRun({ text: `Generated by: ${submittedBy}`, italics: true, size: 14, font: "Calibri", color: "666666" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    }));
  }
  if (agentCode) {
    out.push(new Paragraph({
      children: [new TextRun({ text: `Agent Code: ${agentCode}`, bold: true, size: 14, font: "Calibri", color: "333333" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    }));
  }
  return out;
}

export async function generateDocx(docId: string, title: string, content: string, submittedBy?: string, agentCode?: string): Promise<string> {
  assertSafeDocId(docId);
  let children: (Paragraph | Table)[];

  if (isTfrContent(content)) {
    children = buildTfrDocx(content);
  } else if (isDealRecapContent(content)) {
    children = buildDealRecapDocx(content);
  } else if (isLoiContent(content)) {
    children = buildLoiDocx(content);
  } else if (isNcndaContent(content)) {
    children = buildNcndaDocx(content);
  } else if (isBlContent(content)) {
    children = buildBlDocx(content);
  } else if (isCooContent(content)) {
    children = buildCooDocx(content);
  } else if (isCoaContent(content)) {
    children = buildCoaDocx(content);
  } else if (isCowContent(content)) {
    children = buildCowDocx(content);
  } else {
    children = buildGenericDocx(content);
  }

  children.push(...buildFooterParagraphs(submittedBy, agentCode));

  const doc = new DocxDocument({
    sections: [{ children }],
  });

  const buffer = await Packer.toBuffer(doc);
  const fileName = `${docId}.docx`;
  const filePath = path.join(docsDir, fileName);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

function buildGenericDocx(content: string): (Paragraph | Table)[] {
  const sections = parseContentToSections(content);
  const children: (Paragraph | Table)[] = [];

  let tableRows: TableRow[] = [];
  let tableColCount = 0;

  const flushTable = () => {
    if (tableRows.length > 0) {
      const colWidths = tableColCount === 2 ? [4000, 5000] :
        tableColCount === 4 ? [2500, 2500, 2500, 1500] : Array(tableColCount).fill(Math.floor(9000 / tableColCount));
      children.push(
        new Table({
          rows: tableRows,
          width: { size: 9000, type: WidthType.DXA },
          columnWidths: colWidths,
        })
      );
      tableRows = [];
      tableColCount = 0;
    }
  };

  for (const section of sections) {
    if (section.type === "table-row" && section.cells) {
      const isHeader = section.cells.every(c => c === c.replace(/[a-z]/g, "").trim() || c.includes("Item") || c.includes("Parameter") || c.includes("Specification") || c.includes("Limit"));
      tableColCount = Math.max(tableColCount, section.cells.length);
      tableRows.push(
        new TableRow({
          children: section.cells.map(cell =>
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({
                  text: cell,
                  bold: isHeader,
                  size: 18,
                  font: "Calibri",
                })],
                spacing: { before: 40, after: 40 },
              })],
              verticalAlign: VerticalAlign.CENTER,
              borders: thinBorder,
            })
          ),
        })
      );
    } else {
      flushTable();

      if (section.type === "heading") {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: section.text, bold: true, size: 28, font: "Calibri" })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 100 },
          })
        );
      } else if (section.type === "separator") {
        children.push(
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: "000000" } },
            spacing: { after: 200 },
          })
        );
      } else if (section.type === "subheading") {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: section.text, bold: true, size: 22, font: "Calibri" })],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 100 },
          })
        );
      } else if (section.text === "") {
        children.push(new Paragraph({ spacing: { before: 60, after: 60 } }));
      } else {
        const runs: TextRun[] = [];
        const parts = section.text.split(/(\*\*[^*]+\*\*)/g);
        for (const part of parts) {
          if (part.startsWith("**") && part.endsWith("**")) {
            runs.push(new TextRun({ text: part.slice(2, -2), bold: true, size: 20, font: "Calibri" }));
          } else {
            runs.push(new TextRun({ text: part, size: 20, font: "Calibri" }));
          }
        }
        children.push(new Paragraph({ children: runs, spacing: { before: 40, after: 40 } }));
      }
    }
  }
  flushTable();
  return children;
}

export async function generatePdf(docId: string, title: string, content: string, submittedBy?: string, agentCode?: string): Promise<string> {
  assertSafeDocId(docId);
  return new Promise((resolve, reject) => {
    const fileName = `${docId}.pdf`;
    const filePath = path.join(docsDir, fileName);
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const pageWidth = 495;
    const leftMargin = 50;

    if (isTfrContent(content)) {
      buildTfrPdf(doc, content, leftMargin, pageWidth);
    } else if (isDealRecapContent(content)) {
      buildDealRecapPdf(doc, content, leftMargin, pageWidth);
    } else if (isLoiContent(content)) {
      buildLoiPdf(doc, content, leftMargin, pageWidth);
    } else if (isNcndaContent(content)) {
      buildNcndaPdf(doc, content, leftMargin, pageWidth);
    } else if (isBlContent(content)) {
      buildBlPdf(doc, content, leftMargin, pageWidth);
    } else if (isCooContent(content)) {
      buildCooPdf(doc, content, leftMargin, pageWidth);
    } else if (isCoaContent(content)) {
      buildCoaPdf(doc, content, leftMargin, pageWidth);
    } else if (isCowContent(content)) {
      buildCowPdf(doc, content, leftMargin, pageWidth);
    } else {
      buildGenericPdf(doc, content, leftMargin, pageWidth);
    }

    addPdfFooter(doc, leftMargin, pageWidth, submittedBy);

    doc.end();
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}

function pdfCheckPage(doc: PDFKit.PDFDocument, minSpace: number = 60) {
  if (doc.y > 780 - minSpace) doc.addPage();
}

function drawPdf2ColTable(doc: PDFKit.PDFDocument, rows: [string, string][], left: number, totalWidth: number) {
  const col1W = Math.floor(totalWidth * 0.35);
  const col2W = totalWidth - col1W;
  const padding = 5;

  for (let i = 0; i < rows.length; i++) {
    const [item, desc] = rows[i];
    const isHeader = i === 0;
    const font = isHeader ? "Helvetica-Bold" : "Helvetica";
    const fontSize = 9;

    const itemH = doc.font(font).fontSize(fontSize).heightOfString(item, { width: col1W - padding * 2 });
    const descH = doc.font(isHeader ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize).heightOfString(desc || " ", { width: col2W - padding * 2 });
    const rowH = Math.max(itemH, descH) + padding * 2 + 2;

    pdfCheckPage(doc, rowH);
    const y = doc.y;

    if (isHeader) {
      doc.rect(left, y, totalWidth, rowH).fill("#F2F2F2").stroke("#999999");
    } else {
      doc.rect(left, y, col1W, rowH).stroke("#999999");
      doc.rect(left + col1W, y, col2W, rowH).stroke("#999999");
    }

    doc.fillColor("#000000");
    doc.font("Helvetica-Bold").fontSize(fontSize).text(item, left + padding, y + padding, { width: col1W - padding * 2 });

    doc.font(isHeader ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize).text(desc || "", left + col1W + padding, y + padding, { width: col2W - padding * 2 });

    doc.x = left;
    doc.y = y + rowH;
  }
}

function drawPdf4ColTable(doc: PDFKit.PDFDocument, rows: [string, string, string, string][], left: number, totalWidth: number) {
  const colW = [
    Math.floor(totalWidth * 0.24),
    Math.floor(totalWidth * 0.26),
    Math.floor(totalWidth * 0.26),
    totalWidth - Math.floor(totalWidth * 0.24) - Math.floor(totalWidth * 0.26) - Math.floor(totalWidth * 0.26),
  ];
  const padding = 4;

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i];
    const isHeader = i === 0;
    const font = isHeader ? "Helvetica-Bold" : "Helvetica";
    const fontSize = 8;

    let maxH = 16;
    for (let c = 0; c < 4; c++) {
      const h = doc.font(font).fontSize(fontSize).heightOfString(cells[c] || " ", { width: colW[c] - padding * 2 });
      maxH = Math.max(maxH, h);
    }
    const rowH = maxH + padding * 2 + 2;

    pdfCheckPage(doc, rowH);
    const y = doc.y;

    let x = left;
    for (let c = 0; c < 4; c++) {
      if (isHeader) {
        doc.rect(x, y, colW[c], rowH).fill("#F2F2F2").stroke("#999999");
      } else {
        doc.rect(x, y, colW[c], rowH).stroke("#999999");
      }
      doc.fillColor("#000000");
      doc.font(font).fontSize(fontSize).text(cells[c] || "", x + padding, y + padding, { width: colW[c] - padding * 2 });
      x += colW[c];
    }

    doc.x = left;
    doc.y = y + rowH;
  }
}

function drawPdfSignatoryBlock(doc: PDFKit.PDFDocument, sellerName: string, buyerName: string, sellerContact: string, buyerContact: string, dateStr: string, left: number, totalWidth: number) {
  const halfW = Math.floor(totalWidth / 2);
  const lines = [
    [`For and on behalf of the Seller:`, `For and on behalf of the Buyer:`],
    [sellerName, buyerName],
    [`Name: ${sellerContact}`, `Name: ${buyerContact}`],
    [`Authorised Signatory: _______________`, `Authorised Signatory: _______________`],
    [`Title: _______________`, `Title: _______________`],
    [`Date: ${dateStr}`, `Date: ${dateStr}`],
    ["", ""],
    [`Signature & Stamp:`, `Signature & Stamp:`],
  ];

  for (const [leftText, rightText] of lines) {
    pdfCheckPage(doc, 16);
    const y = doc.y;
    const isBold = leftText.startsWith("For ");
    doc.font(isBold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
    doc.text(leftText, left, y, { width: halfW });
    doc.text(rightText, left + halfW, y, { width: halfW });
    doc.x = left;
    doc.y = y + 14;
  }
}

function buildDealRecapPdf(doc: PDFKit.PDFDocument, content: string, leftMargin: number, pageWidth: number) {
  const d = extractDealRecapData(content);
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const agency = d.analysisAgency || "SGS, Intertek or Bureau Veritas";

  doc.font("Helvetica-Bold").fontSize(14).text("RECAP - COMMERCIAL TERMS CONFIRMATION", leftMargin, doc.y, { width: pageWidth, align: "center" });
  doc.moveDown(1);

  doc.font("Helvetica-Bold").fontSize(11).text("Chapter I - Introductory & Background", leftMargin, doc.y, { width: pageWidth });
  doc.moveDown(0.3);
  drawPdf2ColTable(doc, [
    ["Item", "Description"],
    ["Contract Reference", d.tradeRef || ""],
    ["Effective Date", "Date of last authorized signature"],
    ["Seller", d.sellerName || ""],
    ["Buyer", d.buyerName || ""],
    ["Legal Model of Contract", "Sales and Purchase Agreement (SPA)"],
    ["Recap Validity", d.recapValidity || "Valid for acceptance for five (5) calendar days from issuance, subject to Seller's confirmation and product availability."],
  ], leftMargin, pageWidth);
  doc.moveDown(0.8);

  pdfCheckPage(doc, 100);
  doc.font("Helvetica-Bold").fontSize(11).text("Chapter II - Scope & Commercial Terms", leftMargin, doc.y, { width: pageWidth });
  doc.moveDown(0.3);
  drawPdf2ColTable(doc, [
    ["Item", "Description"],
    ["Commodity", d.commodity || ""],
    ["Country of Origin", d.origin || ""],
    ["Quality / Specification", d.qualitySpecs || "As per Annex 1 - Product Specifications"],
    ["Delivery Basis", d.deliveryBasis || ""],
    ["Contractual Quantity", d.quantity || ""],
  ], leftMargin, pageWidth);
  doc.moveDown(0.8);

  pdfCheckPage(doc, 100);
  doc.font("Helvetica-Bold").fontSize(11).text("Chapter III - Financial & Operational Arrangements", leftMargin, doc.y, { width: pageWidth });
  doc.moveDown(0.3);
  drawPdf2ColTable(doc, [
    ["Item", "Description"],
    ["Contract Price & Currency", d.price || ""],
    ["Payment Terms", d.paymentTerms || ""],
    ["Loading Window", d.loadingWindow || ""],
    ["Shipping Terms", d.shippingTerms || ""],
  ], leftMargin, pageWidth);
  doc.moveDown(0.8);

  pdfCheckPage(doc, 100);
  doc.font("Helvetica-Bold").fontSize(11).text("Chapter IV - Miscellaneous & Boilerplate", leftMargin, doc.y, { width: pageWidth });
  doc.moveDown(0.3);
  drawPdf2ColTable(doc, [
    ["Item", "Description"],
    ["Governing Law & Jurisdiction", d.governingLaw || ""],
    ["Application of Industry Standards", "Applicable international industry standards and ICC rules"],
  ], leftMargin, pageWidth);
  doc.moveDown(1);

  pdfCheckPage(doc, 140);
  drawPdfSignatoryBlock(doc, d.sellerName || "", d.buyerName || "", d.sellerContact || "", d.buyerContact || "", today, leftMargin, pageWidth);
  doc.moveDown(1);

  doc.addPage();
  doc.font("Helvetica-Bold").fontSize(11).text("ANNEX I - PRODUCT SPECIFICATION, QUALITY ADJUSTMENT & SAMPLING", leftMargin, doc.y, { width: pageWidth });
  doc.moveDown(0.5);

  doc.font("Helvetica-Bold").fontSize(9).text(`Product: ${d.commodity || ""}`, leftMargin, doc.y, { width: pageWidth });
  doc.font("Helvetica").fontSize(9).text(`Grade: ${d.qualitySpecs || ""}`, leftMargin, doc.y, { width: pageWidth });
  doc.moveDown(0.5);

  doc.font("Helvetica").fontSize(9).text("The product supplied under this Contract shall comply with the following specifications. Guaranteed specifications represent binding commitments by the Seller. Typical specifications are provided for reference only and shall not constitute contractual guarantees.", leftMargin, doc.y, { width: pageWidth });
  doc.moveDown(0.5);

  doc.font("Helvetica-Bold").fontSize(9).text("PRODUCT SPECIFICATION", leftMargin, doc.y, { width: pageWidth });
  doc.moveDown(0.3);

  const specRows: [string, string, string, string][] = [
    ["Parameter", "Guaranteed Specification", "Typical Specification", "Rejection Limit"],
  ];

  if (d.annexSpecs) {
    const specLines = d.annexSpecs.split("\n");
    for (const line of specLines) {
      const cells = line.split("|").map(c => c.trim());
      if (cells.length >= 2) {
        specRows.push([cells[0] || "", cells[1] || "", cells[2] || "", cells[3] || ""]);
      }
    }
  } else {
    for (const p of ["Moisture", "Ash", "Volatile Matter", "Fixed Carbon", "Sulphur", "Calorific Value", "Size Distribution"]) {
      specRows.push([p, "", "", ""]);
    }
  }

  drawPdf4ColTable(doc, specRows, leftMargin, pageWidth);
  doc.moveDown(0.8);

  doc.x = leftMargin;
  doc.font("Helvetica-Bold").fontSize(9).text("QUALITY PREMIUMS AND PENALTIES:", leftMargin, doc.y, { width: pageWidth });
  doc.font("Helvetica").fontSize(9).text(d.qualityPremiums || "To be agreed between Buyer and Seller.", leftMargin, doc.y, { width: pageWidth });
  doc.moveDown(0.8);

  const textSections = [
    ["SAMPLING PROCEDURE", "Sampling shall be conducted during loading at the loading port following internationally recognized standards for sampling. Incremental samples shall be taken systematically and combined into representative composite samples. Sampling and sealing procedures shall be supervised and certified by the independent inspection company."],
    ["QUALITY DETERMINATION", `All quality determinations shall be performed by an internationally recognized inspection company such as ${agency} at the loading port. The inspection certificate issued at the loading port shall be final and binding for both Parties.`],
    ["SAMPLE RETENTION", "One representative sealed sample shall be retained by the inspection company for ninety (90) days for reference in case of dispute."],
    ["MOISTURE DETERMINATION", "Moisture content shall be determined at the loading port based on laboratory analysis of representative composite samples. The moisture value determined at the loading port shall be the contractual moisture value for the cargo. Any determination at the discharge port shall be for reference only and shall not affect commercial settlement."],
    ["QUANTITY AND WEIGHT DETERMINATION", `The quantity of the cargo shall be determined at the loading port by draft survey conducted by an independent inspection company such as ${agency}. The draft survey certificate issued at the loading port shall determine the official shipped quantity and shall be final and binding for both Parties. The quantity stated in the Bill of Lading and confirmed by the draft survey certificate shall be the contractual quantity for invoicing and settlement purposes.`],
  ];

  for (const [heading, body] of textSections) {
    pdfCheckPage(doc, 60);
    doc.x = leftMargin;
    doc.font("Helvetica-Bold").fontSize(9).text(heading, leftMargin, doc.y, { width: pageWidth });
    doc.font("Helvetica").fontSize(9).text(body, leftMargin, doc.y, { width: pageWidth, lineGap: 2 });
    doc.moveDown(0.5);
  }
}

function buildGenericPdf(doc: PDFKit.PDFDocument, content: string, leftMargin: number, pageWidth: number) {
  const sections = parseContentToSections(content);

  let pendingTableRows: { cells: string[]; isHeader: boolean }[] = [];

  const flushPdfTable = () => {
    if (pendingTableRows.length === 0) return;
    const maxCols = Math.max(...pendingTableRows.map(r => r.cells.length));

    const rows: [string, string, string, string][] | [string, string][] = pendingTableRows.map(r => {
      while (r.cells.length < maxCols) r.cells.push("");
      return r.cells as any;
    });

    if (maxCols === 2) {
      drawPdf2ColTable(doc, rows as [string, string][], leftMargin, pageWidth);
    } else if (maxCols >= 4) {
      drawPdf4ColTable(doc, rows as [string, string, string, string][], leftMargin, pageWidth);
    } else {
      for (const row of pendingTableRows) {
        doc.font(row.isHeader ? "Helvetica-Bold" : "Helvetica").fontSize(9).text(row.cells.join("  |  "), leftMargin, doc.y, { width: pageWidth });
      }
    }

    pendingTableRows = [];
    doc.x = leftMargin;
    doc.moveDown(0.3);
  };

  for (const section of sections) {
    if (section.type === "table-row" && section.cells) {
      const isHeader = section.cells.some(c => c.includes("Item") || c.includes("Parameter") || c.includes("Description") || c.includes("Specification") || c.includes("Limit"));
      pendingTableRows.push({ cells: section.cells, isHeader });
    } else {
      flushPdfTable();
      doc.x = leftMargin;

      if (section.type === "heading") {
        doc.moveDown(0.5);
        doc.font("Helvetica-Bold").fontSize(14).text(section.text, leftMargin, doc.y, { width: pageWidth, align: "center" });
        doc.moveDown(0.3);
      } else if (section.type === "separator") {
        doc.moveDown(0.2);
        const y = doc.y;
        doc.moveTo(leftMargin, y).lineTo(leftMargin + pageWidth, y).stroke("#333333");
        doc.moveDown(0.4);
      } else if (section.type === "subheading") {
        doc.moveDown(0.6);
        doc.font("Helvetica-Bold").fontSize(11).text(section.text, leftMargin, doc.y, { width: pageWidth });
        doc.moveDown(0.2);
      } else if (section.text === "") {
        doc.moveDown(0.2);
      } else {
        doc.font("Helvetica").fontSize(9).text(section.text, leftMargin, doc.y, { width: pageWidth, lineGap: 2 });
      }

      if (doc.y > 730) {
        doc.addPage();
      }
    }
  }
  flushPdfTable();
}

export function getDocFilePath(filePath: string): string | null {
  if (!filePath || typeof filePath !== "string") return null;
  if (!isInsideDocsDir(filePath)) return null;
  const resolved = path.resolve(filePath);
  if (fs.existsSync(resolved)) return resolved;
  return null;
}

function base64ToBuffer(dataUri: string): Buffer {
  const base64 = dataUri.split(",")[1];
  return Buffer.from(base64, "base64");
}

function fmtSignedDateTime(d?: Date): string | null {
  if (!d) return null;
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "UTC" });
  return `${date} ${time} UTC`;
}

function addSignatureBlockPdf(
  doc: PDFKit.PDFDocument,
  leftMargin: number,
  pageWidth: number,
  buyerSig?: string,
  sellerSig?: string,
  buyerName?: string,
  sellerName?: string,
  buyerSignedAt?: Date,
  sellerSignedAt?: Date,
  docType?: string,
  buyerSignedIp?: string,
  sellerSignedIp?: string,
) {
  if (doc.y > 580) doc.addPage();
  doc.moveDown(1);

  const topY = doc.y;
  doc.font("Helvetica-Bold").fontSize(10).text("DIGITAL SIGNATURE", leftMargin, topY, { width: pageWidth, align: "center" });
  doc.moveDown(0.5);
  const lineY = doc.y;
  doc.moveTo(leftMargin, lineY).lineTo(leftMargin + pageWidth, lineY).stroke("#333333");
  doc.moveDown(0.8);

  const isNcnda = docType === "NCNDA";

  if (isNcnda) {
    const halfW = Math.floor(pageWidth / 2) - 10;
    const rightX = leftMargin + Math.floor(pageWidth / 2) + 10;
    const sigStartY = doc.y;

    doc.font("Helvetica-Bold").fontSize(9).text("PARTY A (ISSUER)", leftMargin, sigStartY, { width: halfW });
    doc.font("Helvetica-Bold").fontSize(9).text("PARTY B (RECEIVING PARTY)", rightX, sigStartY, { width: halfW });

    const labelY = sigStartY + 18;

    if (sellerSig) {
      try {
        const sigBuf = base64ToBuffer(sellerSig);
        doc.image(sigBuf, leftMargin, labelY, { width: 150, height: 60 });
      } catch (e) {}
    }
    if (buyerSig) {
      try {
        const sigBuf = base64ToBuffer(buyerSig);
        doc.image(sigBuf, rightX, labelY, { width: 150, height: 60 });
      } catch (e) {}
    }

    const nameY = labelY + 65;
    doc.font("Helvetica").fontSize(8);

    if (sellerName) {
      doc.text(`Name: ${sellerName}`, leftMargin, nameY, { width: halfW });
      const sellerDt = fmtSignedDateTime(sellerSignedAt);
      if (sellerDt) doc.text(`Signed: ${sellerDt}`, leftMargin, nameY + 12, { width: halfW });
      if (sellerSignedIp) doc.text(`IP: ${sellerSignedIp}`, leftMargin, nameY + 24, { width: halfW });
    } else {
      doc.text("Name: _______________", leftMargin, nameY, { width: halfW });
      doc.text("Signed: _______________", leftMargin, nameY + 12, { width: halfW });
      doc.text("IP: _______________", leftMargin, nameY + 24, { width: halfW });
    }

    if (buyerName) {
      doc.text(`Name: ${buyerName}`, rightX, nameY, { width: halfW });
      const buyerDt = fmtSignedDateTime(buyerSignedAt);
      if (buyerDt) doc.text(`Signed: ${buyerDt}`, rightX, nameY + 12, { width: halfW });
      if (buyerSignedIp) doc.text(`IP: ${buyerSignedIp}`, rightX, nameY + 24, { width: halfW });
    } else {
      doc.text("Name: _______________", rightX, nameY, { width: halfW });
      doc.text("Signed: _______________", rightX, nameY + 12, { width: halfW });
      doc.text("IP: _______________", rightX, nameY + 24, { width: halfW });
    }

    doc.y = nameY + 42;
  } else {
    const sigStartY = doc.y;
    doc.font("Helvetica-Bold").fontSize(9).text("FOR & ON BEHALF OF BUYER / ISSUER", leftMargin, sigStartY, { width: pageWidth });
    const labelY = sigStartY + 18;

    if (buyerSig) {
      try {
        const sigBuf = base64ToBuffer(buyerSig);
        doc.image(sigBuf, leftMargin, labelY, { width: 150, height: 60 });
      } catch (e) {}
    }

    const nameY = labelY + 65;
    doc.font("Helvetica").fontSize(8);

    if (buyerName) {
      doc.text(`Name: ${buyerName}`, leftMargin, nameY, { width: pageWidth });
      const buyerDt = fmtSignedDateTime(buyerSignedAt);
      if (buyerDt) doc.text(`Signed: ${buyerDt}`, leftMargin, nameY + 12, { width: pageWidth });
      if (buyerSignedIp) doc.text(`IP: ${buyerSignedIp}`, leftMargin, nameY + 24, { width: pageWidth });
    } else {
      doc.text("Name: _______________", leftMargin, nameY, { width: pageWidth });
      doc.text("Signed: _______________", leftMargin, nameY + 12, { width: pageWidth });
      doc.text("IP: _______________", leftMargin, nameY + 24, { width: pageWidth });
    }

    doc.y = nameY + 42;
  }
}

function addPdfFooter(doc: PDFKit.PDFDocument, leftMargin: number, pageWidth: number, submittedBy?: string, agentCode?: string) {
  const disclaimerH = doc.font("Helvetica-Oblique").fontSize(7).heightOfString(DISCLAIMER_TEXT, { width: pageWidth });
  if (doc.y > 750 - disclaimerH - 40) doc.addPage();
  doc.moveDown(1.5);
  const lineY = doc.y;
  doc.moveTo(leftMargin, lineY).lineTo(leftMargin + pageWidth, lineY).stroke("#999999");
  doc.moveDown(0.5);
  doc.font("Helvetica-Oblique").fontSize(7).fillColor("#555555")
    .text(DISCLAIMER_TEXT, leftMargin, doc.y, { width: pageWidth, lineGap: 1 });
  doc.moveDown(0.5);
  doc.moveTo(leftMargin, doc.y).lineTo(leftMargin + pageWidth, doc.y).stroke("#DDDDDD");
  doc.moveDown(0.3);
  doc.font("Helvetica-Oblique").fontSize(8).fillColor("#666666")
    .text("Issued by Bullex Trading Platform", leftMargin, doc.y, { width: pageWidth, align: "center" });
  if (submittedBy) {
    doc.moveDown(0.2);
    doc.font("Helvetica-Oblique").fontSize(7).fillColor("#666666")
      .text(`Generated by: ${submittedBy}`, leftMargin, doc.y, { width: pageWidth, align: "center" });
  }
  if (agentCode) {
    doc.moveDown(0.2);
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#333333")
      .text(`Agent Code: ${agentCode}`, leftMargin, doc.y, { width: pageWidth, align: "center" });
  }
}

function buildSignatureDocxParagraphs(
  buyerSig?: string,
  sellerSig?: string,
  buyerName?: string,
  sellerName?: string,
  buyerSignedAt?: Date,
  sellerSignedAt?: Date,
  docType?: string,
  buyerSignedIp?: string,
  sellerSignedIp?: string,
): (Paragraph | Table)[] {
  const items: (Paragraph | Table)[] = [];

  items.push(new Paragraph({ spacing: { before: 400 } }));
  items.push(new Paragraph({
    children: [new TextRun({ text: "DIGITAL SIGNATURE", bold: true, size: 22, font: "Calibri" })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "333333" } },
  }));

  const isNcnda = docType === "NCNDA";
  const noBorder = { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } };

  if (isNcnda) {
    const makeCell = (children: (Paragraph | Table)[]): TableCell => new TableCell({
      children,
      borders: noBorder,
      width: { size: 5000, type: WidthType.DXA },
    });
    const leftChildren: (Paragraph | Table)[] = [
      new Paragraph({ children: [new TextRun({ text: "PARTY A (ISSUER)", bold: true, size: 18, font: "Calibri" })], spacing: { after: 80 } }),
    ];
    if (sellerSig) {
      try {
        leftChildren.push(new Paragraph({ children: [new ImageRun({ data: base64ToBuffer(sellerSig), transformation: { width: 160, height: 65 }, type: "png" })], spacing: { after: 60 } }));
      } catch (e) {}
    }
    leftChildren.push(new Paragraph({ children: [new TextRun({ text: `Name: ${sellerName || "_______________"}`, size: 18, font: "Calibri" })], spacing: { after: 40 } }));
    leftChildren.push(new Paragraph({ children: [new TextRun({ text: `Signed: ${fmtSignedDateTime(sellerSignedAt) || "_______________"}`, size: 18, font: "Calibri" })], spacing: { after: 40 } }));
    leftChildren.push(new Paragraph({ children: [new TextRun({ text: `IP: ${sellerSignedIp || "_______________"}`, size: 18, font: "Calibri" })] }));

    const rightChildren: (Paragraph | Table)[] = [
      new Paragraph({ children: [new TextRun({ text: "PARTY B (RECEIVING PARTY)", bold: true, size: 18, font: "Calibri" })], spacing: { after: 80 } }),
    ];
    if (buyerSig) {
      try {
        rightChildren.push(new Paragraph({ children: [new ImageRun({ data: base64ToBuffer(buyerSig), transformation: { width: 160, height: 65 }, type: "png" })], spacing: { after: 60 } }));
      } catch (e) {}
    }
    rightChildren.push(new Paragraph({ children: [new TextRun({ text: `Name: ${buyerName || "_______________"}`, size: 18, font: "Calibri" })], spacing: { after: 40 } }));
    rightChildren.push(new Paragraph({ children: [new TextRun({ text: `Signed: ${fmtSignedDateTime(buyerSignedAt) || "_______________"}`, size: 18, font: "Calibri" })], spacing: { after: 40 } }));
    rightChildren.push(new Paragraph({ children: [new TextRun({ text: `IP: ${buyerSignedIp || "_______________"}`, size: 18, font: "Calibri" })] }));

    items.push(new Table({
      rows: [new TableRow({ children: [makeCell(leftChildren), makeCell(rightChildren)] })],
      width: { size: 10000, type: WidthType.DXA },
    }));
  } else {
    items.push(new Paragraph({
      children: [new TextRun({ text: "FOR & ON BEHALF OF BUYER / ISSUER", bold: true, size: 18, font: "Calibri" })],
      spacing: { after: 100 },
    }));
    if (buyerSig) {
      try {
        items.push(new Paragraph({
          children: [new ImageRun({ data: base64ToBuffer(buyerSig), transformation: { width: 180, height: 70 }, type: "png" })],
          spacing: { after: 60 },
        }));
      } catch (e) {}
    }
    items.push(new Paragraph({
      children: [new TextRun({ text: `Name: ${buyerName || "_______________"}`, size: 18, font: "Calibri" })],
      spacing: { after: 40 },
    }));
    items.push(new Paragraph({
      children: [new TextRun({ text: `Signed: ${fmtSignedDateTime(buyerSignedAt) || "_______________"}`, size: 18, font: "Calibri" })],
      spacing: { after: 40 },
    }));
    items.push(new Paragraph({
      children: [new TextRun({ text: `IP: ${buyerSignedIp || "_______________"}`, size: 18, font: "Calibri" })]
    }));
  }

  return items;
}

export async function regenerateWithSignatures(
  docId: string,
  title: string,
  content: string,
  buyerSig?: string,
  sellerSig?: string,
  buyerName?: string,
  sellerName?: string,
  buyerSignedAt?: Date,
  sellerSignedAt?: Date,
  docType?: string,
  submittedBy?: string,
  buyerSignedIp?: string,
  sellerSignedIp?: string,
  agentCode?: string,
): Promise<{ docxPath: string; pdfPath: string }> {
  assertSafeDocId(docId);
  let docxChildren: (Paragraph | Table)[];
  if (isTfrContent(content)) {
    docxChildren = buildTfrDocx(content);
  } else if (isDealRecapContent(content)) {
    docxChildren = buildDealRecapDocx(content);
  } else if (isLoiContent(content)) {
    docxChildren = buildLoiDocx(content);
  } else if (isNcndaContent(content)) {
    docxChildren = buildNcndaDocx(content);
  } else if (isBlContent(content)) {
    docxChildren = buildBlDocx(content);
  } else if (isCooContent(content)) {
    docxChildren = buildCooDocx(content);
  } else if (isCoaContent(content)) {
    docxChildren = buildCoaDocx(content);
  } else {
    docxChildren = buildGenericDocx(content);
  }

  if (buyerSig || sellerSig) {
    docxChildren.push(...buildSignatureDocxParagraphs(buyerSig, sellerSig, buyerName, sellerName, buyerSignedAt, sellerSignedAt, docType, buyerSignedIp, sellerSignedIp));
  }

  docxChildren.push(...buildFooterParagraphs(submittedBy, agentCode));

  const docxDoc = new DocxDocument({ sections: [{ children: docxChildren }] });
  const buffer = await Packer.toBuffer(docxDoc);
  const docxPath = path.join(docsDir, `${docId}.docx`);
  fs.writeFileSync(docxPath, buffer);

  const pdfPath = await new Promise<string>((resolve, reject) => {
    const filePath = path.join(docsDir, `${docId}.pdf`);
    const pdfDoc = new PDFDocument({ size: "A4", margin: 50 });
    const stream = fs.createWriteStream(filePath);
    pdfDoc.pipe(stream);
    const pageWidth = 495;
    const leftMargin = 50;

    if (isTfrContent(content)) {
      buildTfrPdf(pdfDoc, content, leftMargin, pageWidth);
    } else if (isDealRecapContent(content)) {
      buildDealRecapPdf(pdfDoc, content, leftMargin, pageWidth);
    } else if (isLoiContent(content)) {
      buildLoiPdf(pdfDoc, content, leftMargin, pageWidth);
    } else if (isNcndaContent(content)) {
      buildNcndaPdf(pdfDoc, content, leftMargin, pageWidth);
    } else if (isBlContent(content)) {
      buildBlPdf(pdfDoc, content, leftMargin, pageWidth);
    } else if (isCooContent(content)) {
      buildCooPdf(pdfDoc, content, leftMargin, pageWidth);
    } else if (isCoaContent(content)) {
      buildCoaPdf(pdfDoc, content, leftMargin, pageWidth);
    } else if (isCowContent(content)) {
      buildCowPdf(pdfDoc, content, leftMargin, pageWidth);
    } else {
      buildGenericPdf(pdfDoc, content, leftMargin, pageWidth);
    }

    if (buyerSig || sellerSig) {
      addSignatureBlockPdf(pdfDoc, leftMargin, pageWidth, buyerSig, sellerSig, buyerName, sellerName, buyerSignedAt, sellerSignedAt, docType, buyerSignedIp, sellerSignedIp);
    }

    addPdfFooter(pdfDoc, leftMargin, pageWidth, submittedBy, agentCode);

    pdfDoc.end();
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });

  return { docxPath, pdfPath };
}


// ─────────────────────────────────────────────────────────────────────
// KYC APPLICATION PDF
// ─────────────────────────────────────────────────────────────────────

interface KycPdfSection {
  title: string;
  rows: [string, string][];
}

function buildKycSections(kyc: any): KycPdfSection[] {
  const v = (x: any) => (x === null || x === undefined || x === "" ? "—" : String(x));
  return [
    {
      title: "1. Company Identification",
      rows: [
        ["Company Name", v(kyc.companyName)],
        ["Registered Address", v(kyc.registeredAddress)],
        ["Primary Business Address", v(kyc.primaryBusinessAddress)],
        ["Date of Incorporation", v(kyc.dateOfIncorporation)],
        ["Country of Incorporation", v(kyc.countryOfIncorporation)],
        ["Country of Operation", v(kyc.countryOfOperation)],
        ["Registration Number", v(kyc.registrationNumber)],
        ["Tax ID Number", v(kyc.taxIdNumber)],
        ["Business Type", v(kyc.businessType)],
        ["Website", v(kyc.website)],
      ],
    },
    {
      title: "2. Business Profile",
      rows: [
        ["Core Business", v(kyc.coreBusinessDescription)],
        ["Ultimate Beneficial Owners", v(kyc.ultimateBeneficialOwners)],
        ["Shareholders", v(kyc.shareholders)],
        ["Management Structure", v(kyc.managementStructure)],
        ["Subsidiaries", v(kyc.subsidiaries)],
        ["Listing Information", v(kyc.listingInfo)],
      ],
    },
    {
      title: "3. Financial Information",
      rows: [
        ["Share Capital", v(kyc.shareCapital)],
        ["Capital Range", v(kyc.capitalRange)],
        ["Reporting Currency", v(kyc.financialCurrency)],
        ["Sales Revenue", v(kyc.salesRevenue)],
        ["Net Income", v(kyc.netIncome)],
        ["Total Equity", v(kyc.totalEquity)],
        ["Total Balance Sheet", v(kyc.totalBalanceSheet)],
        ["Last Reporting Period", v(kyc.lastReportingPeriod)],
        ["External Auditors", v(kyc.externalAuditors)],
      ],
    },
    {
      title: "4. Banking Details",
      rows: [
        ["Bank Name", v(kyc.bankName)],
        ["Bank Branch", v(kyc.bankBranch)],
        ["Bank Address", v(kyc.bankAddress)],
        ["Account Name", v(kyc.accountName)],
        ["Account Number", v(kyc.accountNumber)],
        ["SWIFT Code", v(kyc.swiftCode)],
        ["Account Currency", v(kyc.bankAccountCurrency)],
        ["Bank Officer Name", v(kyc.bankOfficerName)],
        ["Bank Officer Email", v(kyc.bankOfficerEmail)],
      ],
    },
    {
      title: "5. Workforce",
      rows: [
        ["Employees (Company)", v(kyc.employeesCompany)],
        ["Employees (Group)", v(kyc.employeesGroup)],
        ["Previous Bullfrog Employee", v(kyc.previousBullfrogEmployee)],
      ],
    },
    {
      title: "6. AML & Compliance",
      rows: [
        ["Subject to AML Regulation", v(kyc.amlSubject)],
        ["AML Conformity Program", v(kyc.amlConformityProgram)],
        ["AML Regulator", v(kyc.amlRegulator)],
        ["AML Law / Reference", v(kyc.amlLawName)],
        ["Reasons for Documents", v(kyc.documentReasons)],
      ],
    },
    {
      title: "7. Primary Contact",
      rows: [
        ["Contact Name", v(kyc.contactName)],
        ["Contact Title", v(kyc.contactTitle)],
        ["Contact Phone", v(kyc.contactPhone)],
        ["Contact Email", v(kyc.contactEmail)],
        ["Fax Number", v(kyc.faxNumber)],
      ],
    },
    {
      title: "8. Authorised Signatory",
      rows: [
        ["Signatory Name", v(kyc.signatoryName)],
        ["Signatory Title", v(kyc.signatoryTitle)],
        ["Signatory Company", v(kyc.signatoryCompany)],
        ["Signatory Email", v(kyc.signatoryEmail)],
        ["Place & Date", v(kyc.signatoryPlaceDate)],
      ],
    },
    {
      title: "9. Submission Metadata",
      rows: [
        ["Filled By (Name)", v(kyc.filledByName)],
        ["Filled By (Email)", v(kyc.filledByEmail)],
        ["Status", v(kyc.status).toUpperCase()],
        ["Category", v(kyc.category)],
        ["Products", v(kyc.products)],
        ["Submitted At", kyc.createdAt ? new Date(kyc.createdAt).toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC" : "—"],
        ["Application ID", v(kyc.id)],
      ],
    },
    ...(kyc.blockchainHash
      ? [{
          title: "10. Blockchain Verification",
          rows: [
            ["Block Number", v(kyc.blockNumber)],
            ["Nonce", v(kyc.nonce)],
            ["Block Hash", v(kyc.blockchainHash)],
            ["Previous Hash", v(kyc.previousHash)],
          ] as [string, string][],
        }]
      : []),
  ];
}

export async function generateKycApplicationPdf(
  kyc: any,
  kycDocs: { documentType: string; originalName: string }[] | undefined,
  submittedBy?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const fileName = `kyc_${kyc.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`;
    const filePath = path.join(docsDir, fileName);
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const pageWidth = 495;
    const leftMargin = 50;

    // Header
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#990000")
      .text("BULLEX TRADING PLATFORM", leftMargin, 50, { width: pageWidth, align: "center" });
    doc.font("Helvetica").fontSize(9).fillColor("#666666")
      .text("A proprietary platform of Bullfrog Group", leftMargin, doc.y + 2, { width: pageWidth, align: "center" });
    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#000000")
      .text("KYC APPLICATION FORM", leftMargin, doc.y, { width: pageWidth, align: "center" });
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(9).fillColor("#444444")
      .text(`${kyc.companyName || "—"}  •  Application #${kyc.id?.slice(0, 8) || "—"}`, leftMargin, doc.y, { width: pageWidth, align: "center" });
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(8).fillColor("#888888")
      .text(`Generated: ${new Date().toLocaleString("en-GB", { timeZone: "UTC" })} UTC`, leftMargin, doc.y, { width: pageWidth, align: "center" });
    doc.moveDown(0.5);
    doc.moveTo(leftMargin, doc.y).lineTo(leftMargin + pageWidth, doc.y).lineWidth(1.5).stroke("#990000");
    doc.moveDown(0.8);

    // Sections
    const sections = buildKycSections(kyc);
    for (const section of sections) {
      pdfCheckPage(doc, 80);
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#990000")
        .text(section.title, leftMargin, doc.y, { width: pageWidth });
      doc.moveDown(0.3);
      drawPdf2ColTable(doc, section.rows, leftMargin, pageWidth);
      doc.moveDown(0.6);
    }

    // Uploaded documents
    if (kycDocs && kycDocs.length > 0) {
      pdfCheckPage(doc, 80);
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#990000")
        .text("Supporting Documents on File", leftMargin, doc.y, { width: pageWidth });
      doc.moveDown(0.3);
      const rows: [string, string][] = [["Document Type", "File Name"], ...kycDocs.map((d) => [d.documentType, d.originalName] as [string, string])];
      drawPdf2ColTable(doc, rows, leftMargin, pageWidth);
      doc.moveDown(0.6);
    }

    // Bullfrog tagline (bold)
    doc.moveDown(0.6);
    pdfCheckPage(doc, 60);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#990000")
      .text("Bullex is a proprietary platform of Bullfrog Group.", leftMargin, doc.y, { width: pageWidth, align: "center" });
    doc.moveDown(0.3);

    addPdfFooter(doc, leftMargin, pageWidth, submittedBy, agentCode);
    doc.end();
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}

// ─────────────────────────────────────────────────────────────────────
// BLANK KYC APPLICATION FORM PDF (printable / fill-by-hand)
// ─────────────────────────────────────────────────────────────────────

const BLANK_KYC_SECTIONS: { title: string; rows: { label: string; lines?: number }[] }[] = [
  { title: "1. Company Identification", rows: [
    { label: "Company Name" }, { label: "Registered Address", lines: 2 },
    { label: "Primary Business Address", lines: 2 }, { label: "Date of Incorporation" },
    { label: "Country of Incorporation" }, { label: "Country of Operation" },
    { label: "Registration Number" }, { label: "Tax ID Number" },
    { label: "Business Type" }, { label: "Website" },
  ]},
  { title: "2. Business Profile", rows: [
    { label: "Core Business Description", lines: 3 },
    { label: "Ultimate Beneficial Owners", lines: 2 },
    { label: "Shareholders", lines: 2 }, { label: "Management Structure", lines: 2 },
    { label: "Subsidiaries", lines: 2 }, { label: "Listing Information" },
  ]},
  { title: "3. Financial Information", rows: [
    { label: "Share Capital" }, { label: "Capital Range" },
    { label: "Reporting Currency" }, { label: "Sales Revenue" },
    { label: "Net Income" }, { label: "Total Equity" },
    { label: "Total Balance Sheet" }, { label: "Last Reporting Period" },
    { label: "External Auditors" },
  ]},
  { title: "4. Banking Details", rows: [
    { label: "Bank Name" }, { label: "Bank Branch" },
    { label: "Bank Address", lines: 2 }, { label: "Account Name" },
    { label: "Account Number" }, { label: "SWIFT Code" },
    { label: "Account Currency" }, { label: "Bank Officer Name" },
    { label: "Bank Officer Email" },
  ]},
  { title: "5. Workforce", rows: [
    { label: "Employees (Company)" }, { label: "Employees (Group)" },
    { label: "Previous Bullfrog Employee (Yes / No)" },
  ]},
  { title: "6. AML & Compliance", rows: [
    { label: "Subject to AML Regulation (Yes / No)" }, { label: "AML Conformity Program" },
    { label: "AML Regulator" }, { label: "AML Law / Reference" },
    { label: "Reasons for Documents", lines: 2 },
  ]},
  { title: "7. Primary Contact", rows: [
    { label: "Contact Name" }, { label: "Contact Title" },
    { label: "Contact Phone" }, { label: "Contact Email" }, { label: "Fax Number" },
  ]},
  { title: "8. Authorised Signatory", rows: [
    { label: "Signatory Name" }, { label: "Signatory Title" },
    { label: "Signatory Company" }, { label: "Signatory Email" },
    { label: "Place & Date" },
    { label: "Signature", lines: 2 },
  ]},
];

function drawPdfBlankFormTable(doc: PDFKit.PDFDocument, rows: { label: string; lines?: number }[], left: number, totalWidth: number) {
  const col1W = Math.floor(totalWidth * 0.35);
  const col2W = totalWidth - col1W;
  const padding = 5;
  const lineHeight = 14;

  for (const row of rows) {
    const lineCount = Math.max(1, row.lines ?? 1);
    const rowH = lineCount * lineHeight + padding * 2 + 4;

    pdfCheckPage(doc, rowH + 6);
    const y = doc.y;

    doc.lineWidth(0.6);
    doc.rect(left, y, col1W, rowH).stroke("#999999");
    doc.rect(left + col1W, y, col2W, rowH).stroke("#999999");

    doc.fillColor("#000000").font("Helvetica-Bold").fontSize(9)
      .text(row.label, left + padding, y + padding, { width: col1W - padding * 2 });

    // dotted lines for handwriting
    doc.lineWidth(0.4).dash(1, { space: 2 }).strokeColor("#BBBBBB");
    for (let i = 0; i < lineCount; i++) {
      const lineY = y + padding + (i + 1) * lineHeight - 2;
      doc.moveTo(left + col1W + padding, lineY).lineTo(left + col1W + col2W - padding, lineY).stroke();
    }
    doc.undash().strokeColor("#999999").lineWidth(0.6);

    doc.x = left;
    doc.y = y + rowH;
  }
}

export async function generateBlankKycApplicationPdf(): Promise<string> {
  return new Promise((resolve, reject) => {
    const fileName = `kyc_blank_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`;
    const filePath = path.join(docsDir, fileName);
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const pageWidth = 495;
    const leftMargin = 50;

    // Header
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#990000")
      .text("BULLEX TRADING PLATFORM", leftMargin, 50, { width: pageWidth, align: "center" });
    doc.font("Helvetica").fontSize(9).fillColor("#666666")
      .text("A proprietary platform of Bullfrog Group", leftMargin, doc.y + 2, { width: pageWidth, align: "center" });
    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#000000")
      .text("KYC APPLICATION FORM", leftMargin, doc.y, { width: pageWidth, align: "center" });
    doc.moveDown(0.2);
    doc.font("Helvetica-Oblique").fontSize(9).fillColor("#444444")
      .text("To be completed and returned to the Bullex onboarding team.", leftMargin, doc.y, { width: pageWidth, align: "center" });
    doc.moveDown(0.5);
    doc.moveTo(leftMargin, doc.y).lineTo(leftMargin + pageWidth, doc.y).lineWidth(1.5).stroke("#990000");
    doc.moveDown(0.6);
    doc.font("Helvetica").fontSize(9).fillColor("#333333")
      .text("Please complete every section in BLOCK CAPITALS. Mark non-applicable fields with N/A. Attach supporting documents (incorporation certificate, financial statements, AML policy, etc.) when returning this form to team@bullex.tech.", leftMargin, doc.y, { width: pageWidth, align: "left" });
    doc.moveDown(0.6);

    for (const section of BLANK_KYC_SECTIONS) {
      pdfCheckPage(doc, 80);
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#990000")
        .text(section.title, leftMargin, doc.y, { width: pageWidth });
      doc.moveDown(0.3);
      drawPdfBlankFormTable(doc, section.rows, leftMargin, pageWidth);
      doc.moveDown(0.6);
    }

    doc.moveDown(0.5);
    pdfCheckPage(doc, 60);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#990000")
      .text("Bullex is a proprietary platform of Bullfrog Group.", leftMargin, doc.y, { width: pageWidth, align: "center" });
    doc.moveDown(0.3);

    addPdfFooter(doc, leftMargin, pageWidth);
    doc.end();
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}
