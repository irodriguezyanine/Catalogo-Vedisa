import type { Metadata, Viewport } from "next";
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
        url: "/favicon.png",
        width: 128,
        height: 128,
        alt: "Catálogo Vedisa",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Catálogo Oficial VEDISA REMATES",
    description:
      "Revisa nuestro stock de autos y dinos cuáles te interesan en Catálogo Vedisa.",
    images: ["/favicon.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
      <body className="min-h-full flex flex-col">
        <a
          href="#catalogo-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-cyan-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
