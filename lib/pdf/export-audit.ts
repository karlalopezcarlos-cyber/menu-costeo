import PDFDocument from "pdfkit";

export type AuditPdfRow = {
  categoryName: string | null;
  itemType: "product" | "subrecipe";
  name: string;
  unitLabel: string;
  theoreticalLabel: string;
  actualLabel: string;
  varianceLabel: string;
  previousVarianceLabel: string;
  varianceAmount: number | null;
  variancePct: number | null;
  comment: string | null;
};

export type AuditPdfData = {
  organizationName: string;
  initialDateLabel: string;
  finalDateLabel: string | null;
  filtersSummary: string[];
  totalShortageAmount: number;
  totalSurplusAmount: number;
  rows: AuditPdfRow[];
};

function money(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

const COLUMNS = [
  { key: "category", label: "Categoria", frac: 0.1 },
  { key: "type", label: "Tipo", frac: 0.07 },
  { key: "name", label: "Nombre", frac: 0.17 },
  { key: "theoretical", label: "Teorico", frac: 0.11 },
  { key: "actual", label: "Real", frac: 0.09 },
  { key: "variance", label: "Variacion", frac: 0.11 },
  { key: "previousVariance", label: "Variacion anterior", frac: 0.11 },
  { key: "varianceAmount", label: "Variacion $", frac: 0.08 },
  { key: "variancePct", label: "Variacion %", frac: 0.08 },
  { key: "comment", label: "Comentario", frac: 0.08 },
] as const;

const RIGHT_ALIGNED_COLUMNS = [
  "theoretical",
  "actual",
  "variance",
  "previousVariance",
  "varianceAmount",
  "variancePct",
];

export async function buildAuditPdf(data: AuditPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "letter", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Portada
    doc
      .font("Helvetica-Bold")
      .fontSize(28)
      .text("Auditoria de Inventario", left, 220, { width: usableWidth, align: "center" });
    doc.moveDown(0.6);
    doc
      .font("Helvetica")
      .fontSize(14)
      .fillColor("#555555")
      .text(data.organizationName, { width: usableWidth, align: "center" });
    doc.moveDown(1.2);

    const periodText = `Periodo: ${data.initialDateLabel} ${
      data.finalDateLabel ? `a ${data.finalDateLabel}` : "(proyeccion a hoy)"
    }`;
    doc.fontSize(12).fillColor("#000000").text(periodText, { width: usableWidth, align: "center" });
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .fillColor("#888888")
      .text(
        `Generado: ${new Date().toLocaleString("es-MX", { timeZone: "UTC" })}`,
        { width: usableWidth, align: "center" },
      );

    if (data.filtersSummary.length > 0) {
      doc.moveDown(0.6);
      doc
        .fontSize(10)
        .fillColor("#888888")
        .text(`Filtros aplicados: ${data.filtersSummary.join(" | ")}`, { width: usableWidth, align: "center" });
    }

    doc.moveDown(2);
    const cardY = doc.y;
    const cardWidth = usableWidth / 2 - 10;
    const cardHeight = 70;

    doc.roundedRect(left, cardY, cardWidth, cardHeight, 6).strokeColor("#dddddd").stroke();
    doc.font("Helvetica").fontSize(10).fillColor("#555555").text("Monto total de faltantes", left + 14, cardY + 14);
    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor("#dc2626")
      .text(`-$${data.totalShortageAmount.toFixed(2)}`, left + 14, cardY + 32);

    const card2X = left + cardWidth + 20;
    doc.roundedRect(card2X, cardY, cardWidth, cardHeight, 6).strokeColor("#dddddd").stroke();
    doc.font("Helvetica").fontSize(10).fillColor("#555555").text("Monto total de sobrantes", card2X + 14, cardY + 14);
    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor("#059669")
      .text(`+$${data.totalSurplusAmount.toFixed(2)}`, card2X + 14, cardY + 32);

    doc.fillColor("#000000");

    // Detalle
    doc.addPage();

    const colX: number[] = [];
    const colW: number[] = [];
    let cursor = left;
    for (const col of COLUMNS) {
      colX.push(cursor);
      const w = usableWidth * col.frac;
      colW.push(w);
      cursor += w;
    }
    const GAP = 4;
    const bottomLimit = doc.page.height - doc.page.margins.bottom;

    function drawHeader() {
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#555555");
      const y = doc.y;
      COLUMNS.forEach((col, i) => {
        const align = RIGHT_ALIGNED_COLUMNS.includes(col.key) ? "right" : "left";
        doc.text(col.label, colX[i], y, { width: colW[i] - GAP, align });
      });
      doc.fillColor("#000000");
      doc.moveDown(0.3);
      doc
        .moveTo(left, doc.y)
        .lineTo(left + usableWidth, doc.y)
        .strokeColor("#dddddd")
        .stroke();
      doc.moveDown(0.3);
    }

    doc.font("Helvetica-Bold").fontSize(16).text("Detalle de variaciones", left, doc.y);
    doc.moveDown(0.6);
    drawHeader();

    doc.font("Helvetica").fontSize(8);
    if (data.rows.length === 0) {
      doc.fillColor("#888888").text("Ningun resultado coincide con la seleccion aplicada.", left, doc.y);
      doc.fillColor("#000000");
    } else {
      for (const row of data.rows) {
        const values: Record<(typeof COLUMNS)[number]["key"], string> = {
          category: row.categoryName ?? "-",
          type: row.itemType === "product" ? "Producto" : "Subreceta",
          name: row.name,
          theoretical: `${row.theoreticalLabel} ${row.unitLabel}`,
          actual: row.actualLabel,
          variance: row.varianceLabel,
          previousVariance: row.previousVarianceLabel,
          varianceAmount: row.varianceAmount !== null ? money(row.varianceAmount) : "-",
          variancePct: row.variancePct !== null ? `${row.variancePct > 0 ? "+" : ""}${row.variancePct.toFixed(1)}%` : "-",
          comment: row.comment ?? "",
        };

        const rowY = doc.y;
        let maxHeight = 0;
        COLUMNS.forEach((col, i) => {
          const align = RIGHT_ALIGNED_COLUMNS.includes(col.key) ? "right" : "left";
          const h = doc.heightOfString(values[col.key], { width: colW[i] - GAP, align });
          maxHeight = Math.max(maxHeight, h);
        });

        if (rowY + maxHeight > bottomLimit) {
          doc.addPage();
          doc.font("Helvetica-Bold").fontSize(16).text("Detalle de variaciones (continuacion)", left, doc.y);
          doc.moveDown(0.6);
          drawHeader();
          doc.font("Helvetica").fontSize(8);
        }

        const y = doc.y;
        COLUMNS.forEach((col, i) => {
          const align = RIGHT_ALIGNED_COLUMNS.includes(col.key) ? "right" : "left";
          doc.text(values[col.key], colX[i], y, { width: colW[i] - GAP, align });
        });
        doc.y = y + maxHeight + 6;
      }
    }

    doc.end();
  });
}
