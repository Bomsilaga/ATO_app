import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, TextRun, WidthType } from "docx";
import { PrefillLabel, TaxEstimate, TaxSession } from "./types";

export interface ReportData {
  session: TaxSession;
  labels: PrefillLabel[];
  plainEnglishSummary: string;
  agentReviewFlags: string[];
  disclaimer: string;
  taxEstimate: TaxEstimate | null;
  generatedAt: string;
}

function currency(n: number): string {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

export function generatePdfReport(data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text(data.session.name, { continued: false });
    doc.fontSize(11).fillColor("#555").text(`FY ${data.session.financial_year} — generated ${new Date(data.generatedAt).toLocaleString("en-AU")}`);
    doc.moveDown(1);

    if (data.taxEstimate) {
      const e = data.taxEstimate;
      doc.fillColor("#000").fontSize(14).text(e.is_refund ? "Estimated refund" : "Estimated amount owing");
      doc.fontSize(22).fillColor(e.is_refund ? "#1a6b3c" : "#a3221f").text(currency(Math.abs(e.net_result)));
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor("#000");
      const rows: [string, string][] = [
        ["Total income", currency(e.total_income)],
        ["Total deductions", currency(e.total_deductions)],
        ["Taxable income", currency(e.taxable_income)],
        ["Tax on taxable income", currency(e.tax_on_taxable_income)],
        ["LITO offset", `-${currency(e.lito_offset)}`],
        ["Medicare levy", `+${currency(e.medicare_levy)}`],
        ["Total tax payable", currency(e.total_tax_payable)],
        ["Total tax withheld", currency(e.total_tax_withheld)]
      ];
      for (const [label, value] of rows) {
        doc.text(`${label}: ${value}`);
      }
      doc.moveDown(0.5);
      doc.fontSize(8).fillColor("#666").text(e.notes);
      doc.moveDown(1);
    }

    doc.fillColor("#000").fontSize(14).text("Label-mapped amounts");
    doc.moveDown(0.3);
    doc.fontSize(10);
    for (const l of data.labels) {
      const flag = l.agent_review_recommended ? "  [agent review]" : "";
      doc.text(`${l.question_code} — ${l.label}: ${currency(l.amount)}${flag}`);
    }
    doc.moveDown(1);

    if (data.agentReviewFlags.length > 0) {
      doc.fontSize(14).text("Flagged for review");
      doc.fontSize(10);
      for (const f of data.agentReviewFlags) doc.text(`• ${f}`);
      doc.moveDown(1);
    }

    doc.fontSize(8).fillColor("#666").text(data.disclaimer, { align: "left" });

    doc.end();
  });
}

export function generateXlsxReport(data: ReportData): Buffer {
  const wb = XLSX.utils.book_new();

  const summaryRows: (string | number)[][] = [
    [data.session.name],
    [`FY ${data.session.financial_year}`],
    [`Generated ${new Date(data.generatedAt).toLocaleString("en-AU")}`],
    []
  ];

  if (data.taxEstimate) {
    const e = data.taxEstimate;
    summaryRows.push(
      [e.is_refund ? "Estimated refund" : "Estimated amount owing", Math.abs(e.net_result)],
      ["Total income", e.total_income],
      ["Total deductions", e.total_deductions],
      ["Taxable income", e.taxable_income],
      ["Tax on taxable income", e.tax_on_taxable_income],
      ["LITO offset", -e.lito_offset],
      ["Medicare levy", e.medicare_levy],
      ["Total tax payable", e.total_tax_payable],
      ["Total tax withheld", e.total_tax_withheld],
      [],
      ["Notes", e.notes]
    );
  }

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  const labelRows = [
    ["Code", "Label", "Amount", "Agent review recommended"],
    ...data.labels.map((l) => [l.question_code, l.label, l.amount, l.agent_review_recommended ? "Yes" : ""])
  ];
  const labelSheet = XLSX.utils.aoa_to_sheet(labelRows);
  XLSX.utils.book_append_sheet(wb, labelSheet, "Labels");

  if (data.agentReviewFlags.length > 0) {
    const flagSheet = XLSX.utils.aoa_to_sheet([["Flagged for review"], ...data.agentReviewFlags.map((f) => [f])]);
    XLSX.utils.book_append_sheet(wb, flagSheet, "Review flags");
  }

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function generateDocxReport(data: ReportData): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: data.session.name, heading: HeadingLevel.TITLE }),
    new Paragraph({
      text: `FY ${data.session.financial_year} — generated ${new Date(data.generatedAt).toLocaleString("en-AU")}`
    })
  ];

  if (data.taxEstimate) {
    const e = data.taxEstimate;
    children.push(
      new Paragraph({ text: e.is_refund ? "Estimated refund" : "Estimated amount owing", heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: currency(Math.abs(e.net_result)), heading: HeadingLevel.HEADING_2 })
    );

    const rows: [string, string][] = [
      ["Total income", currency(e.total_income)],
      ["Total deductions", currency(e.total_deductions)],
      ["Taxable income", currency(e.taxable_income)],
      ["Tax on taxable income", currency(e.tax_on_taxable_income)],
      ["LITO offset", `-${currency(e.lito_offset)}`],
      ["Medicare levy", `+${currency(e.medicare_levy)}`],
      ["Total tax payable", currency(e.total_tax_payable)],
      ["Total tax withheld", currency(e.total_tax_withheld)]
    ];

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: rows.map(
          ([label, value]) =>
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph(label)] }),
                new TableCell({ children: [new Paragraph(value)] })
              ]
            })
        )
      }),
      new Paragraph({ children: [new TextRun({ text: e.notes, italics: true, size: 16 })] })
    );
  }

  children.push(new Paragraph({ text: "Label-mapped amounts", heading: HeadingLevel.HEADING_1 }));
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: ["Code", "Label", "Amount"].map(
            (h) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })
          )
        }),
        ...data.labels.map(
          (l) =>
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph(l.question_code + (l.agent_review_recommended ? " ⚑" : ""))] }),
                new TableCell({ children: [new Paragraph(l.label)] }),
                new TableCell({ children: [new Paragraph(currency(l.amount))] })
              ]
            })
        )
      ]
    })
  );

  if (data.agentReviewFlags.length > 0) {
    children.push(new Paragraph({ text: "Flagged for review", heading: HeadingLevel.HEADING_1 }));
    for (const f of data.agentReviewFlags) children.push(new Paragraph({ text: f, bullet: { level: 0 } }));
  }

  children.push(
    new Paragraph({ text: "" }),
    new Paragraph({ children: [new TextRun({ text: data.disclaimer, size: 16, italics: true })] })
  );

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
