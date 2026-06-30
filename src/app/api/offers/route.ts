export async function POST() {
  return Response.json(
    {
      ok: false,
      error: "Las ofertas por catálogo están deshabilitadas. Contáctanos por WhatsApp.",
    },
    { status: 403 },
  );
}
