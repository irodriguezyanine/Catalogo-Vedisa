import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Catálogo oficial Vedisa Remates — remates y venta directa";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0e7490 0%, #164e63 55%, #0f172a 100%)",
          color: "white",
          padding: "56px 64px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 2, opacity: 0.92 }}>
            VEDISAREMATES.CL
          </div>
          <div style={{ fontSize: 62, fontWeight: 800, lineHeight: 1.05, maxWidth: 900 }}>
            Catálogo oficial de vehículos
          </div>
          <div style={{ fontSize: 34, lineHeight: 1.35, opacity: 0.9, maxWidth: 880 }}>
            Información transparente de las mejores oportunidades del mercado.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 16,
            fontSize: 24,
            fontWeight: 600,
            opacity: 0.88,
          }}
        >
          <span>catalogo.vedisaremates.cl</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
