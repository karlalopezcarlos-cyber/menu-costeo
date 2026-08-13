import ExcelJS from "exceljs";

export type SupplierExportRow = {
  name: string;
  businessName: string | null;
  rfc: string | null;
  address: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  extraPhones: string[];
  extraEmails: string[];
  paymentMethod: string | null;
  bankInfo: string | null;
  creditDays: number | null;
  notes: string | null;
  isActive: boolean;
  purchaseCount: number;
};

export async function buildSuppliersWorkbook(rows: SupplierExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Proveedores");

  sheet.columns = [
    { header: "Nombre", key: "name", width: 26 },
    { header: "Razon social", key: "businessName", width: 26 },
    { header: "RFC", key: "rfc", width: 16 },
    { header: "Direccion", key: "address", width: 30 },
    { header: "Contacto", key: "contactName", width: 20 },
    { header: "WhatsApp principal", key: "phone", width: 18 },
    { header: "Correo principal", key: "email", width: 24 },
    { header: "Telefonos adicionales", key: "extraPhones", width: 24 },
    { header: "Correos adicionales", key: "extraEmails", width: 28 },
    { header: "Metodo de pago", key: "paymentMethod", width: 18 },
    { header: "Banco / cuenta", key: "bankInfo", width: 24 },
    { header: "Dias de credito", key: "creditDays", width: 14 },
    { header: "Notas", key: "notes", width: 30 },
    { header: "Estado", key: "isActive", width: 12 },
    { header: "Compras registradas", key: "purchaseCount", width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow({
      name: row.name,
      businessName: row.businessName ?? "",
      rfc: row.rfc ?? "",
      address: row.address ?? "",
      contactName: row.contactName ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      extraPhones: row.extraPhones.join(", "),
      extraEmails: row.extraEmails.join(", "),
      paymentMethod: row.paymentMethod ?? "",
      bankInfo: row.bankInfo ?? "",
      creditDays: row.creditDays ?? "",
      notes: row.notes ?? "",
      isActive: row.isActive ? "Activo" : "Inactivo",
      purchaseCount: row.purchaseCount,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
