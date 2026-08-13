import PDFDocument from "pdfkit";

export type RecipePdfItem = {
  label: string;
  isSubRecipe: boolean;
  categoryName: string | null;
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
  photo: Buffer | null;
};

const PHOTO_SIZE = 110;

function drawRecipe(doc: PDFKit.PDFDocument, data: RecipePdfData, logo: Buffer | null) {
  const left = doc.page.margins.left;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const headerTop = doc.y;

  // El logo va a la izquierda (a la misma altura que la foto de la receta a la derecha), a
  // opacidad normal -- no es una marca de agua, es parte del encabezado. El titulo/categoria/
  // rendimiento quedan centrados en la franja que sobra entre el logo y la foto.
  let logoDrawn = false;
  if (logo) {
    try {
      doc.image(logo, left, headerTop, { fit: [PHOTO_SIZE, PHOTO_SIZE], align: "center", valign: "center" });
      logoDrawn = true;
    } catch {
      // pdfkit solo soporta JPEG/PNG; si el logo quedara en un formato no soportado, se omite en
      // vez de tumbar el PDF completo.
    }
  }

  let photoDrawn = false;
  if (data.photo) {
    try {
      doc.image(data.photo, left + usableWidth - PHOTO_SIZE, headerTop, {
        width: PHOTO_SIZE,
        height: PHOTO_SIZE,
      });
      photoDrawn = true;
    } catch {
      // pdfkit solo soporta JPEG/PNG; una foto guardada en otro formato (de antes de normalizar
      // al subir) no debe tumbar el PDF completo, solo se omite del encabezado.
    }
  }

  const titleAreaX = logoDrawn ? left + PHOTO_SIZE + 16 : left;
  const titleAreaWidth = usableWidth - (logoDrawn ? PHOTO_SIZE + 16 : 0) - (photoDrawn ? PHOTO_SIZE + 16 : 0);

  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .text(data.name, titleAreaX, headerTop, { width: titleAreaWidth, align: "center" });
  doc.moveDown(0.4);

  doc.font("Helvetica").fontSize(10).fillColor("#555555");
  if (data.categoryName) {
    doc.text(`Categoria: ${data.categoryName}`, titleAreaX, doc.y, { width: titleAreaWidth, align: "center" });
  }
  doc.text(`Rendimiento: ${data.yieldQty} ${data.yieldUnitLabel}`, titleAreaX, doc.y, {
    width: titleAreaWidth,
    align: "center",
  });
  const extraMetaParts = [
    data.isMenuItem ? "Platillo de menu" : "Subreceta",
    data.sellingPrice ? `Precio de venta: ${data.sellingPrice}` : null,
  ].filter(Boolean);
  if (extraMetaParts.length > 0) {
    doc.text(extraMetaParts.join("   -   "), titleAreaX, doc.y, { width: titleAreaWidth, align: "center" });
  }
  doc.fillColor("#000000");
  doc.moveDown(1);

  if (logoDrawn || photoDrawn) {
    doc.y = Math.max(doc.y, headerTop + PHOTO_SIZE + 10);
  }

  // Resumen de costo
  doc.font("Helvetica-Bold").fontSize(12).text("Costo", left, doc.y);
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(11);
  if (data.costError) {
    doc.fillColor("#b91c1c").text(`Error de costeo: ${data.costError}`, left, doc.y);
    doc.fillColor("#000000");
  } else {
    doc.text(`Costo total: ${data.totalCost}`, left, doc.y);
    if (data.costPerYieldUnit) {
      doc.text(`Costo por ${data.yieldUnitLabel}: ${data.costPerYieldUnit}`, left, doc.y);
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
    type: left + usableWidth * 0.3,
    qty: left + usableWidth * 0.47,
    unit: left + usableWidth * 0.59,
    unitCost: left + usableWidth * 0.71,
    lineCost: left + usableWidth * 0.86,
  };
  const headerY = doc.y;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#555555");
  doc.text("Ingrediente", colX.name, headerY, { width: colX.type - colX.name - GAP });
  doc.text("Subcategoria", colX.type, headerY, { width: colX.qty - colX.type - GAP });
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
    const nameWidth = colX.type - colX.name - GAP;
    const typeWidth = colX.qty - colX.type - GAP;
    const sortedItems = [...data.items].sort((a, b) => a.label.localeCompare(b.label, "es"));
    for (const item of sortedItems) {
      const rowY = doc.y;
      const subcategoryLabel = item.isSubRecipe ? "SUBRECETA" : (item.categoryName ?? "-");
      // El nombre del ingrediente o la subcategoria pueden envolver a dos o mas lineas; la altura
      // de la fila debe seguir a la celda mas alta, o la siguiente fila queda encimada encima.
      const rowHeight = Math.max(
        doc.heightOfString(item.label, { width: nameWidth }),
        doc.heightOfString(subcategoryLabel, { width: typeWidth }),
        doc.currentLineHeight(),
      );
      doc.text(item.label, colX.name, rowY, { width: nameWidth });
      doc.text(subcategoryLabel, colX.type, rowY, { width: typeWidth });
      doc.text(item.quantity, colX.qty, rowY, { width: colX.unit - colX.qty - GAP, align: "right" });
      doc.text(item.unitLabel, colX.unit, rowY, { width: colX.unitCost - colX.unit - GAP });
      doc.text(item.unitCost ? item.unitCost : "-", colX.unitCost, rowY, {
        width: colX.lineCost - colX.unitCost - GAP,
        align: "right",
      });
      doc.text(item.lineCost ? item.lineCost : "-", colX.lineCost, rowY, {
        width: left + usableWidth - colX.lineCost,
        align: "right",
      });
      doc.y = rowY + rowHeight + 4;
    }

    if (data.totalCost) {
      doc.moveDown(0.2);
      doc
        .moveTo(colX.unitCost, doc.y)
        .lineTo(left + usableWidth, doc.y)
        .strokeColor("#dddddd")
        .stroke();
      doc.moveDown(0.2);
      const totalY = doc.y;
      doc.font("Helvetica-Bold").fontSize(10);
      doc.text("Total", colX.unitCost, totalY, { width: colX.lineCost - colX.unitCost - GAP, align: "right" });
      doc.text(data.totalCost, colX.lineCost, totalY, {
        width: left + usableWidth - colX.lineCost,
        align: "right",
      });
      doc.font("Helvetica").fontSize(10);
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

export async function buildRecipePdf(data: RecipePdfData, logo: Buffer | null = null): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "letter" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawRecipe(doc, data, logo);

    doc.end();
  });
}

/** Un PDF con todas las recetas, cada una en su propia pagina (mismo formato que la receta individual). */
export async function buildRecipesPdf(recipes: RecipePdfData[], logo: Buffer | null = null): Promise<Buffer> {
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
        drawRecipe(doc, data, logo);
      });
    }

    doc.end();
  });
}
