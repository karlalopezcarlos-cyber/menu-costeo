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
      where: { organizationId: user.organizationId, archivedAt: null },
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

  const backHref = recipe ? `/recipes/${recipe.id}` : "/purchases";
  const backLabel = recipe ? `← Volver a "${recipe.name}"` : "← Compras";
  const folioLabel = formatPurchaseFolio(folio);
  const [firstPurchase] = purchases;
  const totalAmount = purchases.reduce((sum, p) => sum + Number(p.totalPrice), 0);
  const supplierName = firstPurchase.supplierId
    ? (suppliers.find((s) => s.id === firstPurchase.supplierId)?.name ?? "Proveedor")
    : "Sin proveedor";
  const dateLabel = firstPurchase.purchaseDate.toLocaleDateString("es-MX", { timeZone: "UTC" });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href={backHref} className="text-sm text-neutral-500 hover:underline">
          {backLabel}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
          Compra {folioLabel}
          {purchases.length === 1 ? ` - ${firstPurchase.product.name}` : ""}
        </h1>
        {purchases.length > 1 && (
          <p className="mt-1 text-sm text-neutral-500">{purchases.length} productos en esta compra.</p>
        )}
        <dl className="mt-3 grid grid-cols-3 gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm">
          <div>
            <dt className="text-neutral-500">Proveedor</dt>
            <dd className="font-medium text-neutral-900">{supplierName}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Fecha</dt>
            <dd className="font-medium text-neutral-900">{dateLabel}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Total de la compra</dt>
            <dd className="font-medium text-neutral-900">{formatMoney(totalAmount)}</dd>
          </div>
        </dl>
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
