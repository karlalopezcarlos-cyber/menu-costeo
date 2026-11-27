import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { parsePurchaseFolio } from "@/lib/purchases/folio";

/**
 * Entrega el documento original de una compra: la foto de la nota o el XML de la factura.
 *
 * Se sirve por aqui y no como un `data:` dentro de la pagina porque una foto de nota pesa
 * megas: la pagina de la compra abriria lenta aunque nadie quiera ver el papel.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ folio: string }> }) {
  const user = await requireSucursalContext();
  const { folio: folioParam } = await params;

  const folio = parsePurchaseFolio(folioParam);
  if (!folio) return new NextResponse("No encontrado", { status: 404 });

  const documento = await prisma.purchaseDocument.findFirst({
    // Por sucursal, no solo por organizacion: el documento se mira donde se capturo la compra.
    where: { organizationId: user.organizationId, sucursalId: user.sucursalId, folio },
    orderBy: { createdAt: "desc" },
    select: { mimeType: true, nombre: true, contenido: true, tipo: true },
  });
  if (!documento) return new NextResponse("No encontrado", { status: 404 });

  const nombre = documento.nombre ?? (documento.tipo === "XML" ? `factura-${folio}.xml` : `nota-${folio}.jpg`);

  return new NextResponse(new Uint8Array(documento.contenido), {
    headers: {
      "Content-Type": documento.mimeType,
      // El XML se descarga y la foto se mira: un XML abierto en el navegador no le dice nada
      // a nadie, y una foto descargada obliga a ir a buscarla a la carpeta de descargas.
      "Content-Disposition":
        documento.tipo === "XML"
          ? `attachment; filename="${encodeURIComponent(nombre)}"`
          : `inline; filename="${encodeURIComponent(nombre)}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
