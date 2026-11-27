import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { UnitValue } from "@/lib/units";
import type {
  AsociacionGuardada,
  OpcionBulto,
  OpcionProducto,
  OpcionProveedor,
} from "./importar-tipos";

/**
 * El catalogo con el que se lee y se revisa un documento de compra.
 *
 * Esta en un solo lugar porque lo usan la pantalla (para poder corregir a mano) y la accion
 * que lee el documento (para emparejar). Si cada una armara su propia lista, la pantalla
 * podria ofrecer un producto que el emparejado no considera, o al contrario.
 */

/** Los mismos productos que se pueden capturar en una compra a mano. */
const COMPRABLES: Prisma.ProductWhereInput = {
  archivedAt: null,
  // Lo procesado no se compra: sale de limpiar otra cosa y su costo lo fija la transformacion.
  isProcessed: false,
  // Lo que es gasto se captura en Gastos: no lleva cantidad ni entra al kardex.
  OR: [{ categoryId: null }, { category: { isExpense: false } }],
};

function bultosDe(producto: {
  baseUnit: string;
  presentationUnitLabel: string | null;
  presentationUnitQty: unknown;
  presentations: { id: string; label: string; quantity: unknown; unit: string }[];
}): OpcionBulto[] {
  const bultos: OpcionBulto[] = [];
  if (producto.presentationUnitLabel && producto.presentationUnitQty) {
    bultos.push({
      id: "legacy",
      label: producto.presentationUnitLabel,
      quantity: String(producto.presentationUnitQty),
      unit: producto.baseUnit as UnitValue,
    });
  }
  for (const presentacion of producto.presentations) {
    bultos.push({
      id: presentacion.id,
      label: presentacion.label,
      quantity: String(presentacion.quantity),
      unit: presentacion.unit as UnitValue,
    });
  }
  return bultos;
}

export async function cargarCatalogoDeCompras(organizationId: string): Promise<{
  productos: OpcionProducto[];
  proveedores: (OpcionProveedor & { rfc: string | null })[];
  asociaciones: AsociacionGuardada[];
}> {
  const [productos, proveedores, asociaciones] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId, ...COMPRABLES },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        baseUnit: true,
        presentationUnitLabel: true,
        presentationUnitQty: true,
        ivaRate: true,
        iepsRate: true,
        presentations: { select: { id: true, label: true, quantity: true, unit: true } },
      },
    }),
    prisma.supplier.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, rfc: true },
    }),
    prisma.supplierItemMapping.findMany({
      where: { organizationId },
      select: {
        id: true,
        supplierId: true,
        claveDescripcion: true,
        unidadDocumento: true,
        productId: true,
        factor: true,
        presentationUnit: true,
        presentationLabel: true,
      },
    }),
  ]);

  return {
    productos: productos.map((p) => ({
      id: p.id,
      name: p.name,
      baseUnit: p.baseUnit as UnitValue,
      presentationUnitLabel: p.presentationUnitLabel,
      presentationUnitQty: p.presentationUnitQty ? p.presentationUnitQty.toString() : null,
      bultos: bultosDe(p),
      ivaRate: p.ivaRate.toString(),
      iepsRate: p.iepsRate.toString(),
    })),
    proveedores,
    asociaciones: asociaciones.map((a) => ({
      id: a.id,
      supplierId: a.supplierId,
      claveDescripcion: a.claveDescripcion,
      unidadDocumento: a.unidadDocumento,
      productId: a.productId,
      factor: a.factor.toString(),
      presentationUnit: a.presentationUnit as UnitValue,
      presentationLabel: a.presentationLabel,
    })),
  };
}
