import PDFDocument from "pdfkit";
import { formatMoney } from "@/lib/format";
import type { IncomeStatementResult, IncomeStatementRowView } from "@/lib/income-statement";

const GROUP_LABELS = ["ALIMENTO", "BEBIDAS", "MISCELANEOS", "CONSOLIDADO"] as const;

function moneyCell(n: number): string {
  return formatMoney(n);
}

function pctCell(n: number | null): string {
  return n !== null ? `${n.toFixed(2)}%` : "-";
}

export async function buildIncomeStatementPdf(
  result: IncomeStatementResult,
  rows: IncomeStatementRowView[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: "letter", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.font("Helvetica-Bold").fontSize(18).text("Estado de Resultados", left, doc.y);
    doc.moveDown(0.2);
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#555555")
      .text(`${result.organizationName} - ${result.sucursalName}`, left, doc.y);
    doc.text(`${result.initialDateLabel} - ${result.finalDateLabel}`, left, doc.y);
    doc.fillColor("#000000");
    doc.moveDown(0.8);

    const conceptFrac = 0.2;
    const groupFrac = (1 - conceptFrac) / 4;
    const valueFrac = groupFrac * 0.6;
    const pctFrac = groupFrac * 0.4;

    const colX: number[] = [left];
    const colW: number[] = [usableWidth * conceptFrac];
    for (let g = 0; g < 4; g++) {
      colX.push(colX[colX.length - 1] + colW[colW.length - 1]);
      colW.push(usableWidth * valueFrac);
      colX.push(colX[colX.length - 1] + colW[colW.length - 1]);
      colW.push(usableWidth * pctFrac);
    }
    const GAP = 4;

    function drawGroupHeader() {
      const y = doc.y;
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff");
      doc.rect(left, y - 2, usableWidth, 16).fill("#262626");
      doc.fillColor("#ffffff");
      GROUP_LABELS.forEach((label, g) => {
        const colIndex = 1 + g * 2;
        const groupWidth = colW[colIndex] + colW[colIndex + 1];
        doc.text(label, colX[colIndex], y, { width: groupWidth, align: "center" });
      });
      doc.fillColor("#000000");
      doc.y = y + 18;
    }

    function drawRow(
      label: string,
      values: { value: number | null; pct: string }[],
      opts: { bold?: boolean; highlight?: boolean } = {},
    ) {
      const y = doc.y;
      const rowHeight = 14;
      if (opts.highlight) {
        doc.rect(left, y - 2, usableWidth, rowHeight + 2).fill("#fffbeb");
      }
      doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).fillColor("#000000");
      doc.text(label, colX[0], y, { width: colW[0] - GAP });
      values.forEach((v, g) => {
        const colIndex = 1 + g * 2;
        const color = v.value !== null && v.value < 0 ? "#dc2626" : "#000000";
        const text = v.value !== null ? moneyCell(v.value) : "";
        doc.fillColor(color).text(text, colX[colIndex], y, { width: colW[colIndex] - GAP, align: "right" });
        doc.fillColor("#555555").text(v.pct, colX[colIndex + 1], y, { width: colW[colIndex + 1] - GAP, align: "right" });
      });
      doc.fillColor("#000000");
      doc.y = y + rowHeight;
    }

    function drawRowView(row: IncomeStatementRowView) {
      drawRow(
        row.label,
        [
          { value: row.alimento, pct: row.pctMode === "none" ? "" : pctCell(row.alimentoPct) },
          { value: row.bebidas, pct: row.pctMode === "none" ? "" : pctCell(row.bebidasPct) },
          { value: row.miscelaneos, pct: row.pctMode === "none" ? "" : pctCell(row.miscelaneosPct) },
          { value: row.consolidado, pct: row.pctMode === "none" ? "" : pctCell(row.consolidadoPct) },
        ],
        { bold: row.bold, highlight: row.highlight },
      );
    }

    drawGroupHeader();
    drawRowView(rows[0]);
    drawRowView(rows[1]);
    drawRowView(rows[2]);
    doc.moveDown(0.5);

    for (let i = 3; i < rows.length; i++) drawRowView(rows[i]);
    doc.moveDown(0.5);

    drawRow("Monto pagado", [
      { value: null, pct: "" },
      { value: null, pct: "" },
      { value: null, pct: "" },
      { value: result.montoPagado, pct: "" },
    ]);
    drawRow(
      "Venta promedio diaria",
      [
        { value: null, pct: "" },
        { value: null, pct: "" },
        { value: null, pct: "" },
        { value: result.ventaPromedioDiaria.consolidado, pct: "" },
      ],
      { bold: true },
    );

    doc.moveDown(0.4);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#888888")
      .text(`${result.diasActivos} dias activos (con venta registrada) en el periodo.`, left, doc.y);

    doc.end();
  });
}
