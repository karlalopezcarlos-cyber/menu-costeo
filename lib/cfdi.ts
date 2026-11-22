import type { Unit } from "@/generated/prisma/client";

/**
 * Catalogos y reglas del SAT para facturar (CFDI 4.0).
 *
 * Aqui no se timbra nada: timbrar necesita un PAC contratado y el Certificado de Sello Digital
 * del contribuyente. Esto es lo que se puede tener antes de eso —los datos bien capturados y
 * validados— y es tambien lo que se necesita para armar una pre-factura que un contador o un
 * sistema de facturacion pueda cargar.
 *
 * Los catalogos estan recortados a lo que un negocio de alimentos usa de verdad. El catalogo
 * completo del SAT trae cientos de claves y ofrecerlas todas solo hace mas facil elegir mal.
 */

/** c_RegimenFiscal, los que aplican a un restaurante o a su razon social. */
export const REGIMENES_FISCALES: { clave: string; nombre: string }[] = [
  { clave: "601", nombre: "601 - General de Ley Personas Morales" },
  { clave: "603", nombre: "603 - Personas Morales con Fines no Lucrativos" },
  { clave: "612", nombre: "612 - Personas Fisicas con Actividades Empresariales y Profesionales" },
  { clave: "621", nombre: "621 - Incorporacion Fiscal" },
  { clave: "626", nombre: "626 - Regimen Simplificado de Confianza (RESICO)" },
  { clave: "622", nombre: "622 - Actividades Agricolas, Ganaderas, Silvicolas y Pesqueras" },
  { clave: "628", nombre: "628 - Hidrocarburos" },
  { clave: "625", nombre: "625 - Ingresos por plataformas tecnologicas" },
];

/** c_UsoCFDI, los que tiene sentido que use quien recibe mercancia. */
export const USOS_CFDI: { clave: string; nombre: string }[] = [
  { clave: "G01", nombre: "G01 - Adquisicion de mercancias" },
  { clave: "G03", nombre: "G03 - Gastos en general" },
  { clave: "I04", nombre: "I04 - Equipo de computo y accesorios" },
  { clave: "I08", nombre: "I08 - Otra maquinaria y equipo" },
  { clave: "S01", nombre: "S01 - Sin efectos fiscales" },
];

/**
 * c_ClaveUnidad a partir de la unidad del sistema.
 *
 * No se captura por producto porque es una traduccion mecanica: un kilo siempre es KGM. Las
 * claves salen del catalogo del SAT, que a su vez sigue la norma UN/CEFACT.
 */
export const CLAVE_UNIDAD: Record<Unit, { clave: string; nombre: string }> = {
  G: { clave: "GRM", nombre: "Gramo" },
  KG: { clave: "KGM", nombre: "Kilogramo" },
  ML: { clave: "MLT", nombre: "Mililitro" },
  L: { clave: "LTR", nombre: "Litro" },
  OZ: { clave: "ONZ", nombre: "Onza" },
  PIECE: { clave: "H87", nombre: "Pieza" },
};

/**
 * RFC valido en forma.
 *
 * Persona moral: 3 letras + 6 digitos de fecha + 3 de homoclave. Persona fisica: 4 letras.
 * Esto no dice que el RFC exista ante el SAT —eso solo lo sabe el SAT—, solo que no esta mal
 * tecleado, que es el error que se repite.
 */
export function rfcValido(rfc: string): boolean {
  return /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/.test(rfc.trim().toUpperCase());
}

/** El RFC se guarda siempre en mayusculas y sin guiones ni espacios. */
export function normalizarRfc(rfc: string): string {
  return rfc.replace(/[\s-]/g, "").toUpperCase();
}

export function codigoPostalValido(cp: string): boolean {
  return /^\d{5}$/.test(cp.trim());
}

/** La ClaveProdServ son 8 digitos exactos. */
export function claveProdServValida(clave: string): boolean {
  return /^\d{8}$/.test(clave.trim());
}

/** Los datos fiscales de una sucursal, tal como se guardan. */
export type DatosFiscales = {
  rfc: string | null;
  razonSocial: string | null;
  regimenFiscal: string | null;
  codigoPostalFiscal: string | null;
  usoCfdi: string | null;
};

/**
 * Que le falta a una sucursal para poder aparecer en una factura.
 *
 * Devuelve la lista de huecos, en texto. Lista vacia = esta completa. `comoReceptor` cambia la
 * exigencia: quien emite necesita su lugar de expedicion, quien recibe necesita el uso del CFDI.
 */
export function faltantesFiscales(
  datos: DatosFiscales,
  comoReceptor: boolean,
): string[] {
  const faltan: string[] = [];
  if (!datos.rfc) faltan.push("RFC");
  else if (!rfcValido(datos.rfc)) faltan.push("el RFC esta mal formado");
  if (!datos.razonSocial) faltan.push("razon social");
  if (!datos.regimenFiscal) faltan.push("regimen fiscal");
  if (!datos.codigoPostalFiscal) faltan.push("codigo postal fiscal");
  else if (!codigoPostalValido(datos.codigoPostalFiscal)) faltan.push("el codigo postal no son 5 digitos");
  if (comoReceptor && !datos.usoCfdi) faltan.push("uso del CFDI");
  return faltan;
}

/** Nombre legible de una clave de regimen, para mostrarla sin volver a buscar en el catalogo. */
export function nombreRegimen(clave: string | null): string | null {
  if (!clave) return null;
  return REGIMENES_FISCALES.find((r) => r.clave === clave)?.nombre ?? clave;
}

export function nombreUsoCfdi(clave: string | null): string | null {
  if (!clave) return null;
  return USOS_CFDI.find((u) => u.clave === clave)?.nombre ?? clave;
}
