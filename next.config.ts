import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit"],
  experimental: {
    serverActions: {
      // Una foto de nota puede pesar 4.5 MB y viaja dos veces: una para leerla con IA y otra,
      // junto con los renglones ya revisados, para archivarla con la compra. El limite tiene
      // que dejar pasar la foto mas el resto del formulario.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
