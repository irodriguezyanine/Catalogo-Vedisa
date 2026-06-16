import { createVehicleOffer } from "@/lib/offers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import type { OfferSubmissionInput } from "@/types/offers";

type OfferRequestBody = {
  itemKey?: string;
  vehicleTitle?: string;
  patent?: string;
  referencePrice?: number;
  offerAmount?: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  website?: string;
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limited = checkRateLimit(`offer:${ip}`, 12, 60 * 60_000);
  if (!limited.ok) {
    return Response.json(
      { ok: false, error: `Demasiadas ofertas desde esta red. Espera ${limited.retryAfterSec}s.` },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as OfferRequestBody;
  if (body.website?.trim()) {
    return Response.json({ ok: true });
  }
  const payload: OfferSubmissionInput = {
    itemKey: (body.itemKey ?? "").trim(),
    vehicleTitle: (body.vehicleTitle ?? "").trim(),
    patent: (body.patent ?? "").trim(),
    referencePrice: Number(body.referencePrice ?? 0),
    offerAmount: Number(body.offerAmount ?? 0),
    customerName: (body.customerName ?? "").trim(),
    customerEmail: (body.customerEmail ?? "").trim(),
    customerPhone: (body.customerPhone ?? "").trim(),
  };

  if (
    !payload.itemKey ||
    !payload.vehicleTitle ||
    !payload.patent ||
    !payload.customerName ||
    !payload.customerEmail ||
    !payload.customerPhone ||
    !Number.isFinite(payload.referencePrice) ||
    payload.referencePrice <= 0 ||
    !Number.isFinite(payload.offerAmount) ||
    payload.offerAmount <= 0
  ) {
    return Response.json({ ok: false, error: "Completa todos los campos obligatorios." }, { status: 400 });
  }

  if (!isValidEmail(payload.customerEmail)) {
    return Response.json({ ok: false, error: "Ingresa un correo válido." }, { status: 400 });
  }

  const result = await createVehicleOffer(payload);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }

  return Response.json({ ok: true });
}
