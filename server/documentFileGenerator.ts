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
  TableBorders,
  VerticalAlign,
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

export async function generateDocx(docId: string, title: string, content: string): Promise<string> {
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
          borders: TableBorders.NONE,
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
                  font: "Arial",
                })],
                spacing: { before: 40, after: 40 },
              })],
              verticalAlign: VerticalAlign.CENTER,
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
                left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
                right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
              },
            })
          ),
        })
      );
    } else {
      flushTable();

      if (section.type === "heading") {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: section.text, bold: true, size: 28, font: "Arial" })],
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
            children: [new TextRun({ text: section.text, bold: true, size: 22, font: "Arial" })],
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
            runs.push(new TextRun({ text: part.slice(2, -2), bold: true, size: 20, font: "Arial" }));
          } else {
            runs.push(new TextRun({ text: part, size: 20, font: "Arial" }));
          }
        }
        children.push(new Paragraph({ children: runs, spacing: { before: 40, after: 40 } }));
      }
    }
  }
  flushTable();

  const doc = new DocxDocument({
    sections: [{ children }],
  });

  const buffer = await Packer.toBuffer(doc);
  const fileName = `${docId}.docx`;
  const filePath = path.join(docsDir, fileName);
  fs.writeFileSync(filePath, buffer);
  return filePath;
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
    const sections = parseContentToSections(content);

    const drawTableRow = (cells: string[], isHeader: boolean, colWidths: number[]) => {
      if (doc.y > 720) doc.addPage();

      const rowY = doc.y;
      const rowHeight = 22;
      let x = leftMargin;

      doc.save();
      for (let i = 0; i < cells.length; i++) {
        const w = colWidths[i] || 100;
        doc.rect(x, rowY, w, rowHeight).stroke("#CCCCCC");
        const font = isHeader ? "Helvetica-Bold" : "Helvetica";
        doc.font(font).fontSize(8).text(cells[i] || "", x + 4, rowY + 6, { width: w - 8, lineBreak: false });
        x += w;
      }
      doc.restore();
      doc.x = leftMargin;
      doc.y = rowY + rowHeight;
    };

    let pendingTableRows: { cells: string[]; isHeader: boolean }[] = [];

    const flushPdfTable = () => {
      if (pendingTableRows.length === 0) return;
      const maxCols = Math.max(...pendingTableRows.map(r => r.cells.length));
      let colWidths: number[];
      if (maxCols === 2) {
        colWidths = [180, pageWidth - 180];
      } else if (maxCols === 4) {
        colWidths = [120, 125, 125, 125];
      } else {
        colWidths = Array(maxCols).fill(Math.floor(pageWidth / maxCols));
      }
      for (const row of pendingTableRows) {
        while (row.cells.length < maxCols) row.cells.push("");
        drawTableRow(row.cells, row.isHeader, colWidths);
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

    doc.end();
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}

export function getDocFilePath(filePath: string): string | null {
  if (filePath && fs.existsSync(filePath)) return filePath;
  return null;
}
