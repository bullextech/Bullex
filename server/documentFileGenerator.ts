import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
} from "docx";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const docsDir = path.join(process.cwd(), "generated_docs");
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

function parseContentToSections(content: string): Array<{ type: "heading" | "subheading" | "separator" | "text"; text: string }> {
  const lines = content.split("\n");
  const sections: Array<{ type: "heading" | "subheading" | "separator" | "text"; text: string }> = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      sections.push({ type: "text", text: "" });
    } else if (trimmed.match(/^={3,}$/)) {
      sections.push({ type: "separator", text: "" });
    } else if (trimmed.match(/^[A-Z][A-Z &'/()\-]{2,}$/) && !trimmed.startsWith("[")) {
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
  const children: Paragraph[] = [];

  for (const section of sections) {
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
    const doc = new PDFDocument({ size: "A4", margin: 60 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const sections = parseContentToSections(content);

    for (const section of sections) {
      if (section.type === "heading") {
        doc.moveDown(0.5);
        doc.font("Helvetica-Bold").fontSize(16).text(section.text, { align: "center" });
        doc.moveDown(0.3);
      } else if (section.type === "separator") {
        doc.moveDown(0.3);
        const y = doc.y;
        doc.moveTo(60, y).lineTo(535, y).stroke();
        doc.moveDown(0.5);
      } else if (section.type === "subheading") {
        doc.moveDown(0.8);
        doc.font("Helvetica-Bold").fontSize(11).text(section.text);
        doc.moveDown(0.2);
      } else if (section.text === "") {
        doc.moveDown(0.3);
      } else {
        doc.font("Helvetica").fontSize(10).text(section.text, { lineGap: 2 });
      }

      if (doc.y > 750) {
        doc.addPage();
      }
    }

    doc.end();
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}

export function getDocFilePath(filePath: string): string | null {
  if (filePath && fs.existsSync(filePath)) return filePath;
  return null;
}
