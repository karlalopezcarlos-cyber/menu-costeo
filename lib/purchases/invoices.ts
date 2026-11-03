import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { formatPurchaseFolio, parsePurchaseFolio } from "./folio";
import { emptyBreakdown, sumTaxes, type TaxBreakdown } from "@/lib/taxes";

export { monthStartDateInputValue } from "@/lib/date-inputs";

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
  /** Subtotal de la factura: sin impuesto, que es lo que entra al costo. */
  total: number;
  /** El desglose de esa misma factura, para cuadrarla contra el papel del proveedor. */
  taxes: TaxBreakdown;
};

export type SupplierTotal = {
  supplierName: string;
  invoiceCount: number;
  total: number;
  /** Lo que se le debe pagar a ese proveedor: subtotal mas impuestos. */
  totalConImpuestos: number;
};

export type InvoiceSummary = {
  rows: InvoiceRow[];
  bySupplier: SupplierTotal[];
  invoiceCount: number;
  total: number;
  taxes: TaxBreakdown;
};

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
    // Se agrupa tambien por tasas: dentro de una misma factura puede haber renglones con IVA
    // distinto (la cerveza y el limon vienen en el mismo papel), asi que el impuesto se calcula
    // por tasa y luego se suma. Los subgrupos se pliegan por folio mas abajo.
    prisma.purchase.groupBy({
      by: ["folio", "ivaRate", "iepsRate"],
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

  const porFolio = new Map<number, typeof grupos>();
  for (const grupo of grupos) {
    const previos = porFolio.get(grupo.folio);
    if (previos) previos.push(grupo);
    else porFolio.set(grupo.folio, [grupo]);
  }

  const rows: InvoiceRow[] = [...porFolio.values()]
    .map((subgrupos) => {
      const primero = subgrupos[0];
      const fecha = primero._max.purchaseDate ?? new Date(0);
      const supplierId = primero._max.supplierId;
      const taxes = sumTaxes(
        subgrupos.map((g) => ({
          subtotal: g._sum.totalPrice ?? 0,
          rates: { ivaRate: Number(g.ivaRate), iepsRate: Number(g.iepsRate) },
        })),
      );
      return {
        folio: primero.folio,
        folioLabel: formatPurchaseFolio(primero.folio),
        invoiceFolio: primero._max.invoiceFolio,
        dateLabel: fecha.toLocaleDateString("es-MX", { timeZone: "UTC" }),
        dateValue: fecha.getTime(),
        supplierName: supplierId ? (supplierName.get(supplierId) ?? null) : null,
        lineCount: subgrupos.reduce((n, g) => n + g._count._all, 0),
        total: taxes.subtotal,
        taxes,
      };
    })
    .sort((a, b) => b.dateValue - a.dateValue || b.folio - a.folio);

  const porProveedor = new Map<string, SupplierTotal>();
  for (const row of rows) {
    const key = row.supplierName ?? SIN_PROVEEDOR;
    const actual =
      porProveedor.get(key) ??
      { supplierName: key, invoiceCount: 0, total: 0, totalConImpuestos: 0 };
    actual.invoiceCount += 1;
    actual.total += row.total;
    actual.totalConImpuestos += row.taxes.total;
    porProveedor.set(key, actual);
  }

  return {
    rows,
    bySupplier: [...porProveedor.values()].sort((a, b) => b.total - a.total),
    invoiceCount: rows.length,
    total: rows.reduce((sum, row) => sum + row.total, 0),
    taxes: rows.reduce((acc, row) => {
      acc.subtotal += row.taxes.subtotal;
      acc.ieps += row.taxes.ieps;
      acc.iva += row.taxes.iva;
      acc.total += row.taxes.total;
      return acc;
    }, emptyBreakdown()),
  };
}
