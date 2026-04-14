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

export const metadata: Metadata = {
  metadataBase: new URL("https://catalogo.vedisaremates.cl"),
  title: "Catálogo Oficial VEDISA REMATES | Subastas de Vehículos",
  description:
    "Explora vehículos para remate y venta directa en VEDISA REMATES. Revisa unidades con fotos, visor 3D y acompañamiento comercial para ofertar con confianza.",
  alternates: {
    canonical: "https://catalogo.vedisaremates.cl",
  },
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
      { url: "/favicon.ico", type: "image/x-icon" },
    ],
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
  openGraph: {
    type: "website",
    locale: "es_CL",
    url: "https://catalogo.vedisaremates.cl",
    siteName: "VEDISA REMATES",
    title: "Catálogo Oficial VEDISA REMATES | Remates y Venta Directa",
    description:
      "Inventario actualizado de vehículos para remate y venta directa. Cotiza, compara y oférta con respaldo comercial VEDISA.",
    images: [
      {
        url: "/vedisa-logo.png",
        width: 1200,
        height: 630,
        alt: "Catálogo Oficial VEDISA REMATES",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Catálogo Oficial VEDISA REMATES",
    description:
      "Revisa vehículos para remate y venta directa con respaldo comercial VEDISA.",
    images: ["/vedisa-logo.png"],
  },
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
