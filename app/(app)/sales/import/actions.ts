"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { parseWorkbook } from "@/lib/excel/parse-sales-import";
import { processBatchRows } from "@/lib/import-processing";

export async function createImportBatch(formData: FormData) {
  const user = await requireSucursalContext();

  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) throw new Error("Selecciona un archivo .xlsx.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const { headers, rows } = await parseWorkbook(buffer);

  if (headers.length === 0) throw new Error("No se pudo leer el archivo. Verifica que sea un .xlsx valido.");

  const batch = await prisma.importBatch.create({
    data: {
      organizationId: user.organizationId,
      sucursalId: user.sucursalId,
      fileName: file.name,
      headers,
      rawRows: rows,
      uploadedByUserId: user.id,
    },
  });

  redirect(`/sales/import/${batch.id}/mapping`);
}

export async function processImportBatch(batchId: string, formData: FormData) {
  const user = await requireSucursalContext();

  const dateHeader = String(formData.get("dateHeader") ?? "");
  const nameHeader = String(formData.get("nameHeader") ?? "");
  const qtyHeader = String(formData.get("qtyHeader") ?? "");
  const priceHeader = String(formData.get("priceHeader") ?? "");

  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, sucursalId: user.sucursalId },
  });
  if (!batch) throw new Error("Lote de importacion no encontrado.");

  const headers = batch.headers as string[];
  const rawRows = batch.rawRows as string[][];

  const { rowsMatched, rowsPending } = await processBatchRows(
    user.organizationId,
    user.sucursalId,
    batch.id,
    headers,
    rawRows,
    { dateHeader, nameHeader, qtyHeader, priceHeader },
  );

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status: "PROCESSED",
      columnMapping: { dateHeader, nameHeader, qtyHeader, priceHeader },
      rowsTotal: rawRows.length,
      rowsMatched,
      rowsPending,
    },
  });

  revalidatePath("/sales");
  revalidatePath("/menu-engineering");

  if (rowsPending > 0) {
    redirect(`/sales/import/${batch.id}/review`);
  }
  redirect("/sales");
}
