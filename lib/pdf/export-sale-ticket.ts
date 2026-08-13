import PDFDocument from "pdfkit";

export type SaleTicketPdfItem = {
  recipeName: string;
  quantity: string;
  unitPriceLabel: string;
  totalLabel: string;
};

export type SaleTicketPdfData = {
  folioLabel: string;
  dateLabel: string;
  organizationName: string;
  sucursalName: string;
  items: SaleTicketPdfItem[];
  totalLabel: string;
};

const LOGO_SIZE = 70;

export async function buildSaleTicketPdf(data: SaleTicketPdfData, logo: Buffer | null = null): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "letter" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const headerTop = doc.y;

    // Igual que en el PDF de recetas: el logo va a opacidad normal en la esquina superior
    // izquierda, no como marca de agua, y el titulo queda centrado junto a el.
    let logoDrawn = false;
    if (logo) {
      try {
        doc.image(logo, left, headerTop, { fit: [LOGO_SIZE, LOGO_SIZE], align: "center", valign: "center" });
        logoDrawn = true;
      } catch {
        // pdfkit solo soporta JPEG/PNG; si el logo no es compatible se omite del ticket.
      }
    }

    const titleAreaX = logoDrawn ? left + LOGO_SIZE + 16 : left;
    const titleAreaWidth = usableWidth - (logoDrawn ? LOGO_SIZE + 16 : 0);

    doc.font("Helvetica-Bold").fontSize(18).text(data.organizationName, titleAreaX, headerTop, {
      width: titleAreaWidth,
    });
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(10).fillColor("#555555");
    doc.text(data.sucursalName, titleAreaX, doc.y, { width: titleAreaWidth });
    doc.fillColor("#000000");

    if (logoDrawn) doc.y = Math.max(doc.y, headerTop + LOGO_SIZE);
    doc.moveDown(0.8);

    doc.font("Helvetica-Bold").fontSize(16).text(`Ticket ${data.folioLabel}`, left, doc.y);
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(10).fillColor("#555555");
    doc.text(`Fecha: ${data.dateLabel}`, left, doc.y);
    doc.fillColor("#000000");
    doc.moveDown(0.6);

    const colX = {
      name: left,
      qty: left + usableWidth * 0.5,
      price: left + usableWidth * 0.68,
      total: left + usableWidth * 0.84,
    };
    const nameWidth = colX.qty - colX.name - 10;
    const qtyWidth = colX.price - colX.qty - 10;
    const priceWidth = colX.total - colX.price - 10;
    const totalWidth = left + usableWidth - colX.total;

    const headerY = doc.y;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#555555");
    doc.text("Platillo", colX.name, headerY, { width: nameWidth });
    doc.text("Cant.", colX.qty, headerY, { width: qtyWidth });
    doc.text("Precio", colX.price, headerY, { width: priceWidth });
    doc.text("Importe", colX.total, headerY, { width: totalWidth });
    doc.fillColor("#000000");
    doc.moveDown(0.3);
    doc.moveTo(left, doc.y).lineTo(left + usableWidth, doc.y).strokeColor("#dddddd").stroke();
    doc.moveDown(0.5);

    doc.font("Helvetica").fontSize(10);
    for (const item of data.items) {
      const rowY = doc.y;
      const nameHeight = doc.heightOfString(item.recipeName, { width: nameWidth });
      doc.text(item.recipeName, colX.name, rowY, { width: nameWidth });
      doc.text(item.quantity, colX.qty, rowY, { width: qtyWidth });
      doc.text(item.unitPriceLabel, colX.price, rowY, { width: priceWidth });
      doc.text(item.totalLabel, colX.total, rowY, { width: totalWidth });
      doc.y = rowY + nameHeight;
      doc.moveDown(0.4);
      doc.moveTo(left, doc.y).lineTo(left + usableWidth, doc.y).strokeColor("#f0f0f0").stroke();
      doc.moveDown(0.4);
    }

    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(13).text(`Total: ${data.totalLabel}`, left, doc.y, {
      width: usableWidth,
      align: "right",
    });

    doc.end();
  });
}
