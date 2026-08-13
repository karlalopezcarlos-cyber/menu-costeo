import { NextResponse } from "next/server";
import { requireOrgSession } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { buildSuppliersWorkbook, type SupplierExportRow } from "@/lib/excel/export-suppliers";

export async function GET() {
  const user = await requireOrgSession();

  const suppliers = await prisma.supplier.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
    include: {
      phones: { orderBy: { createdAt: "asc" } },
      emails: { orderBy: { createdAt: "asc" } },
      _count: { select: { purchases: true } },
    },
  });

  const rows: SupplierExportRow[] = suppliers.map((s) => ({
    name: s.name,
    businessName: s.businessName,
    rfc: s.rfc,
    address: s.address,
    contactName: s.contactName,
    phone: s.phone,
    email: s.email,
    extraPhones: s.phones.map((p) => p.phone),
    extraEmails: s.emails.map((e) => e.email),
    paymentMethod: s.paymentMethod,
    bankInfo: s.bankInfo,
    creditDays: s.creditDays,
    notes: s.notes,
    isActive: s.isActive,
    purchaseCount: s._count.purchases,
  }));

  const buffer = await buildSuppliersWorkbook(rows);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="proveedores.xlsx"`,
    },
  });
}
