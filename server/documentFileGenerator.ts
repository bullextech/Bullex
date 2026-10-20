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
  Header,
  Footer,
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
} from "docx";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { getObjectBuffer } from "./object-files";
import { parseSpecBlobRows } from "./documentTemplates";

const docsDir = path.join(process.cwd(), "generated_docs");
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

// ─────────────────────────────────────────────────────────────────────
// DOCUMENT BRANDING LOGOS
// Two admin-configured logos (stored in Object Storage, referenced by the
// "document_logo" and "document_logo_secondary" app settings) brand every
// generated document: the Bullfrog logo (secondary) at the top/header and the
// Bullex logo (primary) at the bottom/footer.
// ─────────────────────────────────────────────────────────────────────
export const LOGO_SETTING_KEY = "document_logo";
export const LOGO_SECONDARY_SETTING_KEY = "document_logo_secondary";
// Optional full-page A4 letterhead (stationery). When set, it is drawn full-bleed
// behind the content on every page and REPLACES the small Bullfrog header logo;
// the Bullex footer logo still renders on top.
export const LOGO_LETTERHEAD_SETTING_KEY = "document_letterhead";
const BRANDING_CAT = "branding";
// Bold running tagline shown in the footer of every page of every generated
// document, alongside the Bullex logo.
const BRAND_TAGLINE = "Bullex is a proprietary platform of Bullfrog Group.";
// Declaration line rendered under the tagline on every page of every generated
// document (PDF and DOCX).
const DOC_DECLARATION = "This document is generated from the proprietary trading platform of Bullfrog and doesn't require any signature";
const logoBufferCache = new Map<string, Buffer>();
const logoPathCache = new Map<string, string>();

interface DocumentLogo {
  buffer: Buffer;
  width: number;
  height: number;
  kind: "png" | "jpg";
  // On-disk copy of the logo bytes. PDFKit only de-duplicates images that are
  // passed as a string path (Buffers are re-embedded on every draw), so the
  // per-page letterhead/footer must reference this path to avoid bloating
  // multi-page PDFs.
  path: string;
}

// Reads intrinsic pixel dimensions from a PNG or JPEG buffer (no external deps).
function readImageSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length >= 24 && buf.toString("ascii", 1, 4) === "PNG") {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) { offset++; continue; }
      const marker = buf[offset + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
      }
      if (offset + 3 >= buf.length) break;
      offset += 2 + buf.readUInt16BE(offset + 2);
    }
  }
  return null;
}

function imageKind(buf: Buffer): "png" | "jpg" | null {
  if (buf.length >= 4 && buf.toString("ascii", 1, 4) === "PNG") return "png";
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  return null;
}

async function getDocumentLogoByKey(settingKey: string): Promise<DocumentLogo | null> {
  try {
    const setting = await storage.getAppSetting(settingKey);
    if (!setting) return null;
    const meta = JSON.parse(setting.value) as { storedName?: string };
    if (!meta.storedName) return null;
    let buffer = logoBufferCache.get(meta.storedName);
    if (!buffer) {
      buffer = await getObjectBuffer(BRANDING_CAT, meta.storedName);
      logoBufferCache.set(meta.storedName, buffer);
    }
    const kind = imageKind(buffer);
    if (!kind) return null;
    const size = readImageSize(buffer) || { width: 300, height: 100 };
    let diskPath = logoPathCache.get(meta.storedName);
    if (!diskPath || !fs.existsSync(diskPath)) {
      // Harden against a malformed storedName escaping docsDir: strip any path
      // segments and assert the resolved file stays inside docsDir.
      const safeName = path.basename(String(meta.storedName));
      diskPath = path.join(docsDir, `.logo-${safeName}`);
      if (!path.resolve(diskPath).startsWith(path.resolve(docsDir) + path.sep)) {
        return null;
      }
      fs.writeFileSync(diskPath, buffer);
      logoPathCache.set(meta.storedName, diskPath);
    }
    return { buffer, width: size.width, height: size.height, kind, path: diskPath };
  } catch {
    return null;
  }
}

// Loads the branding logos used to top-and-tail every generated document:
// `header` = Bullfrog (secondary slot), `footer` = Bullex (primary slot).
// Either may be null when that slot has not been configured.
export async function getBrandingLogos(): Promise<{ header: DocumentLogo | null; footer: DocumentLogo | null; letterhead: DocumentLogo | null }> {
  const [footer, header, letterhead] = await Promise.all([
    getDocumentLogoByKey(LOGO_SETTING_KEY),
    getDocumentLogoByKey(LOGO_SECONDARY_SETTING_KEY),
    getDocumentLogoByKey(LOGO_LETTERHEAD_SETTING_KEY),
  ]);
  return { header, footer, letterhead };
}

// Scales a logo to fit within a bounding box while preserving aspect ratio.
function fitLogo(logo: DocumentLogo, maxW: number, maxH: number): { width: number; height: number } {
  const ratio = Math.min(maxW / logo.width, maxH / logo.height, 1);
  return { width: Math.max(1, Math.round(logo.width * ratio)), height: Math.max(1, Math.round(logo.height * ratio)) };
}

// Builds a single centered DOCX paragraph holding the header logo (Bullfrog).
function logoHeaderDocxParagraph(logo: DocumentLogo): Paragraph {
  const { width, height } = fitLogo(logo, 180, 70);
  return new Paragraph({
    children: [new ImageRun({ data: logo.buffer, transformation: { width, height }, type: logo.kind } as any)],
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
  });
}

// Bold running tagline paragraph shown in the DOCX footer of every page.
function taglineFooterDocxParagraph(): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: BRAND_TAGLINE, bold: true, size: 16 })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 20, after: 20 },
  });
}

// Declaration paragraph shown under the tagline in the DOCX footer of every page.
function declarationFooterDocxParagraph(): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: DOC_DECLARATION, italics: true, size: 14, color: "444444" })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 20 },
  });
}

// Builds a single centered DOCX paragraph holding the footer logo (Bullex).
function logoFooterDocxParagraph(logo: DocumentLogo): Paragraph {
  const { width, height } = fitLogo(logo, 150, 48);
  return new Paragraph({
    children: [new ImageRun({ data: logo.buffer, transformation: { width, height }, type: logo.kind } as any)],
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 40 },
  });
}

// PDF page geometry (A4) and the reserved bands for the repeating
// Bullfrog letterhead (top) and Bullex footer logo (bottom).
const PDF_LEFT = 50;
const PDF_PAGE_W = 495;
const PDF_PAGE_H = 841.89;
const PDF_FULL_W = 595.28; // full A4 width in points (for full-bleed letterhead)
const PDF_MARGINS = { top: 118, bottom: 95, left: PDF_LEFT, right: PDF_LEFT };

interface PdfBranding {
  header: DocumentLogo | null;
  footer: DocumentLogo | null;
  letterhead: DocumentLogo | null;
}

// Draws the page branding on the CURRENT page. When a full-page letterhead is
// configured it is drawn full-bleed behind the content and the small Bullfrog
// header logo is skipped; otherwise the Bullfrog header logo is drawn. The
// Bullex footer logo is always drawn (on top of the letterhead when present).
// Invoked from a PDFKit "pageAdded" handler so every page is branded.
// Restores the text cursor so document content is unaffected.
let brandingInProgress = false;
function drawPdfPageBranding(doc: PDFKit.PDFDocument, b: PdfBranding) {
  // Drawing the bottom tagline with the text engine could overflow the bottom
  // margin and auto-add a page, re-firing this pageAdded handler. Guard against
  // re-entrancy so that can never recurse.
  if (brandingInProgress) return;
  brandingInProgress = true;
  const sx = doc.x;
  const sy = doc.y;
  const savedBottom = doc.page.margins.bottom;
  doc.save();
  try {
    if (b.letterhead) {
      // Full-bleed A4 stationery behind everything else.
      doc.image(b.letterhead.path, 0, 0, { width: PDF_FULL_W, height: PDF_PAGE_H });
    } else if (b.header) {
      const { width, height } = fitLogo(b.header, 200, 52);
      doc.image(b.header.path, PDF_LEFT + (PDF_PAGE_W - width) / 2, 38, { width, height });
      doc.moveTo(PDF_LEFT, 102).lineTo(PDF_LEFT + PDF_PAGE_W, 102).lineWidth(0.5).strokeColor("#CCCCCC").stroke();
    }
    if (b.footer) {
      const { width, height } = fitLogo(b.footer, 130, 30);
      const fy = PDF_PAGE_H - 52 - height;
      if (!b.letterhead) {
        doc.moveTo(PDF_LEFT, fy - 8).lineTo(PDF_LEFT + PDF_PAGE_W, fy - 8).lineWidth(0.5).strokeColor("#CCCCCC").stroke();
      }
      doc.image(b.footer.path, PDF_LEFT + (PDF_PAGE_W - width) / 2, fy, { width, height });
    }
    // Bold running tagline at the very bottom of every page. Zero the bottom
    // margin so the text engine cannot overflow it and auto-add a page.
    doc.page.margins.bottom = 0;
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#000000")
      .text(BRAND_TAGLINE, PDF_LEFT, PDF_PAGE_H - 38, { width: PDF_PAGE_W, align: "center", lineBreak: false });
    doc.font("Helvetica-Oblique").fontSize(7).fillColor("#444444")
      .text(DOC_DECLARATION, PDF_LEFT, PDF_PAGE_H - 26, { width: PDF_PAGE_W, align: "center", lineBreak: false });
  } finally {
    // Always restore state so a draw failure (e.g. corrupt logo image) can never
    // leave the margin shifted or the re-entrancy guard stuck for later documents.
    doc.page.margins.bottom = savedBottom;
    doc.restore();
    doc.x = sx;
    doc.y = sy;
    brandingInProgress = false;
  }
}

// Creates a branded A4 PDFDocument: reserved margins for the per-page
// letterhead/footer, with a pageAdded handler that brands every page
// (including the first, thanks to autoFirstPage:false + addPage()).
function createBrandedPdf(b: PdfBranding): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margins: PDF_MARGINS, autoFirstPage: false });
  doc.on("pageAdded", () => drawPdfPageBranding(doc, b));
  doc.addPage();
  return doc;
}

// Builds a DOCX paragraph holding the full-page letterhead as a floating image
// anchored to the page and placed behind the document text, so it repeats on
// every page as full-bleed A4 stationery (794x1123px ≈ A4 at 96dpi).
function letterheadDocxParagraph(logo: DocumentLogo): Paragraph {
  return new Paragraph({
    children: [
      new ImageRun({
        data: logo.buffer,
        transformation: { width: 794, height: 1123 },
        type: logo.kind,
        floating: {
          horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
          verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
          behindDocument: true,
          allowOverlap: true,
        },
      } as any),
    ],
  });
}

// Builds DOCX section header/footer props so branding repeats on every page.
// When a full-page letterhead is set it is drawn full-bleed behind the text and
// replaces the small Bullfrog header logo; the Bullex footer logo still renders.
function brandedDocxSection(
  children: (Paragraph | Table)[],
  header: DocumentLogo | null,
  footer: DocumentLogo | null,
  letterhead: DocumentLogo | null,
): any {
  const section: any = {
    properties: {
      page: { margin: { top: 1850, right: 1440, bottom: 1700, left: 1440, header: 480, footer: 480 } },
    },
    children,
  };
  if (letterhead) {
    section.headers = { default: new Header({ children: [letterheadDocxParagraph(letterhead)] }) };
  } else if (header) {
    section.headers = { default: new Header({ children: [logoHeaderDocxParagraph(header)] }) };
  }
  const footerChildren: Paragraph[] = [];
  if (footer) footerChildren.push(logoFooterDocxParagraph(footer));
  footerChildren.push(taglineFooterDocxParagraph());
  footerChildren.push(declarationFooterDocxParagraph());
  section.footers = { default: new Footer({ children: footerChildren }) };
  return section;
}

// ─────────────────────────────────────────────────────────────────────
// GENERATED-DOCS CACHE PRUNING
// generated_docs/ is only a cache: every download regenerates the PDF/DOCX from
// the document content stored in the database. Without pruning the folder grows
// unboundedly (it once hit 1.5 GB / 2,000+ files and broke publishing because
// the workspace snapshot became too large to upload). pruneGeneratedDocsCache
// enforces both an age limit and a total-size budget; it is invoked at startup
// (after the port is bound) and then daily.
// ─────────────────────────────────────────────────────────────────────
const PRUNE_MAX_AGE_DAYS = 7;
const PRUNE_MAX_TOTAL_BYTES = 256 * 1024 * 1024; // 256 MB budget

export function pruneGeneratedDocsCache(opts?: { maxAgeDays?: number; maxTotalBytes?: number }): { deleted: number; freedBytes: number } {
  const maxAgeMs = (opts?.maxAgeDays ?? PRUNE_MAX_AGE_DAYS) * 24 * 60 * 60 * 1000;
  const maxTotalBytes = opts?.maxTotalBytes ?? PRUNE_MAX_TOTAL_BYTES;
  let deleted = 0;
  let freedBytes = 0;
  try {
    const now = Date.now();
    const entries: { path: string; size: number; mtimeMs: number }[] = [];
    for (const name of fs.readdirSync(docsDir)) {
      // `.logo-*` files back the on-disk logo path cache used by PDFKit image
      // de-duplication; they are tiny and rewritten lazily, but skipping them
      // avoids churning the in-memory logoPathCache mid-generation.
      if (name.startsWith(".")) continue;
      const filePath = path.join(docsDir, name);
      if (!isInsideDocsDir(filePath)) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(filePath);
      } catch {
        continue; // deleted concurrently
      }
      if (!stat.isFile()) continue;
      entries.push({ path: filePath, size: stat.size, mtimeMs: stat.mtimeMs });
    }

    const remove = (e: { path: string; size: number }) => {
      try {
        fs.unlinkSync(e.path);
        deleted++;
        freedBytes += e.size;
        return true;
      } catch {
        return false; // in use / already gone — leave it for the next run
      }
    };

    // Pass 1: age limit — anything not touched recently is stale cache.
    const kept: typeof entries = [];
    for (const e of entries) {
      if (now - e.mtimeMs > maxAgeMs) {
        if (!remove(e)) kept.push(e);
      } else {
        kept.push(e);
      }
    }

    // Pass 2: size budget — evict oldest-first until under budget.
    let totalBytes = kept.reduce((sum, e) => sum + e.size, 0);
    if (totalBytes > maxTotalBytes) {
      kept.sort((a, b) => a.mtimeMs - b.mtimeMs);
      for (const e of kept) {
        if (totalBytes <= maxTotalBytes) break;
        if (remove(e)) totalBytes -= e.size;
      }
    }
  } catch (err: any) {
    console.error("[docs-cache] prune failed:", err?.message || err);
  }
  return { deleted, freedBytes };
}

// Invalidates the cached logo bytes (call after an admin uploads/removes the logo).
export function clearLogoCache() {
  logoBufferCache.clear();
  logoPathCache.clear();
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
    // Standard PDF Helvetica has no mathematical inequality/minus glyphs.
    // ASCII equivalents preserve commercial limits instead of corrupting them.
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/−/g, "-")
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

export function extractDealRecapData(content: string): DealRecapData {
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
  type: ShadingType.SOLID,
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
  children.push(textPara("The product supplied under this Contract shall comply with the following specifications."));
  children.push(spacer());

  children.push(textPara("PRODUCT SPECIFICATION", true));

  const specRows: [string, string, string, string][] = [
    ["Parameter", "Specification", "Rejection", "Test Method"],
  ];

  if (d.annexSpecs) {
    const specLines = d.annexSpecs.split("\n");
    for (const line of specLines) {
      const cells = line.split("|").map(c => c.trim());
      if (cells.length >= 2) {
        specRows.push([cells[0] || "", cells[1] || "", cells[2] || "", cells[3] || ""]);
      }
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

function isDlcMt700Content(content: string): boolean {
  // Anchored to the template's opening line (not includes()) so other doc types
  // whose editable content merely mentions MT700 don't get routed here.
  return firstLine(content) === "DRAFT - SWIFT MT700" && /^:40A:/m.test(content);
}

function isPbgMt760Content(content: string): boolean {
  return firstLine(content) === "DRAFT - SWIFT MT760" && /^:77U:/m.test(content);
}

function firstLine(content: string): string {
  return content.trimStart().split(/\r?\n/, 1)[0].trim();
}

// SWIFT MT700/MT760 drafts: rendered as a monospace message block. The generic
// heuristics would mangle ":NN:" tag lines, so lines are emitted verbatim —
// headings bold, tag lines (:NN:/{n:) semi-bold, everything else plain Courier.
const DLC_HEADING_RE = /^(DRAFT - SWIFT MT7\d0|DOCUMENTARY CREDIT|IRREVOCABLE PERFORMANCE GUARANTEE|STATUS:.*|SWIFT MESSAGE)$/;
const DLC_TAG_RE = /^(:\d{2}[A-Z]?:|\{\d:|-\}$)/;

function buildDlcMt700Docx(content: string): (Paragraph | Table)[] {
  const lines = sanitizeUnicode(content).split("\n");
  const children: (Paragraph | Table)[] = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const trimmed = line.trim();
    if (DLC_HEADING_RE.test(trimmed)) {
      children.push(new Paragraph({
        children: [new TextRun({ text: trimmed, bold: true, size: trimmed.startsWith("DRAFT - SWIFT MT7") ? 22 : 18, font: "Courier New" })],
        spacing: { before: 120, after: 80 },
      }));
      continue;
    }
    children.push(new Paragraph({
      children: [new TextRun({ text: line, size: 16, font: "Courier New", bold: DLC_TAG_RE.test(trimmed) })],
      spacing: { after: 20 },
    }));
  }
  return children;
}

function buildDlcMt700Pdf(doc: PDFKit.PDFDocument, content: string, leftMargin: number, pageWidth: number) {
  const lines = sanitizeUnicode(content).split("\n");
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const trimmed = line.trim();
    if (!trimmed) { doc.moveDown(0.4); continue; }
    pdfCheckPage(doc, 14);
    if (DLC_HEADING_RE.test(trimmed)) {
      doc.font("Courier-Bold").fontSize(trimmed.startsWith("DRAFT - SWIFT MT7") ? 11 : 9).fillColor("#000000")
        .text(trimmed, leftMargin, doc.y, { width: pageWidth });
      doc.moveDown(0.3);
      continue;
    }
    doc.font(DLC_TAG_RE.test(trimmed) ? "Courier-Bold" : "Courier").fontSize(8).fillColor("#000000")
      .text(line, leftMargin, doc.y, { width: pageWidth });
  }
  doc.moveDown(1);
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
    const ncols = Math.max(2, ...tblBuf.map(r => r.length));
    const widths = ncols <= 2
      ? [6600, 3400]
      : ncols === 3
        ? [3600, 3200, 3200]
        : [2800, 2400, 2400, 2400];
    children.push(new Table({
      rows: tblBuf.map((cells, idx) => new TableRow({
        children: Array.from({ length: ncols }, (_, c) =>
          makeDocxCell(cells[c] || "", idx === 0, widths[c], idx === 0 ? headerShading : undefined),
        ),
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
  let tblBuf: string[][] = [];

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
    const ncols = Math.max(2, ...tblBuf.map(r => r.length));
    if (ncols >= 4) {
      drawPdf4ColTable(doc, tblBuf.map(r => [r[0] || "", r[1] || "", r[2] || "", r[3] || ""]), leftMargin, pageWidth);
    } else if (ncols === 3) {
      drawPdf3ColTable(doc, tblBuf.map(r => [r[0] || "", r[1] || "", r[2] || ""]), leftMargin, pageWidth);
    } else {
      drawPdf2ColTable(doc, tblBuf.map(r => [r[0] || "", r[1] || ""]), leftMargin, pageWidth);
    }
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

export function parseBlContent(content: string): BlData {
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

  const S = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
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

export function parseCoaContent(content: string): CoaData {
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

  const coaSpecRows = parseSpecBlobRows(coa.chemSpecs);
  if (coaSpecRows.length > 0) {
    ch.push(make4ColTable([["Parameter", "Specification", "Rejection", "Test Method"], ...coaSpecRows]));
  } else {
    for (const line of (coa.chemSpecs || "").split("\n")) {
      if (line.trim()) ch.push(p(line, { spaceAfter: 40 }));
    }
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

  const coaSpecRows = parseSpecBlobRows(coa.chemSpecs);
  if (coaSpecRows.length > 0) {
    drawPdf4ColTable(doc, [["Parameter", "Specification", "Rejection", "Test Method"], ...coaSpecRows], x, W);
  } else {
    for (const line of (coa.chemSpecs || "").split("\n")) {
      if (line.trim()) {
        pdfCheckPage(doc, 20);
        doc.font(mono).fontSize(8).text(line, x, doc.y);
      }
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

function isFobExportContent(content: string): boolean {
  return content.trimStart().startsWith("FOB EXPORT (SELL) PROCEDURE");
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

export function parseCowContent(content: string): CowData {
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
  const trimmed = content.trimStart();
  return (trimmed.startsWith("COMMERCIAL INVOICE") || trimmed.startsWith("PROFORMA INVOICE"))
    && content.includes("SELLER (BENEFICIARY)");
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

interface InvoiceSignature {
  data?: string;
  name?: string;
  signedAt?: Date;
  signedIp?: string;
}

function integerToEnglish(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "";
  if (value === 0) return "zero";
  const ones = [
    "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen",
  ];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const underThousand = (n: number): string => {
    const parts: string[] = [];
    if (n >= 100) {
      parts.push(`${ones[Math.floor(n / 100)]} hundred`);
      n %= 100;
    }
    if (n >= 20) {
      parts.push(tens[Math.floor(n / 10)]);
      n %= 10;
    }
    if (n > 0) parts.push(ones[n]);
    return parts.join(" ");
  };
  const scales: Array<[number, string]> = [
    [1_000_000_000_000, "trillion"],
    [1_000_000_000, "billion"],
    [1_000_000, "million"],
    [1_000, "thousand"],
  ];
  const parts: string[] = [];
  let remaining = Math.floor(value);
  for (const [scale, label] of scales) {
    if (remaining >= scale) {
      parts.push(`${underThousand(Math.floor(remaining / scale))} ${label}`);
      remaining %= scale;
    }
  }
  if (remaining > 0) parts.push(underThousand(remaining));
  return parts.join(" ");
}

export function invoiceAmountInWords(totalAmount: string, currency: string): string {
  const amount = Number(totalAmount.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(amount) || amount < 0) return `${currency} ${totalAmount}`;
  const whole = Math.floor(amount);
  const cents = Math.round((amount - whole) * 100);
  return `${currency} ${integerToEnglish(whole)}${cents ? ` and ${String(cents).padStart(2, "0")}/100` : ""} only`
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// Exported so tests can assert the CI template wording and this extraction
// stay in lockstep (label-coupling guard — see ci-field-extraction.test.ts).
export function parseCiContent(content: string): CiData {
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

function buildCiDocx(content: string, signature?: InvoiceSignature): (Paragraph | Table)[] {
  const ci = parseCiContent(content);
  const isPi = content.trimStart().startsWith("PROFORMA INVOICE");
  const lines = content.split("\n");
  const extractLine = (label: string) => {
    const line = lines.find((entry) => entry.trimStart().startsWith(`${label}:`));
    return line ? line.slice(line.indexOf(":") + 1).trim() : "_______________";
  };
  const spaReference = extractLine("SPA Reference");
  const validUntil = extractLine("Valid Until");
  const deliveryTerm = extractLine("Delivery Term");
  const shipmentWindow = extractLine("Shipment Window");
  const packing = extractLine("Packing");
  const children: (Paragraph | Table)[] = [];
  const single = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
  const borders = { top: single, bottom: single, left: single, right: single };

  const para = (
    text: string,
    opts: {
      bold?: boolean;
      size?: number;
      align?: (typeof AlignmentType)[keyof typeof AlignmentType];
      after?: number;
    } = {},
  ) => new Paragraph({
    children: [new TextRun({ text: text || " ", bold: opts.bold || false, size: opts.size || 14, font: "Arial" })],
    alignment: opts.align,
    spacing: { before: 0, after: opts.after ?? 20 },
  });

  const labeled = (label: string, value: string, compact = false): Paragraph[] => [
    para(label, { size: 11, after: compact ? 0 : 8 }),
    para(value || "_______________", { bold: true, size: 14, after: compact ? 4 : 12 }),
  ];

  const cell = (
    cellChildren: (Paragraph | Table)[],
    width: number,
    verticalAlign: typeof VerticalAlign.TOP | typeof VerticalAlign.CENTER | typeof VerticalAlign.BOTTOM = VerticalAlign.TOP,
  ) => new TableCell({
    children: cellChildren,
    borders,
    width: { size: width, type: WidthType.DXA },
    verticalAlign,
    margins: { top: 50, bottom: 50, left: 70, right: 70 },
  });

  const table = (columnWidths: number[], rows: TableRow[]) => new Table({
    width: { size: 9000, type: WidthType.DXA },
    columnWidths,
    rows,
  });

  children.push(table([9000], [
    new TableRow({
      children: [cell([
        para(isPi ? "PROFORMA INVOICE" : "COMMERCIAL INVOICE", {
          bold: true,
          size: 24,
          align: AlignmentType.CENTER,
          after: 0,
        }),
      ], 9000, VerticalAlign.CENTER)],
    }),
  ]));

  const half = 4500;
  const partyBlock = (label: string, name: string, address: string, contact: string): Paragraph[] => [
    para(label, { size: 11, after: 6 }),
    para(name, { bold: true, size: 15, after: 4 }),
    para(address, { bold: true, size: 13, after: 4 }),
    para(contact, { size: 12, after: 0 }),
  ];

  children.push(table([half, half], [
    new TableRow({
      children: [
        cell(partyBlock("Exporter", ci.sellerName, ci.sellerAddr, ci.sellerContact), half),
        cell([
          ...labeled("Invoice No. & Date", `${ci.invoiceNo}  |  ${ci.date}`, true),
          ...labeled(isPi ? "SPA / Contract Ref." : "Exporter's Ref.", isPi ? spaReference : ci.invoiceNo, true),
          ...labeled(isPi ? "Valid Until" : "LC No.", isPi ? validUntil : ci.lcNo, true),
        ], half),
      ],
    }),
  ]));

  children.push(table([half, half], [
    new TableRow({
      children: [
        cell(partyBlock("Consignee", ci.buyerName, ci.buyerAddr, ci.buyerContact), half),
        cell([
          ...labeled("Contract No.", isPi ? spaReference : ci.invoiceNo, true),
          ...labeled(isPi ? "Delivery Basis" : "LC Issuing Bank", isPi ? deliveryTerm : ci.lcBank, true),
        ], half),
      ],
    }),
  ]));

  children.push(table([half, half], [
    new TableRow({
      children: [
        cell(labeled("Country of Origin of Goods", ci.origin, true), half),
        cell(labeled("Country / Place of Final Destination", ci.portOfDischarge, true), half),
      ],
    }),
  ]));

  children.push(table([9000], [
    new TableRow({
      children: [cell(
        labeled(
          "Terms of Delivery and Payment",
          `${deliveryTerm}${deliveryTerm && ci.paymentTerms ? " — " : ""}${ci.paymentTerms}`,
          true,
        ),
        9000,
      )],
    }),
  ]));

  const transportCell = (labelA: string, valueA: string, labelB: string, valueB: string) => cell([
    ...labeled(labelA, valueA, true),
    ...labeled(labelB, valueB, true),
  ], half);
  children.push(table([half, half], [
    new TableRow({
      children: [
        transportCell(
          isPi ? "Shipment Window" : "Pre-Carriage By",
          isPi ? shipmentWindow : ci.voyage,
          "Name of Vessel",
          ci.vessel,
        ),
        transportCell("Place / Port of Loading", ci.portOfLoading, "Port of Discharge", ci.portOfDischarge),
      ],
    }),
  ]));

  const description: Paragraph[] = [
    ...labeled("Commodity", ci.commodity, true),
    ...labeled("Packing", packing, true),
    ...labeled("Country of Origin", ci.origin, true),
    ...labeled("Quantity", `${ci.quantity} MT`, true),
    ...labeled("Base Price", `${ci.currency} ${ci.unitPrice}/MT`, true),
    ...labeled("Tolerance", ci.tolerance, true),
  ];
  if (isPi) {
    description.push(...labeled("SPA Reference", spaReference, true));
    description.push(...labeled("Shipment Window", shipmentWindow, true));
  }
  description.push(...labeled("Payment Terms", ci.paymentTerms, true));

  const goodsWidths = [5400, 1200, 1200, 1200];
  const goodsHeader = (title: string, width: number) => cell([
    para(title, { bold: true, size: 12, align: AlignmentType.CENTER, after: 0 }),
  ], width, VerticalAlign.CENTER);
  const goodsValue = (value: string, width: number) => cell([
    para(value, { bold: true, size: 13, align: AlignmentType.CENTER, after: 0 }),
  ], width, VerticalAlign.CENTER);
  children.push(table(goodsWidths, [
    new TableRow({
      children: [
        goodsHeader("DESCRIPTION OF GOODS AND / OR SERVICES", goodsWidths[0]),
        goodsHeader("Quantity M/tonnes", goodsWidths[1]),
        goodsHeader(`Rate ${ci.currency}`, goodsWidths[2]),
        goodsHeader(`Amount ${ci.currency}`, goodsWidths[3]),
      ],
    }),
    new TableRow({
      children: [
        cell(description, goodsWidths[0]),
        goodsValue(ci.quantity, goodsWidths[1]),
        goodsValue(ci.unitPrice, goodsWidths[2]),
        goodsValue(ci.totalAmount, goodsWidths[3]),
      ],
    }),
  ]));

  children.push(table([7200, 1800], [
    new TableRow({
      children: [
        cell([
          para("Amount Chargeable (In Words)", { size: 11, after: 6 }),
          para(invoiceAmountInWords(ci.totalAmount, ci.currency), { bold: true, size: 12, after: 0 }),
        ], 7200),
        cell([
          para("Total", { bold: true, size: 12, align: AlignmentType.CENTER, after: 6 }),
          para(ci.totalAmount, { bold: true, size: 13, align: AlignmentType.CENTER, after: 0 }),
        ], 1800, VerticalAlign.CENTER),
      ],
    }),
  ]));

  const signatureDetails: (Paragraph | Table)[] = [
    para("Signature", { size: 11, after: 8 }),
    para("FOR & ON BEHALF OF SELLER / ISSUER", { bold: true, size: 11, align: AlignmentType.CENTER, after: 6 }),
    para(ci.sellerName, { bold: true, size: 14, align: AlignmentType.CENTER, after: 8 }),
  ];
  if (signature?.data) {
    try {
      signatureDetails.push(new Paragraph({
        children: [new ImageRun({
          data: base64ToBuffer(signature.data),
          transformation: { width: 150, height: 55 },
          type: "png",
        })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 8 },
      }));
    } catch {}
  }
  signatureDetails.push(para(
    signature?.name ? `Signed by: ${signature.name}` : "(Authorised Signatory)",
    { size: 12, align: AlignmentType.CENTER, after: 4 },
  ));
  const signedAt = fmtSignedDateTime(signature?.signedAt);
  if (signedAt) {
    signatureDetails.push(para(`Signed: ${signedAt}`, { size: 10, align: AlignmentType.CENTER, after: 2 }));
  }
  if (signature?.signedIp) {
    signatureDetails.push(para(`IP: ${signature.signedIp}`, { size: 10, align: AlignmentType.CENTER, after: 0 }));
  }

  children.push(table([half, half], [
    new TableRow({
      children: [
        cell([
          para("Our Bankers are:", { size: 11, after: 6 }),
          para(ci.sellerBank, { bold: true, size: 14, after: 4 }),
          para(`SWIFT CODE: ${ci.sellerSwift}`, { bold: true, size: 12, after: 12 }),
          para(
            "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",
            { size: 11, after: 0 },
          ),
        ], half),
        cell(signatureDetails, half, VerticalAlign.CENTER),
      ],
    }),
  ]));

  return children;
}

function buildCiPdf(
  doc: PDFKit.PDFDocument,
  content: string,
  leftMargin: number,
  pageWidth: number,
  signature?: InvoiceSignature,
) {
  type CellLine = {
    text: string;
    bold?: boolean;
    size?: number;
    align?: "left" | "center" | "right";
  };
  type WrappedLine = Required<Pick<CellLine, "text" | "size" | "align">> & { bold: boolean; height: number };
  type CellDefinition = {
    width: number;
    lines: CellLine[];
  };

  const ci = parseCiContent(content);
  const isPi = content.trimStart().startsWith("PROFORMA INVOICE");
  const lines = content.split("\n");
  const extractLine = (label: string) => {
    const line = lines.find((entry) => entry.trimStart().startsWith(`${label}:`));
    return line ? line.slice(line.indexOf(":") + 1).trim() : "_______________";
  };
  const spaReference = extractLine("SPA Reference");
  const validUntil = extractLine("Valid Until");
  const deliveryTerm = extractLine("Delivery Term");
  const shipmentWindow = extractLine("Shipment Window");
  const packing = extractLine("Packing");
  const x = leftMargin;
  const width = pageWidth;
  const half = width / 2;
  const bottomLimit = 685;
  const paddingX = 4;
  const paddingY = 4;
  let y = doc.y;

  const line = (
    text: string,
    opts: Omit<CellLine, "text"> = {},
  ): CellLine => ({ text: text || " ", ...opts });
  const labelValue = (label: string, value: string): CellLine[] => [
    line(label, { size: 5.5 }),
    line(value || "_______________", { bold: true, size: 7 }),
  ];
  const box = (xPos: number, yPos: number, boxWidth: number, height: number) => {
    doc.lineWidth(0.6).strokeColor("#000000").rect(xPos, yPos, boxWidth, height).stroke();
  };
  const fontName = (bold: boolean) => bold ? "Helvetica-Bold" : "Helvetica";
  const textWidth = (text: string, bold: boolean, size: number) =>
    doc.font(fontName(bold)).fontSize(size).widthOfString(text);

  const splitLongToken = (token: string, maxWidth: number, bold: boolean, size: number): string[] => {
    if (textWidth(token, bold, size) <= maxWidth) return [token];
    const parts: string[] = [];
    let current = "";
    for (const character of token) {
      const candidate = `${current}${character}`;
      if (current && textWidth(candidate, bold, size) > maxWidth) {
        parts.push(current);
        current = character;
      } else {
        current = candidate;
      }
    }
    if (current) parts.push(current);
    return parts.length ? parts : [" "];
  };

  const wrapCellLine = (source: CellLine, maxWidth: number): WrappedLine[] => {
    const bold = Boolean(source.bold);
    const size = source.size || 7;
    const align = source.align || "left";
    const wrapped: WrappedLine[] = [];
    for (const paragraph of String(source.text || " ").split("\n")) {
      if (!paragraph.trim()) {
        wrapped.push({ text: " ", bold, size, align, height: size + 2 });
        continue;
      }
      const tokens = paragraph.trim().split(/\s+/).flatMap((token) =>
        splitLongToken(token, maxWidth, bold, size)
      );
      let current = "";
      for (const token of tokens) {
        const candidate = current ? `${current} ${token}` : token;
        if (current && textWidth(candidate, bold, size) > maxWidth) {
          wrapped.push({ text: current, bold, size, align, height: size + 2 });
          current = token;
        } else {
          current = candidate;
        }
      }
      if (current) wrapped.push({ text: current, bold, size, align, height: size + 2 });
    }
    return wrapped.length ? wrapped : [{ text: " ", bold, size, align, height: size + 2 }];
  };

  const drawTitle = (continued = false) => {
    const titleHeight = 19;
    box(x, y, width, titleHeight);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000").text(
      `${isPi ? "PROFORMA INVOICE" : "COMMERCIAL INVOICE"}${continued ? " (CONTINUED)" : ""}`,
      x + paddingX,
      y + 4,
      { width: width - paddingX * 2, align: "center" },
    );
    y += titleHeight;
    doc.y = y;
    doc.x = x;
  };

  const addContinuationPage = (afterTitle?: () => void) => {
    doc.addPage();
    y = doc.y;
    drawTitle(true);
    afterTitle?.();
  };

  const drawRow = (
    cells: CellDefinition[],
    options: {
      minHeight?: number;
      keepTogether?: boolean;
      repeatAfterPageBreak?: () => void;
      afterChunk?: (chunkIndex: number, chunkY: number, chunkHeight: number) => void;
    } = {},
  ) => {
    const queues = cells.map((cell) =>
      cell.lines.flatMap((cellLine) => wrapCellLine(cellLine, cell.width - paddingX * 2))
    );
    let chunkIndex = 0;
    while (queues.some((queue) => queue.length > 0)) {
      const remainingHeight = Math.max(...queues.map(
        (queue) => queue.reduce((sum, wrappedLine) => sum + wrappedLine.height, 0),
      )) + paddingY * 2;
      const minimumHeight = options.minHeight || 0;
      const desiredHeight = Math.max(minimumHeight, remainingHeight);
      const available = bottomLimit - y;

      if (
        available < 24
        || (options.keepTogether && desiredHeight <= bottomLimit - 120 && desiredHeight > available)
        || minimumHeight > available
      ) {
        addContinuationPage(options.repeatAfterPageBreak);
        continue;
      }

      const contentCapacity = Math.max(8, bottomLimit - y - paddingY * 2);
      const chunks = queues.map((queue) => {
        const selected: WrappedLine[] = [];
        let used = 0;
        for (const wrappedLine of queue) {
          if (selected.length > 0 && used + wrappedLine.height > contentCapacity) break;
          selected.push(wrappedLine);
          used += wrappedLine.height;
          if (used >= contentCapacity) break;
        }
        return selected;
      });
      const chunkContentHeight = Math.max(
        0,
        ...chunks.map((chunk) => chunk.reduce((sum, wrappedLine) => sum + wrappedLine.height, 0)),
      );
      const allContentFits = queues.every((queue, index) => chunks[index].length === queue.length);
      const chunkHeight = Math.min(
        bottomLimit - y,
        Math.max(allContentFits ? minimumHeight : 0, chunkContentHeight + paddingY * 2, 18),
      );
      const chunkY = y;
      let cellX = x;

      cells.forEach((cell, cellIndex) => {
        box(cellX, chunkY, cell.width, chunkHeight);
        let textY = chunkY + paddingY;
        for (const wrappedLine of chunks[cellIndex]) {
          doc.font(fontName(wrappedLine.bold)).fontSize(wrappedLine.size).fillColor("#000000").text(
            wrappedLine.text,
            cellX + paddingX,
            textY,
            {
              width: cell.width - paddingX * 2,
              align: wrappedLine.align,
              lineBreak: false,
            },
          );
          textY += wrappedLine.height;
        }
        cellX += cell.width;
      });

      options.afterChunk?.(chunkIndex, chunkY, chunkHeight);
      queues.forEach((queue, index) => queue.splice(0, chunks[index].length));
      y += chunkHeight;
      doc.y = y;
      doc.x = x;

      if (queues.some((queue) => queue.length > 0)) {
        chunkIndex += 1;
        addContinuationPage(options.repeatAfterPageBreak);
      }
    }
  };

  const ensureSpace = (height: number) => {
    if (bottomLimit - y < height) addContinuationPage();
  };

  drawTitle();

  drawRow([
    {
      width: half,
      lines: [
        line("Exporter", { size: 5.5 }),
        line(ci.sellerName, { bold: true, size: 7.5 }),
        line(ci.sellerAddr, { bold: true, size: 6.5 }),
        line(ci.sellerContact, { size: 6 }),
      ],
    },
    {
      width: half,
      lines: [
        ...labelValue("Invoice No. & Date", `${ci.invoiceNo}  |  ${ci.date}`),
        ...labelValue(isPi ? "SPA / Contract Ref." : "Exporter's Ref.", isPi ? spaReference : ci.invoiceNo),
        ...labelValue(isPi ? "Valid Until" : "LC No.", isPi ? validUntil : ci.lcNo),
      ],
    },
  ], { minHeight: 66 });

  drawRow([
    {
      width: half,
      lines: [
        line("Consignee", { size: 5.5 }),
        line(ci.buyerName, { bold: true, size: 7.5 }),
        line(ci.buyerAddr, { bold: true, size: 6.5 }),
        line(ci.buyerContact, { size: 6 }),
      ],
    },
    {
      width: half,
      lines: [
        ...labelValue("Contract No.", isPi ? spaReference : ci.invoiceNo),
        ...labelValue(isPi ? "Delivery Basis" : "LC Issuing Bank", isPi ? deliveryTerm : ci.lcBank),
      ],
    },
  ], { minHeight: 58 });

  drawRow([
    { width: half, lines: labelValue("Country of Origin of Goods", ci.origin) },
    { width: half, lines: labelValue("Country / Place of Final Destination", ci.portOfDischarge) },
  ], { minHeight: 28, keepTogether: true });

  drawRow([
    {
      width,
      lines: labelValue(
        "Terms of Delivery and Payment",
        `${deliveryTerm}${deliveryTerm && ci.paymentTerms ? " — " : ""}${ci.paymentTerms}`,
      ),
    },
  ], { minHeight: 32 });

  drawRow([
    {
      width: half,
      lines: labelValue(
        isPi ? "Shipment Window / Name of Vessel" : "Pre-Carriage / Name of Vessel",
        `${isPi ? shipmentWindow : ci.voyage}  |  ${ci.vessel}`,
      ),
    },
    { width: half, lines: labelValue("Place / Port of Loading", ci.portOfLoading) },
  ], { minHeight: 30 });

  drawRow([
    { width: half, lines: labelValue("Port of Discharge", ci.portOfDischarge) },
    { width: half, lines: labelValue("Final Destination", ci.portOfDischarge) },
  ], { minHeight: 28, keepTogether: true });

  const goodsWidths = [width * 0.64, width * 0.14, width * 0.11, width * 0.11];
  const drawGoodsHeader = () => drawRow([
    { width: goodsWidths[0], lines: [line("DESCR. OF GOODS AND / OR SERVICES", { bold: true, size: 6 })] },
    { width: goodsWidths[1], lines: [line("Quantity\nM/tonnes", { bold: true, size: 6, align: "center" })] },
    { width: goodsWidths[2], lines: [line(`Rate\n${ci.currency}`, { bold: true, size: 6, align: "center" })] },
    { width: goodsWidths[3], lines: [line(`Amount\n${ci.currency}`, { bold: true, size: 6, align: "center" })] },
  ], { minHeight: 28, keepTogether: true });

  ensureSpace(140);
  drawGoodsHeader();
  drawRow([
    {
      width: goodsWidths[0],
      lines: [
        line(`Commodity: ${ci.commodity}`, { size: 7 }),
        line(`Packing: ${packing}`, { size: 7 }),
        line(`Country of Origin: ${ci.origin}`, { size: 7 }),
        line(`Quantity: ${ci.quantity} MT`, { size: 7 }),
        line(`Base Price: ${ci.currency} ${ci.unitPrice}/MT`, { size: 7 }),
        line(`Tolerance: ${ci.tolerance}`, { size: 7 }),
        ...(isPi ? [
          line(`SPA Reference: ${spaReference}`, { size: 7 }),
          line(`Shipment Window: ${shipmentWindow}`, { size: 7 }),
        ] : []),
        line(`Payment Terms: ${ci.paymentTerms}`, { size: 7 }),
      ],
    },
    { width: goodsWidths[1], lines: [line(ci.quantity, { bold: true, size: 7, align: "center" })] },
    { width: goodsWidths[2], lines: [line(ci.unitPrice, { bold: true, size: 7, align: "center" })] },
    { width: goodsWidths[3], lines: [line(ci.totalAmount, { bold: true, size: 7, align: "center" })] },
  ], { minHeight: 112, repeatAfterPageBreak: drawGoodsHeader });

  const amountLeftWidth = width * 0.78;
  drawRow([
    {
      width: amountLeftWidth,
      lines: [
        line("Amount Chargeable (In Words)", { size: 5.5 }),
        line(invoiceAmountInWords(ci.totalAmount, ci.currency), { bold: true, size: 6.5 }),
      ],
    },
    {
      width: width - amountLeftWidth,
      lines: [
        line("Total", { bold: true, size: 6, align: "center" }),
        line(ci.totalAmount, { bold: true, size: 7, align: "center" }),
      ],
    },
  ], { minHeight: 34, keepTogether: true });

  const signatureLines: CellLine[] = [
    line("Signature", { size: 5.5 }),
    line("FOR & ON BEHALF OF SELLER / ISSUER", { bold: true, size: 5.5, align: "center" }),
    line(ci.sellerName, { bold: true, size: 7, align: "center" }),
    line(" ", { size: 9 }),
    line(" ", { size: 9 }),
    line(" ", { size: 9 }),
    line(signature?.name ? `Signed by: ${signature.name}` : "(Authorised Signatory)", { size: 6, align: "center" }),
  ];
  const signedAt = fmtSignedDateTime(signature?.signedAt);
  if (signedAt) {
    signatureLines.push(line(
      `Signed: ${signedAt}${signature?.signedIp ? `  |  IP: ${signature.signedIp}` : ""}`,
      { size: 5, align: "center" },
    ));
  }

  drawRow([
    {
      width: half,
      lines: [
        line("Our Bankers are:", { size: 5.5 }),
        line(ci.sellerBank, { bold: true, size: 7 }),
        line(`SWIFT CODE: ${ci.sellerSwift}`, { bold: true, size: 6.5 }),
        line(" ", { size: 6 }),
        line(
          "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",
          { size: 5.5 },
        ),
      ],
    },
    { width: half, lines: signatureLines },
  ], {
    minHeight: 98,
    keepTogether: true,
    afterChunk: (chunkIndex, chunkY) => {
      if (chunkIndex !== 0 || !signature?.data) return;
      doc.image(base64ToBuffer(signature.data), x + half + half / 2 - 50, chunkY + 36, {
        width: 100,
        height: 30,
      });
    },
  });

  doc.y = y;
  doc.x = x;
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

export function parseCooContent(content: string): CooData {
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

  const S = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
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
  specRows: [string, string, string, string][];
  logisticsRows: { label: string; value: string }[];
  specialNote: string;
  closingLines: string[];
  buyerSignatory: string;
}

/** Grade markers remain ordinary spec rows for round trips, but each grade
 * receives its own table in the dedicated LOI layouts. */
export function groupLoiSpecRows(rows: [string, string, string, string][]): [string, string, string, string][][] {
  const groups: [string, string, string, string][][] = [[]];
  for (const row of rows) {
    if (row[0] === "Propane grade" && groups[0].some(r => r[0] === "n-Butane grade")) groups.push([]);
    groups[groups.length - 1].push(row);
  }
  return groups.filter(g => g.length);
}

export function parseLoiContent(content: string): LoiParsed {
  const sanitized = sanitizeUnicode(content);
  const lines = sanitized.split("\n");
  const result: LoiParsed = { headerRows: [], buyerRows: [], paramRows: [], specRows: [], logisticsRows: [], specialNote: "", closingLines: [], buyerSignatory: "" };

  let section: "pre" | "seller" | "buyer" | "table" | "note" | "closing" | "specs" = "pre";
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

    if (trimmed === "COMMODITY SPECIFICATIONS") {
      flushHeader();
      section = "specs";
      continue;
    }
    if (section === "specs") {
      if (trimmed.startsWith("SPECIAL NOTES")) { section = "note"; continue; }
      if (trimmed.startsWith("We look forward") || trimmed.startsWith("With warm regards") || trimmed.startsWith("For & On Behalf")) {
        section = "closing";
        result.closingLines.push(trimmed);
        continue;
      }
      if (trimmed.match(/^[=-]{3,}$/) || !trimmed || trimmed === "LOGISTICS") continue;
      const portMatch = trimmed.match(/^(Loading Port|Discharge Port):\s*(.*)$/);
      if (portMatch) {
        result.logisticsRows.push({ label: portMatch[1], value: portMatch[2].trim() });
        continue;
      }
      if (trimmed.includes("|")) {
        if (trimmed.includes("Parameter")) continue;
        const cells = trimmed.split("|").map(c => c.trim());
        result.specRows.push([cells[0] || "", cells[1] || "", cells[2] || "", cells[3] || ""]);
      }
      continue;
    }

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

function buildLoiDocx(content: string, signature?: InvoiceSignature): (Paragraph | Table)[] {
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
    const cellBorder = { top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" }, bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" }, left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" }, right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } };
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

  if (loi.specRows.length > 0) {
    children.push(new Paragraph({
      children: [new TextRun({ text: "COMMODITY SPECIFICATIONS", bold: true, size: 20, font: "Calibri" })],
      spacing: { before: 300, after: 120 },
    }));
    for (const rows of groupLoiSpecRows(loi.specRows)) {
      children.push(make4ColTable([["Parameter", "Specification", "Rejection", "Test Method"], ...rows]));
      children.push(new Paragraph({ spacing: { after: 160 } }));
    }
  }

  if (loi.logisticsRows.length > 0) {
    children.push(new Paragraph({
      children: [new TextRun({ text: "LOGISTICS", bold: true, size: 20, font: "Calibri" })],
      spacing: { before: 300, after: 120 },
    }));
    for (const row of loi.logisticsRows) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `${row.label}: `, bold: true, size: 18, font: "Calibri" }),
          new TextRun({ text: row.value, size: 18, font: "Calibri" }),
        ],
        spacing: { after: 60 },
      }));
    }
  }

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
      keepNext: !!signature?.data,
    }));
    if (!isItalic && line.trim()) issuerName = line;
  }

  children.push(new Paragraph({ spacing: { before: 100 } }));
  if (signature?.data) {
    children.push(...nativeSignatureDocx(signature));
    return children;
  }
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

function buildLoiPdf(doc: PDFKit.PDFDocument, content: string, leftMargin: number, pageWidth: number, signature?: InvoiceSignature) {
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

  if (loi.specRows.length > 0) {
    pdfCheckPage(doc, 60);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#333333").text("COMMODITY SPECIFICATIONS", leftMargin, doc.y, { width: pageWidth });
    doc.moveDown(0.4);
    for (const rows of groupLoiSpecRows(loi.specRows)) {
      drawPdf4ColTable(doc, [["Parameter", "Specification", "Rejection", "Test Method"], ...rows], leftMargin, pageWidth);
      doc.moveDown(0.8);
    }
    doc.moveDown(0.8);
  }

  if (loi.logisticsRows.length > 0) {
    pdfCheckPage(doc, 40);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000").text("LOGISTICS", leftMargin, doc.y);
    doc.moveDown(0.4);
    for (const row of loi.logisticsRows) {
      pdfCheckPage(doc, 14);
      doc.font("Helvetica-Bold").fontSize(8).text(`${row.label}: `, leftMargin, doc.y, { continued: true });
      doc.font("Helvetica").fontSize(8).text(row.value, { width: pageWidth });
      doc.moveDown(0.2);
    }
    doc.moveDown(0.6);
  }

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

  if (signature?.data) {
    drawNativeSignaturePdf(doc, signature, leftMargin, pageWidth);
    return;
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

function buildFooterParagraphs(submittedBy?: string, agentCode?: string, teamMemberCode?: string): Paragraph[] {
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
  if (teamMemberCode) {
    out.push(new Paragraph({
      children: [new TextRun({ text: `Allocated Team Member: ${teamMemberCode}`, bold: true, size: 14, font: "Calibri", color: "333333" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    }));
  }
  return out;
}

type BuilderKey =
  | "TFR" | "DLC_MT700" | "DEAL_RECAP" | "LOI" | "NCNDA"
  | "BL" | "COO" | "COA" | "COW" | "CI" | "GENERIC";
export async function generateDocx(docId: string, title: string, content: string, submittedBy?: string, agentCode?: string, teamMemberCode?: string, docType?: string | null): Promise<string> {
  assertSafeDocId(docId);
  const builderKey = resolveBuilderKey(content, docType);
  const children = buildDocxByKey(builderKey, content);

  const { header, footer, letterhead } = await getBrandingLogos();
  if (builderKey !== "CI") {
    children.push(...buildFooterParagraphs(submittedBy, agentCode, teamMemberCode));
  }

  const doc = new DocxDocument({
    sections: [brandedDocxSection(children, header, footer, letterhead)],
  });

  const buffer = await Packer.toBuffer(doc);
  const fileName = `${docId}.docx`;
  const filePath = path.join(docsDir, fileName);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

function buildGenericDocx(content: string, signature?: InvoiceSignature): (Paragraph | Table)[] {
  const sections = parseContentToSections(signature?.data ? prepareNativeSignatureContent(content) : content);
  const children: (Paragraph | Table)[] = [];

  let tableRows: TableRow[] = [];
  let tableColCount = 0;
  let inSignatureBlock = false;

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
    if (signature?.data && /^AUTHORI[ZS]ED SIGNATORY$/i.test(section.text)) inSignatureBlock = true;
    if (signature?.data && nativeSignatureLine.test(section.text)) {
      flushTable();
      children.push(...nativeSignatureDocx(signature));
      inSignatureBlock = false;
      continue;
    }
    if (section.type === "table-row" && section.cells) {
      const isHeader = section.cells.every(c => c === c.replace(/[a-z]/g, "").trim() || c.includes("Item") || c.includes("Parameter") || c.includes("Specification") || c.includes("Limit") || c.includes("Rejection") || c.includes("Test Method"));
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
            keepNext: inSignatureBlock,
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
        children.push(new Paragraph({ children: runs, spacing: { before: 40, after: 40 }, keepNext: inSignatureBlock }));
      }
    }
  }
  flushTable();
  return children;
}

export async function generatePdf(docId: string, title: string, content: string, submittedBy?: string, agentCode?: string, teamMemberCode?: string, docType?: string | null): Promise<string> {
  assertSafeDocId(docId);
  const { header, footer, letterhead } = await getBrandingLogos();
  return new Promise((resolve, reject) => {
    const fileName = `${docId}.pdf`;
    const filePath = path.join(docsDir, fileName);
    const doc = createBrandedPdf({ header, footer, letterhead });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const pageWidth = 495;
    const leftMargin = 50;
    const builderKey = resolveBuilderKey(content, docType);

    buildPdfByKey(builderKey, doc, content, leftMargin, pageWidth);

    if (builderKey !== "CI") {
      addPdfFooter(doc, leftMargin, pageWidth, submittedBy, agentCode, teamMemberCode);
    }

    doc.end();
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}

function pdfCheckPage(doc: PDFKit.PDFDocument, minSpace: number = 60) {
  if (doc.y > 740 - minSpace) doc.addPage();
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

function drawPdf3ColTable(doc: PDFKit.PDFDocument, rows: [string, string, string][], left: number, totalWidth: number) {
  const colW = [
    Math.floor(totalWidth * 0.40),
    Math.floor(totalWidth * 0.30),
    totalWidth - Math.floor(totalWidth * 0.40) - Math.floor(totalWidth * 0.30),
  ];
  const padding = 5;

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i];
    const isHeader = i === 0;
    const font = isHeader ? "Helvetica-Bold" : "Helvetica";
    const fontSize = 9;

    let maxH = 14;
    for (let c = 0; c < 3; c++) {
      const h = doc.font(font).fontSize(fontSize).heightOfString(cells[c] || " ", { width: colW[c] - padding * 2 });
      maxH = Math.max(maxH, h);
    }
    const rowH = maxH + padding * 2 + 2;

    pdfCheckPage(doc, rowH);
    const y = doc.y;

    let x = left;
    for (let c = 0; c < 3; c++) {
      if (isHeader) {
        doc.rect(x, y, colW[c], rowH).fill("#F2F2F2").stroke("#999999");
      } else {
        doc.rect(x, y, colW[c], rowH).stroke("#999999");
      }
      doc.fillColor("#000000");
      doc.font(c === 0 ? "Helvetica-Bold" : font).fontSize(fontSize).text(cells[c] || "", x + padding, y + padding, { width: colW[c] - padding * 2 });
      x += colW[c];
    }

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

  doc.font("Helvetica").fontSize(9).text("The product supplied under this Contract shall comply with the following specifications.", leftMargin, doc.y, { width: pageWidth });
  doc.moveDown(0.5);

  doc.font("Helvetica-Bold").fontSize(9).text("PRODUCT SPECIFICATION", leftMargin, doc.y, { width: pageWidth });
  doc.moveDown(0.3);

  const specRows: [string, string, string, string][] = [
    ["Parameter", "Specification", "Rejection", "Test Method"],
  ];

  if (d.annexSpecs) {
    const specLines = d.annexSpecs.split("\n");
    for (const line of specLines) {
      const cells = line.split("|").map(c => c.trim());
      if (cells.length >= 2) {
        specRows.push([cells[0] || "", cells[1] || "", cells[2] || "", cells[3] || ""]);
      }
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

function buildGenericPdf(doc: PDFKit.PDFDocument, content: string, leftMargin: number, pageWidth: number, signature?: InvoiceSignature) {
  const sections = parseContentToSections(signature?.data ? prepareNativeSignatureContent(content) : content);

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
    } else if (maxCols === 6) {
      // LPG annexures carry ASTM and ISO in columns five/six. The legacy
      // four-column renderer silently drops those cells; retain all six.
      const widths = [0.30, 0.10, 0.10, 0.18, 0.14, 0.18].map(ratio => ratio * pageWidth);
      let headerCells: string[] | undefined;
      const drawRow = (cells: string[], header: boolean) => {
        doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(8);
        const height = Math.max(22, ...cells.map((cell, i) => doc.heightOfString(cell, { width: widths[i] - 8 }) + 10));
        if (doc.y > 740 - height) {
          doc.addPage();
          if (!header && headerCells) drawRow(headerCells, true);
          doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(8);
        }
        const y = doc.y;
        let x = leftMargin;
        cells.forEach((cell, i) => {
          doc.rect(x, y, widths[i], height).fillAndStroke(header ? "#edf2f7" : "#ffffff", "#cbd5e1");
          doc.fillColor("#111111").text(cell, x + 4, y + 5, { width: widths[i] - 8 });
          x += widths[i];
        });
        doc.y = y + height;
      };
      for (const row of pendingTableRows) {
        const header = row.cells[0] === "PROPERTY";
        if (header) headerCells = row.cells;
        drawRow(row.cells, header);
      }
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
    if (signature?.data && /^AUTHORI[ZS]ED SIGNATORY$/i.test(section.text)) pdfCheckPage(doc, 200);
    if (signature?.data && nativeSignatureLine.test(section.text)) {
      flushPdfTable();
      drawNativeSignaturePdf(doc, signature, leftMargin, pageWidth);
      continue;
    }
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
  issuerIsSeller?: boolean,
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
  const isTwoParty = isNcnda || docType === "ADDENDUM";

  if (isTwoParty) {
    const halfW = Math.floor(pageWidth / 2) - 10;
    const rightX = leftMargin + Math.floor(pageWidth / 2) + 10;
    const sigStartY = doc.y;

    doc.font("Helvetica-Bold").fontSize(9).text(isNcnda ? "PARTY A (ISSUER)" : "SELLER", leftMargin, sigStartY, { width: halfW });
    doc.font("Helvetica-Bold").fontSize(9).text(isNcnda ? "PARTY B (RECEIVING PARTY)" : "BUYER", rightX, sigStartY, { width: halfW });

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
    // Single-signer (generic) docs always store the signature in the "buyer"
    // slot regardless of the issuing party (the sign UI signs as "buyer").
    // issuerIsSeller only changes the displayed label (e.g. FOB Export is issued
    // by the Seller); it must NOT change which stored signature we render, or the
    // signature would silently disappear for those documents.
    const issuerLabel = issuerIsSeller ? "FOR & ON BEHALF OF SELLER / ISSUER" : "FOR & ON BEHALF OF BUYER / ISSUER";
    const issuerSig = buyerSig;
    const issuerName = buyerName;
    const issuerSignedAt = buyerSignedAt;
    const issuerSignedIp = buyerSignedIp;
    const sigStartY = doc.y;
    doc.font("Helvetica-Bold").fontSize(9).text(issuerLabel, leftMargin, sigStartY, { width: pageWidth });
    const labelY = sigStartY + 18;

    if (issuerSig) {
      try {
        const sigBuf = base64ToBuffer(issuerSig);
        doc.image(sigBuf, leftMargin, labelY, { width: 150, height: 60 });
      } catch (e) {}
    }

    const nameY = labelY + 65;
    doc.font("Helvetica").fontSize(8);

    if (issuerName) {
      doc.text(`Name: ${issuerName}`, leftMargin, nameY, { width: pageWidth });
      const issuerDt = fmtSignedDateTime(issuerSignedAt);
      if (issuerDt) doc.text(`Signed: ${issuerDt}`, leftMargin, nameY + 12, { width: pageWidth });
      if (issuerSignedIp) doc.text(`IP: ${issuerSignedIp}`, leftMargin, nameY + 24, { width: pageWidth });
    } else {
      doc.text("Name: _______________", leftMargin, nameY, { width: pageWidth });
      doc.text("Signed: _______________", leftMargin, nameY + 12, { width: pageWidth });
      doc.text("IP: _______________", leftMargin, nameY + 24, { width: pageWidth });
    }

    doc.y = nameY + 42;
  }
}

function addPdfFooter(doc: PDFKit.PDFDocument, leftMargin: number, pageWidth: number, submittedBy?: string, agentCode?: string, teamMemberCode?: string) {
  const disclaimerH = doc.font("Helvetica-Oblique").fontSize(7).heightOfString(DISCLAIMER_TEXT, { width: pageWidth });
  const extraLines = (submittedBy ? 12 : 0) + (agentCode ? 12 : 0) + (teamMemberCode ? 12 : 0);
  if (doc.y > 720 - disclaimerH - 40 - extraLines) doc.addPage();
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
  if (teamMemberCode) {
    doc.moveDown(0.2);
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#333333")
      .text(`Allocated Team Member: ${teamMemberCode}`, leftMargin, doc.y, { width: pageWidth, align: "center" });
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
  issuerIsSeller?: boolean,
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
  const isTwoParty = isNcnda || docType === "ADDENDUM";
  const noBorder = { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } };

  if (isTwoParty) {
    const makeCell = (children: (Paragraph | Table)[]): TableCell => new TableCell({
      children,
      borders: noBorder,
      width: { size: 5000, type: WidthType.DXA },
    });
    const leftChildren: (Paragraph | Table)[] = [
      new Paragraph({ children: [new TextRun({ text: isNcnda ? "PARTY A (ISSUER)" : "SELLER", bold: true, size: 18, font: "Calibri" })], spacing: { after: 80 } }),
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
      new Paragraph({ children: [new TextRun({ text: isNcnda ? "PARTY B (RECEIVING PARTY)" : "BUYER", bold: true, size: 18, font: "Calibri" })], spacing: { after: 80 } }),
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
    // Single-signer (generic) docs always store the signature in the "buyer"
    // slot regardless of the issuing party (the sign UI signs as "buyer").
    // issuerIsSeller only changes the displayed label (e.g. FOB Export is issued
    // by the Seller); it must NOT change which stored signature we render, or the
    // signature would silently disappear for those documents.
    const issuerLabel = issuerIsSeller ? "FOR & ON BEHALF OF SELLER / ISSUER" : "FOR & ON BEHALF OF BUYER / ISSUER";
    const issuerSig = buyerSig;
    const issuerName = buyerName;
    const issuerSignedAt = buyerSignedAt;
    const issuerSignedIp = buyerSignedIp;
    items.push(new Paragraph({
      children: [new TextRun({ text: issuerLabel, bold: true, size: 18, font: "Calibri" })],
      spacing: { after: 100 },
    }));
    if (issuerSig) {
      try {
        items.push(new Paragraph({
          children: [new ImageRun({ data: base64ToBuffer(issuerSig), transformation: { width: 180, height: 70 }, type: "png" })],
          spacing: { after: 60 },
        }));
      } catch (e) {}
    }
    items.push(new Paragraph({
      children: [new TextRun({ text: `Name: ${issuerName || "_______________"}`, size: 18, font: "Calibri" })],
      spacing: { after: 40 },
    }));
    items.push(new Paragraph({
      children: [new TextRun({ text: `Signed: ${fmtSignedDateTime(issuerSignedAt) || "_______________"}`, size: 18, font: "Calibri" })],
      spacing: { after: 40 },
    }));
    items.push(new Paragraph({
      children: [new TextRun({ text: `IP: ${issuerSignedIp || "_______________"}`, size: 18, font: "Calibri" })]
    }));
  }

  return items;
}

// Only a single, unambiguous issuer placeholder is eligible. Bilateral layouts
// retain their existing execution rendering, including SPA addenda.
const nativeSignatureLine = /^(?:Digital )?Signature(?:\s*(?:&|and)\s*Stamp)?\s*:\s*[_ .-]*$/i;

function prepareNativeSignatureContent(content: string): string {
  // Signer and execution date are rendered beside the image, not as stale
  // template blanks/issue dates. Never alter names or dates outside this block.
  return content.replace(
    /(^AUTHORI[ZS]ED SIGNATORY[ \t]*\n)((?:[^\n]*\n){0,8}?)(^Signature[ \t]*:[ \t]*[_ .-]*$)/gim,
    (_match, heading, body, slot) => heading + body.replace(/^(?:Name|Date):[^\n]*\n/gim, "") + slot,
  );
}

export function hasNativeIssuerSignature(content: string, docType?: string): boolean {
  const key = resolveBuilderKey(content, docType);
  if (key === "NCNDA" || /ADDENDUM/i.test(docType || "") || /SPA ADDENDUM/i.test(content)) return false;
  if (key === "LOI" || key === "CI") return true;
  const lines = content.split("\n").map(line => line.trim());
  return key === "GENERIC" &&
    lines.filter(line => nativeSignatureLine.test(line)).length === 1 &&
    lines.filter(line => /signature[^:\n]*:/i.test(line)).length === 1;
}

function nativeSignatureDocx(signature: InvoiceSignature): Paragraph[] {
  const text = [signature.name && `Signed by: ${signature.name}`,
    signature.signedAt && `Signed: ${fmtSignedDateTime(signature.signedAt)}`,
    signature.signedIp && `IP: ${signature.signedIp}`].filter(Boolean).join("  |  ");
  return [
    new Paragraph({ children: [new TextRun({ text: "Digital Signature:", size: 18 })], keepNext: true }),
    new Paragraph({
      children: [new ImageRun({ data: base64ToBuffer(signature.data!), type: "png", transformation: { width: 180, height: 60 } })],
      keepNext: true,
    }),
    new Paragraph({ children: [new TextRun({ text, size: 16, font: "Calibri" })], spacing: { after: 160 } }),
  ];
}

function drawNativeSignaturePdf(doc: PDFKit.PDFDocument, signature: InvoiceSignature, left: number, width: number) {
  const text = [signature.name && `Signed by: ${signature.name}`,
    signature.signedAt && `Signed: ${fmtSignedDateTime(signature.signedAt)}`,
    signature.signedIp && `IP: ${signature.signedIp}`].filter(Boolean).join("\n");
  doc.font("Helvetica").fontSize(8);
  pdfCheckPage(doc, 86 + doc.heightOfString(text, { width }));
  doc.fillColor("#555555").text("Digital Signature:", left, doc.y, { width });
  const y = doc.y + 4;
  doc.image(base64ToBuffer(signature.data!), left, y, { fit: [180, 60] });
  doc.y = y + 66;
  doc.text(text, left, doc.y, { width });
  doc.moveDown(0.5);
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
  teamMemberCode?: string,
): Promise<{ docxPath: string; pdfPath: string }> {
  assertSafeDocId(docId);
  const builderKey = resolveBuilderKey(content, docType);
  const consumesIssuerSignature = hasNativeIssuerSignature(content, docType);
  const invoiceSignature: InvoiceSignature | undefined = consumesIssuerSignature
    ? { data: buyerSig, name: buyerName, signedAt: buyerSignedAt, signedIp: buyerSignedIp }
    : undefined;
  const docxChildren = buildDocxByKey(builderKey, content, invoiceSignature);

  const issuerIsSeller = isFobExportContent(content) || docType === "FCO" || docType === "PI" || docType === "CI";

  if ((buyerSig || sellerSig) && !(consumesIssuerSignature && buyerSig) && builderKey !== "CI") {
    docxChildren.push(...buildSignatureDocxParagraphs(buyerSig, sellerSig, buyerName, sellerName, buyerSignedAt, sellerSignedAt, docType, buyerSignedIp, sellerSignedIp, issuerIsSeller));
  }

  const { header, footer, letterhead } = await getBrandingLogos();
  if (builderKey !== "CI") {
    docxChildren.push(...buildFooterParagraphs(submittedBy, agentCode, teamMemberCode));
  }

  const docxDoc = new DocxDocument({ sections: [brandedDocxSection(docxChildren, header, footer, letterhead)] });
  const buffer = await Packer.toBuffer(docxDoc);
  const docxPath = path.join(docsDir, `${docId}.docx`);
  fs.writeFileSync(docxPath, buffer);

  const pdfPath = await new Promise<string>((resolve, reject) => {
    const filePath = path.join(docsDir, `${docId}.pdf`);
    const pdfDoc = createBrandedPdf({ header, footer, letterhead });
    const stream = fs.createWriteStream(filePath);
    pdfDoc.pipe(stream);
    const pageWidth = 495;
    const leftMargin = 50;

    buildPdfByKey(builderKey, pdfDoc, content, leftMargin, pageWidth, invoiceSignature);

    if ((buyerSig || sellerSig) && !(consumesIssuerSignature && buyerSig) && builderKey !== "CI") {
      addSignatureBlockPdf(pdfDoc, leftMargin, pageWidth, buyerSig, sellerSig, buyerName, sellerName, buyerSignedAt, sellerSignedAt, docType, buyerSignedIp, sellerSignedIp, issuerIsSeller);
    }

    if (builderKey !== "CI") {
      addPdfFooter(pdfDoc, leftMargin, pageWidth, submittedBy, agentCode, teamMemberCode);
    }

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
        ...((kyc.additionalBanks ?? []).flatMap((b: any, i: number) => [
          [`— Additional Bank ${i + 2} —`, ""],
          ["Bank Name", v(b?.bankName)],
          ["Bank Branch", v(b?.bankBranch)],
          ["Bank Address", v(b?.bankAddress)],
          ["Account Name", v(b?.accountName)],
          ["Account Number", v(b?.accountNumber)],
          ["SWIFT Code", v(b?.swiftCode)],
          ["Account Currency", v(b?.bankAccountCurrency)],
          ["Bank Officer Name", v(b?.bankOfficerName)],
          ["Bank Officer Email", v(b?.bankOfficerEmail)],
        ]) as [string, string][]),
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
  const { header, footer, letterhead } = await getBrandingLogos();
  return new Promise((resolve, reject) => {
    const fileName = `kyc_${kyc.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`;
    const filePath = path.join(docsDir, fileName);
    const doc = createBrandedPdf({ header, footer, letterhead });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const pageWidth = 495;
    const leftMargin = 50;

    // Header
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#990000")
      .text("BULLEX TRADING PLATFORM", leftMargin, doc.y, { width: pageWidth, align: "center" });
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

    addPdfFooter(doc, leftMargin, pageWidth, submittedBy);
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
  const { header, footer, letterhead } = await getBrandingLogos();
  return new Promise((resolve, reject) => {
    const fileName = `kyc_blank_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`;
    const filePath = path.join(docsDir, fileName);
    const doc = createBrandedPdf({ header, footer, letterhead });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const pageWidth = 495;
    const leftMargin = 50;

    // Header
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#990000")
      .text("BULLEX TRADING PLATFORM", leftMargin, doc.y, { width: pageWidth, align: "center" });
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
      .text("Please complete every section in BLOCK CAPITALS. Mark non-applicable fields with N/A. Attach supporting documents (incorporation certificate, financial statements, AML policy, etc.) when returning this form to docs@bullfrog-group.com.", leftMargin, doc.y, { width: pageWidth, align: "left" });
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

const GENERIC_DOC_TYPES = new Set([
  "FOB_PROCEDURE", "SCO", "FCO", "ICPO", "SPA", "POP", "POF",
  "BCL", "CRC", "HC", "DTA", "LC", "ICA",
]);

const DOC_TYPE_BUILDERS: Record<string, BuilderKey> = {
  TFR: "TFR",
  DLC_MT700: "DLC_MT700",
  // PBG (MT760) drafts share the SWIFT message-block layout with MT700.
  PBG_MT760: "DLC_MT700",
  DEAL_RECAP: "DEAL_RECAP",
  LOI: "LOI",
  NCNDA: "NCNDA",
  BL: "BL",
  COO: "COO",
  COA: "COA",
  COW: "COW",
  CI: "CI",
  PI: "CI",
};

function buildDocxByKey(key: BuilderKey, content: string, invoiceSignature?: InvoiceSignature): (Paragraph | Table)[] {
  switch (key) {
    case "TFR": return buildTfrDocx(content);
    case "DLC_MT700": return buildDlcMt700Docx(content);
    case "DEAL_RECAP": return buildDealRecapDocx(content);
    case "LOI": return buildLoiDocx(content, invoiceSignature);
    case "NCNDA": return buildNcndaDocx(content);
    case "BL": return buildBlDocx(content);
    case "COO": return buildCooDocx(content);
    case "COA": return buildCoaDocx(content);
    case "COW": return buildCowDocx(content);
    case "CI": return buildCiDocx(content, invoiceSignature);
    default: return buildGenericDocx(content, invoiceSignature);
  }
}

function buildPdfByKey(
  key: BuilderKey,
  doc: PDFKit.PDFDocument,
  content: string,
  leftMargin: number,
  pageWidth: number,
  invoiceSignature?: InvoiceSignature,
): void {
  switch (key) {
    case "TFR": buildTfrPdf(doc, content, leftMargin, pageWidth); break;
    case "DLC_MT700": buildDlcMt700Pdf(doc, content, leftMargin, pageWidth); break;
    case "DEAL_RECAP": buildDealRecapPdf(doc, content, leftMargin, pageWidth); break;
    case "LOI": buildLoiPdf(doc, content, leftMargin, pageWidth, invoiceSignature); break;
    case "NCNDA": buildNcndaPdf(doc, content, leftMargin, pageWidth); break;
    case "BL": buildBlPdf(doc, content, leftMargin, pageWidth); break;
    case "COO": buildCooPdf(doc, content, leftMargin, pageWidth); break;
    case "COA": buildCoaPdf(doc, content, leftMargin, pageWidth); break;
    case "COW": buildCowPdf(doc, content, leftMargin, pageWidth); break;
    case "CI": buildCiPdf(doc, content, leftMargin, pageWidth, invoiceSignature); break;
    default: buildGenericPdf(doc, content, leftMargin, pageWidth, invoiceSignature); break;
  }
}

export function resolveBuilderKey(content: string, docType?: string | null): BuilderKey {
  if (docType) {
    const mapped = DOC_TYPE_BUILDERS[docType];
    if (mapped) return mapped;
    if (GENERIC_DOC_TYPES.has(docType)) return "GENERIC";
    // Unrecognized docType — fall through to content sniffing below.
  }
  if (isTfrContent(content)) return "TFR";
  if (isDlcMt700Content(content) || isPbgMt760Content(content)) return "DLC_MT700";
  if (isDealRecapContent(content)) return "DEAL_RECAP";
  if (isLoiContent(content)) return "LOI";
  if (isNcndaContent(content)) return "NCNDA";
  if (isBlContent(content)) return "BL";
  if (isCooContent(content)) return "COO";
  if (isCoaContent(content)) return "COA";
  if (isCowContent(content)) return "COW";
  if (isCiContent(content)) return "CI";
  return "GENERIC";
}
