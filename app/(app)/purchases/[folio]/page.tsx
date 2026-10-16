import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { formatPurchaseFolio, parsePurchaseFolio } from "@/lib/purchases/folio";
import { formatMoney } from "@/lib/format";
import type { UnitValue } from "@/lib/units";
import PurchaseEditForm from "./PurchaseEditForm";
import PurchaseGroupManager from "./PurchaseGroupManager";
import AddPurchaseItemForm from "./AddPurchaseItemForm";
import PurchaseHeaderForm from "./PurchaseHeaderForm";

function firstPurchaseSupplierId(purchases: { supplierId: string | null }[]): string | null {
  return purchases[0]?.supplierId ?? null;
}

export default async function PurchaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ folio: string }>;
  searchParams: Promise<{ recipeId?: string }>;
}) {
  const { folio: folioParam } = await params;
  const { recipeId } = await searchParams;
  const user = await requireSucursalContext();

  const folio = parsePurchaseFolio(folioParam);
  if (!folio) notFound();

  const [purchases, recipe, products] = await Promise.all([
    prisma.purchase.findMany({
      where: { sucursalId: user.sucursalId, folio },
      include: { product: true },
      orderBy: { createdAt: "asc" },
    }),
    recipeId
      ? prisma.recipe.findFirst({
          where: { id: recipeId, sucursalId: user.sucursalId },
          select: { id: true, name: true },
        })
      : null,
    prisma.product.findMany({
      where: { organizationId: user.organizationId, archivedAt: null, isProcessed: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, baseUnit: true, yieldPercentage: true },
    }),
  ]);
  if (purchases.length === 0) notFound();

  // Incluye siempre los proveedores ya asignados a estas compras (aunque esten inactivos), para
  // que el select no se quede sin la opcion ya elegida al editar un registro viejo.
  const usedSupplierIds = [...new Set(purchases.map((p) => p.supplierId).filter((id): id is string => !!id))];
  const suppliers = await prisma.supplier.findMany({
    where: {
      organizationId: user.organizationId,
      OR: [{ isActive: true }, { id: { in: usedSupplierIds } }],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Un folio ya abonado no se edita: cambiarle proveedor o importe descuadraria el pago.
  const paidAggregate = firstPurchaseSupplierId(purchases)
    ? await prisma.supplierPayment.aggregate({
        where: { sucursalId: user.sucursalId, supplierId: firstPurchaseSupplierId(purchases)!, folio },
        _sum: { amount: true },
      })
    : null;
  const paidAmount = Number(paidAggregate?._sum.amount ?? 0);

  const backHref = recipe ? `/recipes/${recipe.id}` : "/purchases";
  const backLabel = recipe ? `← Volver a "${recipe.name}"` : "← Compras";
  const folioLabel = formatPurchaseFolio(folio);
  const [firstPurchase] = purchases;
  const totalAmount = purchases.reduce((sum, p) => sum + Number(p.totalPrice), 0);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href={backHref} className="text-sm text-neutral-500 hover:underline">
          {backLabel}
        </Link>
        {/* Igual que en el listado: manda el folio de la factura del proveedor. */}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
          {firstPurchase.invoiceFolio && firstPurchase.invoiceFolio !== folioLabel
            ? `Factura ${firstPurchase.invoiceFolio}`
            : `Compra ${folioLabel}`}
          {purchases.length === 1 ? ` - ${firstPurchase.product.name}` : ""}
        </h1>
        {firstPurchase.invoiceFolio && firstPurchase.invoiceFolio !== folioLabel && (
          <p className="text-xs text-neutral-400">Registro {folioLabel}</p>
        )}
        {purchases.length > 1 && (
          <p className="mt-1 text-sm text-neutral-500">{purchases.length} productos en esta compra.</p>
        )}
        <p className="mt-2 text-sm text-neutral-500">
          Total de la compra: <b className="text-neutral-900">{formatMoney(totalAmount)}</b>
        </p>

        <div className="mt-3">
          <PurchaseHeaderForm
            folio={folio}
            purchaseDate={firstPurchase.purchaseDate.toISOString().slice(0, 10)}
            supplierId={firstPurchase.supplierId ?? ""}
            invoiceFolio={firstPurchase.invoiceFolio ?? folioLabel}
            suppliers={suppliers}
            paidAmountLabel={paidAmount > 0 ? formatMoney(paidAmount) : null}
            paymentHref={firstPurchase.supplierId ? `/payments/${firstPurchase.supplierId}` : null}
          />
        </div>
      </div>

      {purchases.length === 1 ? (
        <PurchaseEditForm
          purchaseId={firstPurchase.id}
          productName={firstPurchase.product.name}
          baseUnit={firstPurchase.product.baseUnit as UnitValue}
          yieldPercentage={firstPurchase.product.yieldPercentage.toString()}
          purchaseDate={firstPurchase.purchaseDate.toISOString().slice(0, 10)}
          presentationQty={firstPurchase.presentationQty.toString()}
          presentationUnit={firstPurchase.presentationUnit as UnitValue}
          totalPrice={firstPurchase.totalPrice.toString()}
          supplierId={firstPurchase.supplierId ?? ""}
          suppliers={suppliers}
          note={firstPurchase.note}
          comment={firstPurchase.comment}
          recipeId={recipe?.id ?? null}
          backHref={backHref}
        />
      ) : (
        <PurchaseGroupManager
          purchases={purchases.map((p) => ({
            id: p.id,
            productName: p.product.name,
            baseUnit: p.product.baseUnit as UnitValue,
            yieldPercentage: p.product.yieldPercentage.toString(),
            purchaseDate: p.purchaseDate.toISOString().slice(0, 10),
            presentationQty: p.presentationQty.toString(),
            presentationUnit: p.presentationUnit as UnitValue,
            totalPrice: Number(p.totalPrice),
            computedUnitCost: Number(p.computedUnitCost),
            supplierId: p.supplierId ?? "",
            note: p.note,
            comment: p.comment,
          }))}
          suppliers={suppliers}
          recipeId={recipe?.id ?? null}
          backHref={backHref}
          folio={folio}
          folioLabel={folioLabel}
        />
      )}

      <AddPurchaseItemForm
        folio={folio}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          baseUnit: p.baseUnit as UnitValue,
          yieldPercentage: p.yieldPercentage.toString(),
        }))}
        recipeId={recipe?.id ?? null}
      />
    </div>
  );
}
