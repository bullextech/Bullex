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

function isLoiContent(content: string): boolean {
  return content.includes("PURCHASE LETTER OF INTENT") && content.includes("Issued to Seller") && content.includes("Sr. No.");
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
        } else if (cells.length >= 3 && cells.filter(c => c).length >= 2) {
          const lastParam = result.paramRows[result.paramRows.length - 1];
          if (lastParam) {
            lastParam.param += " " + cells[1];
            lastParam.detail += " " + cells.slice(2).join(" ").trim();
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
          children: [new Paragraph({ children: [new TextRun({ text: row.detail, size: 16, font: "Calibri" })], spacing: { before: 30, after: 30 } })],
          width: { size: 5500, type: WidthType.DXA },
          borders: cellBorder,
          verticalAlign: VerticalAlign.CENTER,
        }),
      ],
    }));
  }
  children.push(new Table({ rows: paramTableRows, width: { size: 9000, type: WidthType.DXA } }));

  if (loi.specialNote) {
    children.push(new Paragraph({ spacing: { before: 200 } }));
    children.push(new Paragraph({
      children: [new TextRun({ text: "SPECIAL NOTES", bold: true, size: 20, font: "Calibri" })],
      spacing: { before: 200, after: 100 },
    }));
    children.push(new Paragraph({
      children: [new TextRun({ text: loi.specialNote, size: 18, font: "Calibri" })],
      spacing: { after: 100 },
    }));
  }

  children.push(new Paragraph({ spacing: { before: 300 } }));
  for (const line of loi.closingLines) {
    children.push(new Paragraph({
      children: [new TextRun({ text: line, size: 18, font: "Calibri", italics: line.startsWith("We look forward") || line.startsWith("With warm regards") })],
      spacing: { after: 60 },
    }));
  }
  if (loi.buyerSignatory) {
    children.push(new Paragraph({
      children: [new TextRun({ text: loi.buyerSignatory, bold: true, size: 20, font: "Calibri" })],
      spacing: { before: 100, after: 100 },
    }));
  }

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
    pdfCheckPage(doc, 40);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000").text("SPECIAL NOTES", leftMargin, doc.y);
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(8).text(loi.specialNote, leftMargin, doc.y, { width: pageWidth });
    doc.moveDown(0.5);
  }

  doc.moveDown(0.5);
  for (const line of loi.closingLines) {
    pdfCheckPage(doc, 16);
    if (line.startsWith("We look forward") || line.startsWith("With warm regards")) {
      doc.font("Helvetica-Oblique").fontSize(8).fillColor("#000000").text(line, leftMargin, doc.y, { width: pageWidth });
    } else if (line.startsWith("For & On Behalf")) {
      doc.font("Helvetica-Bold").fontSize(8).text(line, leftMargin, doc.y, { width: pageWidth });
    } else {
      doc.font("Helvetica").fontSize(8).text(line, leftMargin, doc.y, { width: pageWidth });
    }
    doc.moveDown(0.3);
  }
  if (loi.buyerSignatory) {
    doc.font("Helvetica-Bold").fontSize(9).text(loi.buyerSignatory, leftMargin, doc.y, { width: pageWidth });
    doc.moveDown(0.5);
  }
}

function buildFooterParagraphs(): Paragraph[] {
  return [
    new Paragraph({ spacing: { before: 600 } }),
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 1, color: "999999" } },
      spacing: { before: 200, after: 60 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "Issued by Bullex Trading Platform", italics: true, size: 16, font: "Calibri", color: "666666" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    }),
  ];
}

export async function generateDocx(docId: string, title: string, content: string): Promise<string> {
  let children: (Paragraph | Table)[];

  if (isDealRecapContent(content)) {
    children = buildDealRecapDocx(content);
  } else if (isLoiContent(content)) {
    children = buildLoiDocx(content);
  } else {
    children = buildGenericDocx(content);
  }

  children.push(...buildFooterParagraphs());

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

export async function generatePdf(docId: string, title: string, content: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const fileName = `${docId}.pdf`;
    const filePath = path.join(docsDir, fileName);
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const pageWidth = 495;
    const leftMargin = 50;

    if (isDealRecapContent(content)) {
      buildDealRecapPdf(doc, content, leftMargin, pageWidth);
    } else if (isLoiContent(content)) {
      buildLoiPdf(doc, content, leftMargin, pageWidth);
    } else {
      buildGenericPdf(doc, content, leftMargin, pageWidth);
    }

    addPdfFooter(doc, leftMargin, pageWidth);

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
  if (filePath && fs.existsSync(filePath)) return filePath;
  return null;
}

function base64ToBuffer(dataUri: string): Buffer {
  const base64 = dataUri.split(",")[1];
  return Buffer.from(base64, "base64");
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
) {
  const halfWidth = Math.floor(pageWidth / 2) - 10;

  if (doc.y > 580) doc.addPage();
  doc.moveDown(1);

  const topY = doc.y;
  doc.font("Helvetica-Bold").fontSize(10).text("SIGNATURES", leftMargin, topY, { width: pageWidth, align: "center" });
  doc.moveDown(0.5);
  const lineY = doc.y;
  doc.moveTo(leftMargin, lineY).lineTo(leftMargin + pageWidth, lineY).stroke("#333333");
  doc.moveDown(0.8);

  const sigStartY = doc.y;

  doc.font("Helvetica-Bold").fontSize(9).text("FOR & ON BEHALF OF SELLER", leftMargin, sigStartY, { width: halfWidth });
  doc.font("Helvetica-Bold").fontSize(9).text("FOR & ON BEHALF OF BUYER", leftMargin + halfWidth + 20, sigStartY, { width: halfWidth });

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
      doc.image(sigBuf, leftMargin + halfWidth + 20, labelY, { width: 150, height: 60 });
    } catch (e) {}
  }

  const nameY = labelY + 65;
  doc.font("Helvetica").fontSize(8);

  if (sellerName) {
    doc.text(`Name: ${sellerName}`, leftMargin, nameY, { width: halfWidth });
    if (sellerSignedAt) {
      doc.text(`Date: ${sellerSignedAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`, leftMargin, nameY + 12, { width: halfWidth });
    }
  } else {
    doc.text("Name: _______________", leftMargin, nameY, { width: halfWidth });
    doc.text("Date: _______________", leftMargin, nameY + 12, { width: halfWidth });
  }

  if (buyerName) {
    doc.text(`Name: ${buyerName}`, leftMargin + halfWidth + 20, nameY, { width: halfWidth });
    if (buyerSignedAt) {
      doc.text(`Date: ${buyerSignedAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`, leftMargin + halfWidth + 20, nameY + 12, { width: halfWidth });
    }
  } else {
    doc.text("Name: _______________", leftMargin + halfWidth + 20, nameY, { width: halfWidth });
    doc.text("Date: _______________", leftMargin + halfWidth + 20, nameY + 12, { width: halfWidth });
  }

  doc.y = nameY + 30;
}

function addPdfFooter(doc: PDFKit.PDFDocument, leftMargin: number, pageWidth: number) {
  if (doc.y > 700) doc.addPage();
  doc.moveDown(2);
  const footerY = doc.y;
  doc.moveTo(leftMargin, footerY).lineTo(leftMargin + pageWidth, footerY).stroke("#999999");
  doc.moveDown(0.5);
  doc.font("Helvetica-Oblique").fontSize(8).fillColor("#666666")
    .text("Issued by Bullex Trading Platform", leftMargin, doc.y, { width: pageWidth, align: "center" });
}

function buildSignatureDocxParagraphs(
  buyerSig?: string,
  sellerSig?: string,
  buyerName?: string,
  sellerName?: string,
  buyerSignedAt?: Date,
  sellerSignedAt?: Date,
): (Paragraph | Table)[] {
  const items: (Paragraph | Table)[] = [];

  items.push(new Paragraph({ spacing: { before: 400 } }));
  items.push(new Paragraph({
    children: [new TextRun({ text: "SIGNATURES", bold: true, size: 22, font: "Calibri" })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "333333" } },
  }));

  const sellerChildren: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: "FOR & ON BEHALF OF SELLER", bold: true, size: 18, font: "Calibri" })],
      spacing: { after: 100 },
    }),
  ];
  if (sellerSig) {
    try {
      sellerChildren.push(new Paragraph({
        children: [new ImageRun({ data: base64ToBuffer(sellerSig), transformation: { width: 180, height: 70 }, type: "png" })],
        spacing: { after: 60 },
      }));
    } catch (e) {}
  }
  sellerChildren.push(new Paragraph({
    children: [new TextRun({ text: `Name: ${sellerName || "_______________"}`, size: 18, font: "Calibri" })],
    spacing: { after: 40 },
  }));
  if (sellerSignedAt) {
    sellerChildren.push(new Paragraph({
      children: [new TextRun({ text: `Date: ${sellerSignedAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`, size: 18, font: "Calibri" })],
    }));
  } else {
    sellerChildren.push(new Paragraph({
      children: [new TextRun({ text: "Date: _______________", size: 18, font: "Calibri" })],
    }));
  }

  const buyerChildren: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: "FOR & ON BEHALF OF BUYER", bold: true, size: 18, font: "Calibri" })],
      spacing: { after: 100 },
    }),
  ];
  if (buyerSig) {
    try {
      buyerChildren.push(new Paragraph({
        children: [new ImageRun({ data: base64ToBuffer(buyerSig), transformation: { width: 180, height: 70 }, type: "png" })],
        spacing: { after: 60 },
      }));
    } catch (e) {}
  }
  buyerChildren.push(new Paragraph({
    children: [new TextRun({ text: `Name: ${buyerName || "_______________"}`, size: 18, font: "Calibri" })],
    spacing: { after: 40 },
  }));
  if (buyerSignedAt) {
    buyerChildren.push(new Paragraph({
      children: [new TextRun({ text: `Date: ${buyerSignedAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`, size: 18, font: "Calibri" })],
    }));
  } else {
    buyerChildren.push(new Paragraph({
      children: [new TextRun({ text: "Date: _______________", size: 18, font: "Calibri" })],
    }));
  }

  items.push(new Table({
    rows: [new TableRow({
      children: [
        new TableCell({
          children: sellerChildren,
          width: { size: 4500, type: WidthType.DXA },
          borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
        }),
        new TableCell({
          children: buyerChildren,
          width: { size: 4500, type: WidthType.DXA },
          borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
        }),
      ],
    })],
    width: { size: 9000, type: WidthType.DXA },
  }));

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
): Promise<{ docxPath: string; pdfPath: string }> {
  let docxChildren: (Paragraph | Table)[];
  if (isDealRecapContent(content)) {
    docxChildren = buildDealRecapDocx(content);
  } else if (isLoiContent(content)) {
    docxChildren = buildLoiDocx(content);
  } else {
    docxChildren = buildGenericDocx(content);
  }

  if (buyerSig || sellerSig) {
    docxChildren.push(...buildSignatureDocxParagraphs(buyerSig, sellerSig, buyerName, sellerName, buyerSignedAt, sellerSignedAt));
  }

  docxChildren.push(...buildFooterParagraphs());

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

    if (isDealRecapContent(content)) {
      buildDealRecapPdf(pdfDoc, content, leftMargin, pageWidth);
    } else if (isLoiContent(content)) {
      buildLoiPdf(pdfDoc, content, leftMargin, pageWidth);
    } else {
      buildGenericPdf(pdfDoc, content, leftMargin, pageWidth);
    }

    if (buyerSig || sellerSig) {
      addSignatureBlockPdf(pdfDoc, leftMargin, pageWidth, buyerSig, sellerSig, buyerName, sellerName, buyerSignedAt, sellerSignedAt);
    }

    addPdfFooter(pdfDoc, leftMargin, pageWidth);

    pdfDoc.end();
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });

  return { docxPath, pdfPath };
}

