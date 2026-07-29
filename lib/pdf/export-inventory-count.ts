import PDFDocument from "pdfkit";

export type InventoryCountPdfRow = {
  categoryName: string | null;
  type: "Producto" | "Subreceta";
  name: string;
  unitLabel: string;
  quantity: number;
  unitCost: number;
  total: number;
};

export type InventoryCountPdfData = {
  organizationName: string;
  dateLabel: string;
  rows: InventoryCountPdfRow[];
  grandTotal: number;
};

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const COLUMNS = [
  { key: "category", label: "Categoria", frac: 0.15 },
  { key: "type", label: "Tipo", frac: 0.1 },
  { key: "name", label: "Nombre", frac: 0.3 },
  { key: "quantity", label: "Cantidad", frac: 0.15 },
  { key: "unitCost", label: "Costo unit.", frac: 0.15 },
  { key: "total", label: "Total", frac: 0.15 },
] as const;

const RIGHT_ALIGNED = ["quantity", "unitCost", "total"];

export async function buildInventoryCountPdf(data: InventoryCountPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "letter" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.font("Helvetica-Bold").fontSize(20).text("Conteo de inventario", left, doc.y);
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10).fillColor("#555555");
    doc.text(`${data.organizationName}   -   Fecha: ${data.dateLabel}`, left, doc.y);
    doc.fillColor("#000000");
    doc.moveDown(0.8);

    const colX: number[] = [];
    const colW: number[] = [];
    let cursor = left;
    for (const col of COLUMNS) {
      colX.push(cursor);
      const w = usableWidth * col.frac;
      colW.push(w);
      cursor += w;
    }
    const GAP = 6;
    const bottomLimit = doc.page.height - doc.page.margins.bottom;

    function drawHeader() {
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#555555");
      const y = doc.y;
      let maxHeight = 0;
      COLUMNS.forEach((col, i) => {
        const align = RIGHT_ALIGNED.includes(col.key) ? "right" : "left";
        maxHeight = Math.max(maxHeight, doc.heightOfString(col.label, { width: colW[i] - GAP, align }));
      });
      COLUMNS.forEach((col, i) => {
        const align = RIGHT_ALIGNED.includes(col.key) ? "right" : "left";
        doc.text(col.label, colX[i], y, { width: colW[i] - GAP, align });
      });
      doc.fillColor("#000000");
      doc.y = y + maxHeight + 4;
      doc.moveTo(left, doc.y).lineTo(left + usableWidth, doc.y).strokeColor("#dddddd").stroke();
      doc.moveDown(0.3);
    }

    drawHeader();
    doc.font("Helvetica").fontSize(9);

    if (data.rows.length === 0) {
      doc.fillColor("#888888").text("Este conteo no tiene cantidades capturadas.", left, doc.y);
      doc.fillColor("#000000");
    } else {
      for (const row of data.rows) {
        const values: Record<(typeof COLUMNS)[number]["key"], string> = {
          category: row.categoryName ?? "-",
          type: row.type,
          name: row.name,
          quantity: `${row.quantity.toLocaleString("es-MX", { maximumFractionDigits: 2 })} ${row.unitLabel}`,
          unitCost: money(row.unitCost),
          total: money(row.total),
        };

        const rowY = doc.y;
        let maxHeight = 0;
        COLUMNS.forEach((col, i) => {
          const align = RIGHT_ALIGNED.includes(col.key) ? "right" : "left";
          const h = doc.heightOfString(values[col.key], { width: colW[i] - GAP, align });
          maxHeight = Math.max(maxHeight, h);
        });

        if (rowY + maxHeight > bottomLimit) {
          doc.addPage();
          drawHeader();
          doc.font("Helvetica").fontSize(9);
        }

        const y = doc.y;
        COLUMNS.forEach((col, i) => {
          const align = RIGHT_ALIGNED.includes(col.key) ? "right" : "left";
          doc.text(values[col.key], colX[i], y, { width: colW[i] - GAP, align });
        });
        doc.y = y + maxHeight + 5;
      }
    }

    doc.moveDown(0.5);
    doc.moveTo(left, doc.y).lineTo(left + usableWidth, doc.y).strokeColor("#dddddd").stroke();
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(12).text(`Total: ${money(data.grandTotal)}`, left, doc.y, {
      width: usableWidth,
      align: "right",
    });

    doc.end();
  });
}
