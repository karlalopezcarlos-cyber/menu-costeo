import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { formatPurchaseFolio, parsePurchaseFolio } from "@/lib/purchases/folio";
import type { UnitValue } from "@/lib/units";
import PurchaseEditForm from "./PurchaseEditForm";
import PurchaseGroupManager from "./PurchaseGroupManager";

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

  const [purchases, suppliers, recipe] = await Promise.all([
    prisma.purchase.findMany({
      where: { sucursalId: user.sucursalId, folio },
      include: { product: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.supplier.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    recipeId
      ? prisma.recipe.findFirst({
          where: { id: recipeId, sucursalId: user.sucursalId },
          select: { id: true, name: true },
        })
      : null,
  ]);
  if (purchases.length === 0) notFound();

  const backHref = recipe ? `/recipes/${recipe.id}` : "/purchases";
  const backLabel = recipe ? `← Volver a "${recipe.name}"` : "← Compras";
  const folioLabel = formatPurchaseFolio(folio);
  const [firstPurchase] = purchases;

  return (
    <div className="max-w-xl space-y-6">
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
          }))}
          suppliers={suppliers}
          recipeId={recipe?.id ?? null}
          backHref={backHref}
        />
      )}
    </div>
  );
}
