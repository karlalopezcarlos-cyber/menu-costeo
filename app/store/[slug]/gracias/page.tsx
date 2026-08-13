import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatStoreOrderFolio } from "@/lib/store/folio";
import RetryPaymentButton from "./RetryPaymentButton";

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  paid: {
    title: "¡Pago confirmado!",
    body: "Ya recibimos tu pago. Te avisaremos cuando tu pedido este listo para recoger.",
  },
  pending: {
    title: "Estamos confirmando tu pago",
    body: "Esto puede tardar unos minutos. No hace falta que hagas nada mas -- en cuanto se confirme, empezamos a preparar tu pedido.",
  },
  failed: {
    title: "Tu pago no se pudo procesar",
    body: "Intenta de nuevo desde la tienda, o contactanos si el problema sigue.",
  },
  unpaid: {
    title: "Pedido recibido",
    body: "Pagas al recoger tu pedido en tienda.",
  },
};

export default async function StoreGraciasPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ order?: string }>;
}) {
  const { slug } = await params;
  const { order: orderId } = await searchParams;

  const order = orderId
    ? await prisma.storeOrder.findFirst({
        where: { id: orderId, sucursal: { storeSlug: slug } },
        select: { folio: true, paymentStatus: true },
      })
    : null;

  const copy = STATUS_COPY[order?.paymentStatus ?? "pending"];

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">
        {order?.paymentStatus === "failed" ? "✕" : "✓"}
      </div>
      <h1 className="text-2xl font-semibold text-neutral-900">{copy.title}</h1>
      {order && (
        <p className="text-neutral-600">
          Tu folio es <strong className="text-neutral-900">{formatStoreOrderFolio(order.folio)}</strong>.
        </p>
      )}
      <p className="text-neutral-600">{copy.body}</p>
      {order?.paymentStatus === "failed" && orderId && <RetryPaymentButton orderId={orderId} />}
      <Link href={`/store/${slug}`} className="mt-4 text-sm text-neutral-500 hover:underline">
        Volver a la tienda
      </Link>
    </div>
  );
}
