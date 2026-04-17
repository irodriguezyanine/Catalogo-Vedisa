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
    "Catálogo Vedisa: revisa nuestro stock de autos disponibles para remate y venta directa, y cuéntanos cuáles te interesan para ayudarte con la mejor alternativa.",
  alternates: {
    canonical: "https://catalogo.vedisaremates.cl",
  },
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/favicon.ico", type: "image/x-icon" },
    ],
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    type: "website",
    locale: "es_CL",
    url: "https://catalogo.vedisaremates.cl",
    siteName: "VEDISA REMATES",
    title: "Catálogo Oficial VEDISA REMATES | Remates y Venta Directa",
    description:
      "Revisa nuestro stock de autos en Catálogo Vedisa y dinos qué unidades te interesan para asesorarte en tu compra.",
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
      "Revisa nuestro stock de autos y dinos cuáles te interesan en Catálogo Vedisa.",
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
