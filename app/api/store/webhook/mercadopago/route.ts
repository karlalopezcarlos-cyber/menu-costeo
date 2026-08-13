import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Mercado Pago le pega a esta URL (server-to-server) cada vez que cambia el estatus de un pago --
 * SOLO funciona si esta URL es publica de verdad (no localhost). Aqui es donde de verdad se
 * confirma un cobro, nunca confiando en que el navegador del cliente haya regresado a la pagina de
 * "gracias" (eso lo puede visitar cualquiera sin haber pagado).
 */
async function handleNotification(paymentId: string | null): Promise<NextResponse> {
  if (!paymentId) {
    // Notificacion de un tipo que no nos interesa (ej. merchant_order); se responde 200 igual para
    // que Mercado Pago no la siga reintentando.
    return NextResponse.json({ ok: true });
  }

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: "MERCADOPAGO_ACCESS_TOKEN no configurado" }, { status: 500 });
  }

  const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!paymentResponse.ok) {
    // No se pudo confirmar el pago con Mercado Pago; respondemos 200 de todas formas para que no
    // reintente indefinidamente un id que ya no existe o esta mal formado.
    return NextResponse.json({ ok: false });
  }
  const payment = await paymentResponse.json();

  const orderId = payment?.external_reference;
  if (!orderId) return NextResponse.json({ ok: true });

  const paymentStatus =
    payment.status === "approved" ? "paid" : payment.status === "rejected" || payment.status === "cancelled" ? "failed" : "pending";

  await prisma.storeOrder.updateMany({
    where: { id: orderId },
    data: { paymentStatus },
  });

  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  let paymentId: string | null = null;
  try {
    const body = await request.json();
    if (body?.type === "payment" || body?.action?.startsWith("payment.")) {
      paymentId = body?.data?.id ? String(body.data.id) : null;
    }
  } catch {
    // Cuerpo vacio o no-JSON; se intenta con los query params abajo.
  }
  if (!paymentId) {
    const params = request.nextUrl.searchParams;
    if (params.get("type") === "payment" || params.get("topic") === "payment") {
      paymentId = params.get("data.id") ?? params.get("id");
    }
  }
  return handleNotification(paymentId);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  let paymentId: string | null = null;
  if (params.get("type") === "payment" || params.get("topic") === "payment") {
    paymentId = params.get("data.id") ?? params.get("id");
  }
  return handleNotification(paymentId);
}
