import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { formatPurchaseFolio, parsePurchaseFolio } from "./folio";

export type InvoiceFilters = {
  search: string;
  dateFrom: string;
  dateTo: string;
  supplier: string;
};

export type InvoiceRow = {
  folio: number;
  folioLabel: string;
  /** Folio de la factura del proveedor, tal como viene en el papel. */
  invoiceFolio: string | null;
  dateLabel: string;
  dateValue: number;
  supplierName: string | null;
  /** Cuantos renglones de producto trae esa factura. */
  lineCount: number;
  total: number;
};

export type SupplierTotal = {
  supplierName: string;
  invoiceCount: number;
  total: number;
};

export type InvoiceSummary = {
  rows: InvoiceRow[];
  bySupplier: SupplierTotal[];
  invoiceCount: number;
  total: number;
};

/** Primer dia del mes en curso, en el mismo formato que usan los inputs de fecha. */
export function monthStartDateInputValue(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().slice(0, 10);
}

export function hasAnyInvoiceFilter(filters: InvoiceFilters): boolean {
  return Boolean(filters.search.trim() || filters.dateFrom || filters.dateTo || filters.supplier);
}

function buildInvoiceWhere(sucursalId: string, filters: InvoiceFilters): Prisma.PurchaseWhereInput {
  const where: Prisma.PurchaseWhereInput = { sucursalId };

  const search = filters.search.trim();
  if (search) {
    // Se busca por los dos folios: el de la factura del proveedor y el consecutivo del sistema,
    // porque el papel trae uno y la pantalla el otro.
    const folioNumber = parsePurchaseFolio(search);
    where.OR = [
      { invoiceFolio: { contains: search, mode: "insensitive" } },
      ...(folioNumber !== null ? [{ folio: folioNumber }] : []),
    ];
  }

  // Mismo criterio UTC que la lista por producto: purchaseDate se guarda como medianoche UTC
  // del dia capturado, asi que el rango tiene que construirse en UTC o se corre un dia.
  if (filters.dateFrom || filters.dateTo) {
    where.purchaseDate = {
      ...(filters.dateFrom ? { gte: new Date(`${filters.dateFrom}T00:00:00.000Z`) } : {}),
      ...(filters.dateTo ? { lte: new Date(`${filters.dateTo}T23:59:59.999Z`) } : {}),
    };
  }

  if (filters.supplier) {
    where.supplier = { name: filters.supplier };
  }

  return where;
}

const SIN_PROVEEDOR = "Sin proveedor";

/**
 * Las compras agrupadas por factura, no por producto.
 *
 * Una compra se captura con varios renglones que comparten folio: esta vista los junta para
 * poder contar cuantas facturas entraron en el mes y cuanto suma cada una. La suma se hace en
 * la base de datos (groupBy) y no sobre las filas que se alcanzaron a traer a pantalla, porque
 * un total que depende de un limite de filas no es un total.
 */
export async function loadPurchaseInvoices(
  sucursalId: string,
  organizationId: string,
  filters: InvoiceFilters,
): Promise<InvoiceSummary> {
  const where = buildInvoiceWhere(sucursalId, filters);

  const [grupos, suppliers] = await Promise.all([
    // Se agrupa por folio y nada mas. Agrupar tambien por fecha, proveedor o folio de factura
    // partia una misma compra en dos renglones cuando un producto quedo capturado con el folio
    // de factura escrito distinto: una factura es un folio, no una combinacion de campos.
    prisma.purchase.groupBy({
      by: ["folio"],
      where,
      _sum: { totalPrice: true },
      _count: { _all: true },
      _max: { purchaseDate: true, supplierId: true, invoiceFolio: true },
      orderBy: { folio: "desc" },
    }),
    prisma.supplier.findMany({
      where: { organizationId },
      select: { id: true, name: true },
    }),
  ]);
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  const rows: InvoiceRow[] = grupos
    .map((grupo) => {
      const fecha = grupo._max.purchaseDate ?? new Date(0);
      const supplierId = grupo._max.supplierId;
      return {
        folio: grupo.folio,
        folioLabel: formatPurchaseFolio(grupo.folio),
        invoiceFolio: grupo._max.invoiceFolio,
        dateLabel: fecha.toLocaleDateString("es-MX", { timeZone: "UTC" }),
        dateValue: fecha.getTime(),
        supplierName: supplierId ? (supplierName.get(supplierId) ?? null) : null,
        lineCount: grupo._count._all,
        total: Number(grupo._sum.totalPrice ?? 0),
      };
    })
    .sort((a, b) => b.dateValue - a.dateValue || b.folio - a.folio);

  const porProveedor = new Map<string, SupplierTotal>();
  for (const row of rows) {
    const key = row.supplierName ?? SIN_PROVEEDOR;
    const actual = porProveedor.get(key) ?? { supplierName: key, invoiceCount: 0, total: 0 };
    actual.invoiceCount += 1;
    actual.total += row.total;
    porProveedor.set(key, actual);
  }

  return {
    rows,
    bySupplier: [...porProveedor.values()].sort((a, b) => b.total - a.total),
    invoiceCount: rows.length,
    total: rows.reduce((sum, row) => sum + row.total, 0),
  };
}
