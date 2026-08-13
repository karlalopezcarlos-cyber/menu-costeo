import { prisma } from "@/lib/prisma";

/** Logo de la empresa (configurable en Configuracion), usado como marca de agua en los PDFs. */
export async function getOrganizationLogo(organizationId: string): Promise<Buffer | null> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { logo: true },
  });
  return organization?.logo ? Buffer.from(organization.logo) : null;
}
