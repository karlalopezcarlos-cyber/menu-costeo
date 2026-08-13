import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const sucursal = await prisma.sucursal.findFirst({
    where: { storeSlug: slug, storeEnabled: true },
    select: { organization: { select: { logo: true, logoMimeType: true } } },
  });
  if (!sucursal?.organization.logo || !sucursal.organization.logoMimeType) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  return new NextResponse(new Uint8Array(sucursal.organization.logo), {
    headers: {
      "Content-Type": sucursal.organization.logoMimeType,
      "Cache-Control": "public, max-age=300",
    },
  });
}
