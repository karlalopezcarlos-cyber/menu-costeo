import { NextResponse } from "next/server";
import { requireOrgSession } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await requireOrgSession();

  const organization = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { logo: true, logoMimeType: true },
  });
  if (!organization?.logo || !organization.logoMimeType) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  return new NextResponse(new Uint8Array(organization.logo), {
    headers: {
      "Content-Type": organization.logoMimeType,
      "Cache-Control": "private, max-age=300",
    },
  });
}
