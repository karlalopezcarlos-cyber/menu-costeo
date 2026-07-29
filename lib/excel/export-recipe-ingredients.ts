import ExcelJS from "exceljs";

export type RecipeIngredientExportRow = {
  recipeName: string;
  recipeType: string;
  yieldLabel: string;
  ingredientName: string;
  quantity: string;
  unitLabel: string;
  unitPrice: string | null;
  total: string | null;
  recipeCost: string | null;
  costPerUnit: string | null;
};

export async function buildRecipeIngredientsWorkbook(
  rows: RecipeIngredientExportRow[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Recetas");

  sheet.columns = [
    { header: "Receta", key: "recipeName", width: 28 },
    { header: "Tipo", key: "recipeType", width: 12 },
    { header: "Rendimiento", key: "yieldLabel", width: 14 },
    { header: "Ingrediente", key: "ingredientName", width: 28 },
    { header: "Cantidad", key: "quantity", width: 12 },
    { header: "Unidad", key: "unitLabel", width: 10 },
    { header: "Precio unitario", key: "unitPrice", width: 16 },
    { header: "Total", key: "total", width: 14 },
    { header: "Costo", key: "recipeCost", width: 14 },
    { header: "Costo unitario", key: "costPerUnit", width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getColumn("unitPrice").numFmt = '"$"#,##0.0000';
  sheet.getColumn("total").numFmt = '"$"#,##0.00';
  sheet.getColumn("recipeCost").numFmt = '"$"#,##0.00';
  sheet.getColumn("costPerUnit").numFmt = '"$"#,##0.0000';

  for (const row of rows) {
    sheet.addRow({
      recipeName: row.recipeName,
      recipeType: row.recipeType,
      yieldLabel: row.yieldLabel,
      ingredientName: row.ingredientName,
      quantity: row.quantity !== "-" ? Number(row.quantity) : row.quantity,
      unitLabel: row.unitLabel,
      unitPrice: row.unitPrice !== null ? Number(row.unitPrice) : "",
      total: row.total !== null ? Number(row.total) : "",
      recipeCost: row.recipeCost !== null ? Number(row.recipeCost) : "",
      costPerUnit: row.costPerUnit !== null ? Number(row.costPerUnit) : "",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
