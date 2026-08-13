export type PaymentPreferenceItem = {
  title: string;
  quantity: number;
  unitPrice: number;
};

export type PaymentPreferenceResult = {
  preferenceId: string;
  paymentLink: string;
};

export type PaymentPreferenceOptions = {
  /** URL publica a la que Mercado Pago avisa (server-to-server) cuando cambia el estatus del pago.
   * Si el sitio todavia no esta publicado (localhost), Mercado Pago no podra entregar el aviso --
   * la preferencia se crea igual, solo que esta notificacion en particular no llegara hasta que la
   * URL sea publica de verdad. */
  notificationUrl?: string;
  /** A donde regresa el navegador del cliente despues de pagar (o cancelar). Estas si funcionan en
   * localhost, porque las abre el navegador del cliente, no el servidor de Mercado Pago. */
  backUrls?: { success: string; failure: string; pending: string };
};

/**
 * Crea una preferencia de pago (Checkout Pro) en Mercado Pago y regresa el link de cobro
 * (init_point) que se le manda al cliente. Requiere MERCADOPAGO_ACCESS_TOKEN en el entorno (Access
 * Token de produccion, generado en mercadopago.com.mx/developers/panel). Crear la preferencia no
 * cobra nada por si sola: solo genera la pagina de pago; el cobro real ocurre cuando el cliente
 * completa el pago en ese link.
 */
export async function createPaymentPreference(
  externalReference: string,
  items: PaymentPreferenceItem[],
  options: PaymentPreferenceOptions = {},
): Promise<PaymentPreferenceResult> {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error(
      "El cobro con Mercado Pago no esta configurado (falta MERCADOPAGO_ACCESS_TOKEN). Pide al administrador que lo configure.",
    );
  }
  if (items.length === 0) {
    throw new Error("El ticket no tiene platillos para cobrar.");
  }

  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: items.map((item) => ({
        title: item.title,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        currency_id: "MXN",
      })),
      external_reference: externalReference,
      ...(options.notificationUrl ? { notification_url: options.notificationUrl } : {}),
      ...(options.backUrls ? { back_urls: options.backUrls } : {}),
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const message =
      typeof data?.message === "string" ? data.message : "No se pudo generar el link de pago en Mercado Pago.";
    throw new Error(message);
  }

  if (!data.id || !data.init_point) {
    throw new Error("Mercado Pago no regreso un link de pago valido.");
  }

  return { preferenceId: data.id, paymentLink: data.init_point };
}
