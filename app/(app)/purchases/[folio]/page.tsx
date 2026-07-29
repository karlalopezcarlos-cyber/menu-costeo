import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { formatPurchaseFolio, parsePurchaseFolio } from "@/lib/purchases/folio";
import type { UnitValue } from "@/lib/units";
import PurchaseEditForm from "./PurchaseEditForm";

export default async function PurchaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ folio: string }>;
  searchParams: Promise<{ recipeId?: string }>;
}) {
  const { folio: folioParam } = await params;
  const { recipeId } = await searchParams;
  const user = await requireOrgSession();

  const folio = parsePurchaseFolio(folioParam);
  if (!folio) notFound();

  const [purchase, suppliers, recipe] = await Promise.all([
    prisma.purchase.findFirst({
      where: { organizationId: user.organizationId, folio },
      include: { product: true },
    }),
    prisma.supplier.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    recipeId
      ? prisma.recipe.findFirst({
          where: { id: recipeId, organizationId: user.organizationId },
          select: { id: true, name: true },
        })
      : null,
  ]);
  if (!purchase) notFound();

  const backHref = recipe ? `/recipes/${recipe.id}` : "/purchases";
  const backLabel = recipe ? `← Volver a "${recipe.name}"` : "← Compras";

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href={backHref} className="text-sm text-neutral-500 hover:underline">
          {backLabel}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
          Compra {formatPurchaseFolio(purchase.folio)} - {purchase.product.name}
        </h1>
      </div>

      <PurchaseEditForm
        purchaseId={purchase.id}
        productName={purchase.product.name}
        baseUnit={purchase.product.baseUnit as UnitValue}
        yieldPercentage={purchase.product.yieldPercentage.toString()}
        purchaseDate={purchase.purchaseDate.toISOString().slice(0, 10)}
        presentationQty={purchase.presentationQty.toString()}
        presentationUnit={purchase.presentationUnit as UnitValue}
        totalPrice={purchase.totalPrice.toString()}
        supplierId={purchase.supplierId ?? ""}
        suppliers={suppliers}
        note={purchase.note}
        recipeId={recipe?.id ?? null}
        backHref={backHref}
      />
    </div>
  );
}
