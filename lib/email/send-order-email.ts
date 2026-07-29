import { Resend } from "resend";

export type SendOrderEmailInput = {
  to: string;
  supplierName: string | null;
  dateLabel: string;
  organizationName: string;
  pdfBuffer: Buffer;
};

/**
 * Requiere RESEND_API_KEY en el entorno (cuenta en https://resend.com). Sin dominio verificado en
 * Resend, la cuenta solo puede enviar al correo con el que te registraste ahi, no a proveedores
 * reales; para produccion hay que verificar un dominio propio y usarlo en RESEND_FROM_EMAIL.
 */
export async function sendOrderEmail(input: SendOrderEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "El envio de correos no esta configurado (falta RESEND_API_KEY). Pide al administrador que lo configure.",
    );
  }

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  const { error } = await resend.emails.send({
    from: `${input.organizationName} <${from}>`,
    to: input.to,
    subject: `Pedido - ${input.dateLabel}`,
    text: `Hola${input.supplierName ? ` ${input.supplierName}` : ""},\n\nAdjuntamos nuestro pedido del ${input.dateLabel}.\n\nSaludos,\n${input.organizationName}`,
    attachments: [{ filename: `pedido-${input.dateLabel.replace(/\//g, "-")}.pdf`, content: input.pdfBuffer }],
  });

  if (error) {
    if (error.message?.includes("own email address") || error.message?.includes("verify a domain")) {
      throw new Error(
        "Tu cuenta de Resend todavia esta en modo de prueba: solo puede enviar correos a la direccion con la que te registraste, no a proveedores reales. Para enviarles hay que verificar un dominio propio en resend.com/domains.",
      );
    }
    throw new Error(error.message || "No se pudo enviar el correo.");
  }
}
