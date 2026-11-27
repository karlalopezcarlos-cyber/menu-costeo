import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { formatPurchaseFolio, parsePurchaseFolio } from "@/lib/purchases/folio";
import { formatMoney } from "@/lib/format";
import { sumTaxes } from "@/lib/taxes";
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

  const [purchases, recipe, products, documento] = await Promise.all([
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
    // El papel del que salio la compra, cuando se subio por XML o por foto. Aqui solo se
    // pregunta si existe y de que tipo es: el archivo se sirve aparte, para no cargar megas
    // de foto en una pagina que casi siempre se abre nomas a corregir un importe.
    prisma.purchaseDocument.findFirst({
      where: { organizationId: user.organizationId, sucursalId: user.sucursalId, folio },
      orderBy: { createdAt: "desc" },
      select: { tipo: true, nombre: true, createdAt: true },
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
  // El renglon decia "Total de la compra" y mostraba el subtotal: quien viene a cuadrar
  // contra la factura ve 100 donde el papel dice 116 y no hay nada que lo explique.
  const taxes = sumTaxes(
    purchases.map((p) => ({
      subtotal: p.totalPrice,
      rates: { ivaRate: Number(p.ivaRate), iepsRate: Number(p.iepsRate) },
    })),
  );

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
          Subtotal: <b className="text-neutral-900">{formatMoney(taxes.subtotal)}</b>
          {taxes.ieps !== 0 && <> · IEPS: {formatMoney(taxes.ieps)}</>}
          {taxes.iva !== 0 && <> · IVA: {formatMoney(taxes.iva)}</>}
          {taxes.total !== taxes.subtotal && (
            <>
              {" "}
              · Total con impuestos:{" "}
              <b className="text-neutral-900">{formatMoney(taxes.total)}</b>
            </>
          )}
        </p>
        {taxes.total !== taxes.subtotal && (
          <p className="mt-1 text-xs text-neutral-400">
            El costo del negocio es el subtotal: el IVA de compras es acreditable y no entra al
            costeo. El total con impuestos es lo que se le paga al proveedor.
          </p>
        )}

        {documento && (
          <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-neutral-900">
              {documento.tipo === "XML" ? "XML de la factura" : "Foto de la nota"}
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              {documento.nombre ? `${documento.nombre} · ` : ""}
              subido el{" "}
              {documento.createdAt.toLocaleDateString("es-MX", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
            {documento.tipo === "FOTO" ? (
              <a
                href={`/api/purchases/${folioLabel}/documento`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block w-fit"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/purchases/${folioLabel}/documento`}
                  alt="Nota de la compra"
                  className="max-h-56 rounded-md border border-neutral-200 object-contain"
                />
              </a>
            ) : (
              <a
                href={`/api/purchases/${folioLabel}/documento`}
                className="mt-2 inline-block text-sm font-medium text-brand-600 hover:underline"
              >
                Descargar el XML
              </a>
            )}
          </div>
        )}

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
          ivaRate={firstPurchase.ivaRate.toString()}
          iepsRate={firstPurchase.iepsRate.toString()}
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
            ivaRate: p.ivaRate.toString(),
            iepsRate: p.iepsRate.toString(),
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
