import PDFDocument from "pdfkit";

export type OrderPdfItem = {
  productName: string;
  presentationLabel: string;
  quantityLabel: string;
  comment: string | null;
};

export type OrderPdfData = {
  folioLabel: string;
  dateLabel: string;
  supplierName: string | null;
  comment: string | null;
  items: OrderPdfItem[];
};

export async function buildOrderPdf(data: OrderPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "letter" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.font("Helvetica-Bold").fontSize(20).text(`Pedido ${data.folioLabel}`, left, doc.y);
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10).fillColor("#555555");
    const metaParts = [`Fecha: ${data.dateLabel}`, data.supplierName ? `Proveedor: ${data.supplierName}` : null].filter(
      Boolean,
    );
    doc.text(metaParts.join("   -   "), left, doc.y);
    doc.fillColor("#000000");
    doc.moveDown(0.6);
    if (data.comment) {
      doc.font("Helvetica-Bold").fontSize(10).text("Comentarios", left, doc.y);
      doc.moveDown(0.2);
      doc.font("Helvetica").fontSize(10).text(data.comment, left, doc.y, { width: usableWidth });
      doc.moveDown(0.6);
    }
    doc.moveDown(0.4);

    const GAP = 16;
    const colX = {
      name: left,
      qty: left + usableWidth * 0.6,
    };
    const nameWidth = colX.qty - colX.name - GAP;
    const qtyWidth = left + usableWidth - colX.qty;

    const headerY = doc.y;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#555555");
    doc.text("Producto", colX.name, headerY, { width: nameWidth });
    doc.text("Cantidad", colX.qty, headerY, { width: qtyWidth });
    doc.fillColor("#000000");
    doc.moveDown(0.3);
    doc
      .moveTo(left, doc.y)
      .lineTo(left + usableWidth, doc.y)
      .strokeColor("#dddddd")
      .stroke();
    doc.moveDown(0.5);

    doc.font("Helvetica").fontSize(10);
    if (data.items.length === 0) {
      doc.fillColor("#888888").text("Este pedido no tiene productos.", left, doc.y);
      doc.fillColor("#000000");
    } else {
      const lineHeight = doc.currentLineHeight();
      for (const item of data.items) {
        // Cuando una presentacion combina piezas de varias presentaciones (ej. "1 COSTAL 25 KG +
        // 1 BOLSA Q KG"), cada una se imprime en su propio renglon dentro de la columna Cantidad,
        // en vez de amontonarlas en una sola linea que se envuelve feo.
        const parts = item.quantityLabel.split(" + ").map((p) => p.trim());
        const rowY = doc.y;

        doc.font("Helvetica").fontSize(10);
        const nameHeight = doc.heightOfString(item.productName, { width: nameWidth });

        let commentHeight = 0;
        if (item.comment) {
          doc.font("Helvetica-Oblique").fontSize(8);
          commentHeight = doc.heightOfString(item.comment, { width: nameWidth });
        }

        // Cuando hay mas de una presentacion, se les da espacio extra entre si y un "+" al inicio
        // de cada una despues de la primera, para que quede claro que hay que surtir todas juntas
        // (no son alternativas).
        const partGap = parts.length > 1 ? 6 : 0;
        const qtyHeight = parts.length * lineHeight + (parts.length - 1) * partGap;
        const nameColHeight = nameHeight + (item.comment ? 3 + commentHeight : 0);
        const rowHeight = Math.max(nameColHeight, qtyHeight);

        doc.font("Helvetica").fontSize(10).fillColor("#000000");
        doc.text(item.productName, colX.name, rowY, { width: nameWidth });
        if (item.comment) {
          doc.font("Helvetica-Oblique").fontSize(8).fillColor("#777777");
          doc.text(item.comment, colX.name, rowY + nameHeight + 3, { width: nameWidth });
          doc.fillColor("#000000").font("Helvetica").fontSize(10);
        }
        doc.font("Helvetica").fontSize(10).fillColor("#000000");
        parts.forEach((part, i) => {
          const label = i === 0 ? part : `+ ${part}`;
          doc.text(label, colX.qty, rowY + i * (lineHeight + partGap), { width: qtyWidth });
        });

        doc.y = rowY + rowHeight;
        doc.moveDown(0.4);
        doc
          .moveTo(left, doc.y)
          .lineTo(left + usableWidth, doc.y)
          .strokeColor("#f0f0f0")
          .stroke();
        doc.moveDown(0.4);
      }
    }

    doc.end();
  });
}
