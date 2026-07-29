import PDFDocument from "pdfkit";

export type RecipePdfItem = {
  label: string;
  isSubRecipe: boolean;
  quantity: string;
  unitLabel: string;
  unitCost: string | null;
  lineCost: string | null;
};

export type RecipePdfData = {
  name: string;
  categoryName: string | null;
  yieldQty: string;
  yieldUnitLabel: string;
  isMenuItem: boolean;
  sellingPrice: string | null;
  instructions: string | null;
  totalCost: string | null;
  costError: string | null;
  costPerYieldUnit: string | null;
  costPct: string | null;
  items: RecipePdfItem[];
};

function drawRecipe(doc: PDFKit.PDFDocument, data: RecipePdfData) {
  const left = doc.page.margins.left;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.font("Helvetica-Bold").fontSize(20).text(data.name, left, doc.y);
  doc.moveDown(0.3);

  doc.font("Helvetica").fontSize(10).fillColor("#555555");
  const metaParts = [
    data.categoryName ? `Categoria: ${data.categoryName}` : null,
    `Rendimiento: ${data.yieldQty} ${data.yieldUnitLabel}`,
    data.isMenuItem ? "Platillo de menu" : "Subreceta",
    data.sellingPrice ? `Precio de venta: $${data.sellingPrice}` : null,
  ].filter(Boolean);
  doc.text(metaParts.join("   -   "), left, doc.y);
  doc.fillColor("#000000");
  doc.moveDown(1);

  // Resumen de costo
  doc.font("Helvetica-Bold").fontSize(12).text("Costo", left, doc.y);
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(11);
  if (data.costError) {
    doc.fillColor("#b91c1c").text(`Error de costeo: ${data.costError}`, left, doc.y);
    doc.fillColor("#000000");
  } else {
    doc.text(`Costo total: $${data.totalCost}`, left, doc.y);
    if (data.costPerYieldUnit) {
      doc.text(`Costo por ${data.yieldUnitLabel}: $${data.costPerYieldUnit}`, left, doc.y);
    }
    if (data.costPct) {
      doc.text(`Costo %: ${data.costPct}%`, left, doc.y);
    }
  }
  doc.moveDown(1);

  // Tabla de ingredientes
  doc.font("Helvetica-Bold").fontSize(12).text("Ingredientes", left, doc.y);
  doc.moveDown(0.4);

  const GAP = 8;
  const colX = {
    name: left,
    qty: left + usableWidth * 0.42,
    unit: left + usableWidth * 0.58,
    unitCost: left + usableWidth * 0.7,
    lineCost: left + usableWidth * 0.86,
  };
  const headerY = doc.y;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#555555");
  doc.text("Ingrediente", colX.name, headerY, { width: colX.qty - colX.name - GAP });
  doc.text("Cantidad", colX.qty, headerY, { width: colX.unit - colX.qty - GAP, align: "right" });
  doc.text("Unidad", colX.unit, headerY, { width: colX.unitCost - colX.unit - GAP });
  doc.text("Costo unit.", colX.unitCost, headerY, {
    width: colX.lineCost - colX.unitCost - GAP,
    align: "right",
  });
  doc.text("Costo total", colX.lineCost, headerY, { width: left + usableWidth - colX.lineCost, align: "right" });
  doc.fillColor("#000000");
  doc.moveDown(0.3);
  doc
    .moveTo(left, doc.y)
    .lineTo(left + usableWidth, doc.y)
    .strokeColor("#dddddd")
    .stroke();
  doc.moveDown(0.3);

  doc.font("Helvetica").fontSize(10);
  if (data.items.length === 0) {
    doc.fillColor("#888888").text("Esta receta todavia no tiene ingredientes.", left, doc.y);
    doc.fillColor("#000000");
  } else {
    for (const item of data.items) {
      const rowY = doc.y;
      const label = item.isSubRecipe ? `${item.label} (subreceta)` : item.label;
      doc.text(label, colX.name, rowY, { width: colX.qty - colX.name - GAP });
      doc.text(item.quantity, colX.qty, rowY, { width: colX.unit - colX.qty - GAP, align: "right" });
      doc.text(item.unitLabel, colX.unit, rowY, { width: colX.unitCost - colX.unit - GAP });
      doc.text(item.unitCost ? `$${item.unitCost}` : "-", colX.unitCost, rowY, {
        width: colX.lineCost - colX.unitCost - GAP,
        align: "right",
      });
      doc.text(item.lineCost ? `$${item.lineCost}` : "-", colX.lineCost, rowY, {
        width: left + usableWidth - colX.lineCost,
        align: "right",
      });
      doc.moveDown(0.4);
    }
  }

  doc.moveDown(0.6);

  // Procedimientos
  doc.font("Helvetica-Bold").fontSize(12).text("Procedimientos", left, doc.y);
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(10);
  if (data.instructions && data.instructions.trim()) {
    const cleanInstructions = data.instructions.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    doc.text(cleanInstructions, left, doc.y, { width: usableWidth });
  } else {
    doc.fillColor("#888888").text("Sin procedimientos capturados.", left, doc.y);
    doc.fillColor("#000000");
  }
}

export async function buildRecipePdf(data: RecipePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "letter" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawRecipe(doc, data);

    doc.end();
  });
}

/** Un PDF con todas las recetas, cada una en su propia pagina (mismo formato que la receta individual). */
export async function buildRecipesPdf(recipes: RecipePdfData[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "letter" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (recipes.length === 0) {
      doc
        .font("Helvetica")
        .fontSize(12)
        .fillColor("#888888")
        .text("No hay recetas para exportar.", doc.page.margins.left, doc.y);
    } else {
      recipes.forEach((data, index) => {
        if (index > 0) doc.addPage();
        drawRecipe(doc, data);
      });
    }

    doc.end();
  });
}
