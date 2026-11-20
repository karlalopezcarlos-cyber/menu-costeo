import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * metadataBase es lo que convierte la portada en una direccion completa. Sin el, Next arma el
 * enlace de opengraph-image.png contra localhost y WhatsApp no la encuentra: el link se manda
 * pelon, sin imagen ni titulo.
 *
 * El dominio se puede pisar con NEXT_PUBLIC_SITE_URL para que un ambiente de pruebas no anuncie
 * la portada de produccion.
 */
const SITIO = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.fondomx.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITIO),
  title: {
    default: "Fondo — Control, rentabilidad y estrategia",
    template: "%s · Fondo",
  },
  description:
    "Soluciones integrales para negocios de alimentos: costeo de recetas, inventarios, compras y estado de resultados.",
  applicationName: "Fondo",
  openGraph: {
    type: "website",
    locale: "es_MX",
    url: SITIO,
    siteName: "Fondo",
    title: "Fondo — Control, rentabilidad y estrategia",
    description: "Soluciones integrales para negocios de alimentos.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Fondo — Control, rentabilidad y estrategia",
    description: "Soluciones integrales para negocios de alimentos.",
  },
  // El sistema no es contenido publico: que no lo indexe nadie.
  robots: { index: false, follow: false },
};

export const viewport = {
  themeColor: "#0d0c0b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
