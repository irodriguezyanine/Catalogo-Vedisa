import { createClient } from "@supabase/supabase-js";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import type { OfferRecord, OfferSubmissionInput } from "@/types/offers";

const OFFERS_TABLE = process.env.CATALOG_OFFERS_TABLE ?? "catalogo_vehicle_offers";
const OFFER_NOTIFICATION_TO_EMAILS = [
  "tasaciones@vedisaremates.cl",
  "jpmontero@vedisaremates.cl",
  "comercial@vedisaremates.cl",
] as const;
const OFFER_NOTIFICATION_FROM_EMAIL =
  process.env.CATALOG_OFFERS_FROM_EMAIL ?? process.env.AWS_SES_FROM_EMAIL ?? "no-reply@vedisaremates.cl";
const OFFER_NOTIFICATION_LOGO_URL = "https://catalogo.vedisaremates.cl/vedisa-logo.png";

function getOffersSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function toSafeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function formatOfferDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(date);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getSesClient(): SESClient | null {
  const region = process.env.AWS_REGION ?? "us-east-1";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;

  if (!accessKeyId || !secretAccessKey) return null;

  return new SESClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    },
  });
}

async function sendOfferNotificationEmail(payload: {
  vehicleTitle: string;
  patent: string;
  referencePrice: number;
  offerAmount: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  createdAt: string;
}): Promise<void> {
  const ses = getSesClient();
  if (!ses) return;

  const subject = `Nueva oferta recibida | ${payload.patent} | ${payload.vehicleTitle} | CATALOGO VEDISA`;
  const createdAtLabel = formatOfferDate(payload.createdAt);
  const referencePriceLabel = formatCurrency(payload.referencePrice);
  const offerAmountLabel = formatCurrency(payload.offerAmount);
  const escaped = {
    vehicleTitle: escapeHtml(payload.vehicleTitle),
    patent: escapeHtml(payload.patent),
    referencePrice: escapeHtml(referencePriceLabel),
    offerAmount: escapeHtml(offerAmountLabel),
    customerName: escapeHtml(payload.customerName),
    customerEmail: escapeHtml(payload.customerEmail),
    customerPhone: escapeHtml(payload.customerPhone),
    createdAt: escapeHtml(createdAtLabel),
  };

  const html = `
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;background:linear-gradient(120deg,#f8fafc,#ecfeff);border-bottom:1px solid #e2e8f0;">
                <img src="${OFFER_NOTIFICATION_LOGO_URL}" alt="VEDISA REMATES" style="display:block;width:220px;max-width:100%;height:auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 12px;font-size:13px;letter-spacing:.4px;text-transform:uppercase;color:#0e7490;font-weight:700;">Nueva oferta recibida</p>
                <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#0f172a;">${escaped.patent} · ${escaped.vehicleTitle}</h1>
                <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#334155;">
                  Se registró una nueva oferta en el Catálogo Vedisa. Aquí están los detalles para seguimiento comercial.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 8px;">
                  <tr>
                    <td style="font-size:13px;color:#475569;width:42%;">Fecha de ingreso</td>
                    <td style="font-size:14px;font-weight:700;color:#0f172a;">${escaped.createdAt}</td>
                  </tr>
                  <tr>
                    <td style="font-size:13px;color:#475569;">Precio de referencia</td>
                    <td style="font-size:14px;font-weight:700;color:#0f172a;">${escaped.referencePrice}</td>
                  </tr>
                  <tr>
                    <td style="font-size:13px;color:#475569;">Oferta del cliente</td>
                    <td style="font-size:18px;font-weight:800;color:#0e7490;">${escaped.offerAmount}</td>
                  </tr>
                </table>
                <div style="margin:20px 0;border-top:1px solid #e2e8f0;"></div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 10px;">
                  <tr>
                    <td style="font-size:13px;color:#475569;width:42%;">Cliente</td>
                    <td style="font-size:14px;font-weight:700;color:#0f172a;">${escaped.customerName}</td>
                  </tr>
                  <tr>
                    <td style="font-size:13px;color:#475569;">Correo</td>
                    <td style="font-size:14px;color:#0f172a;">
                      <a href="mailto:${escaped.customerEmail}" style="color:#0369a1;text-decoration:none;">${escaped.customerEmail}</a>
                    </td>
                  </tr>
                  <tr>
                    <td style="font-size:13px;color:#475569;">Teléfono</td>
                    <td style="font-size:14px;color:#0f172a;">
                      <a href="tel:${escaped.customerPhone}" style="color:#0369a1;text-decoration:none;">${escaped.customerPhone}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:12px;color:#64748b;">Catálogo VEDISA · Notificación automática de ofertas.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();

  const text = [
    "Nueva oferta recibida | CATALOGO VEDISA",
    "",
    `Patente: ${payload.patent}`,
    `Vehículo: ${payload.vehicleTitle}`,
    `Fecha: ${createdAtLabel}`,
    `Precio referencia: ${referencePriceLabel}`,
    `Oferta: ${offerAmountLabel}`,
    "",
    "Cliente",
    `Nombre: ${payload.customerName}`,
    `Correo: ${payload.customerEmail}`,
    `Teléfono: ${payload.customerPhone}`,
  ].join("\n");

  await ses.send(
    new SendEmailCommand({
      Source: OFFER_NOTIFICATION_FROM_EMAIL,
      Destination: { ToAddresses: [...OFFER_NOTIFICATION_TO_EMAILS] },
      Message: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: html, Charset: "UTF-8" },
          Text: { Data: text, Charset: "UTF-8" },
        },
      },
    }),
  );
}

export async function createVehicleOffer(
  input: OfferSubmissionInput,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getOffersSupabase();
  if (!supabase) {
    return { ok: false, error: "No se pudo enviar la oferta en este momento." };
  }

  const itemKey = toSafeText(input.itemKey);
  const vehicleTitle = toSafeText(input.vehicleTitle);
  const patent = toSafeText(input.patent).toUpperCase();
  const customerName = toSafeText(input.customerName);
  const customerEmail = toSafeText(input.customerEmail).toLowerCase();
  const customerPhone = toSafeText(input.customerPhone);

  if (
    !itemKey ||
    !vehicleTitle ||
    !patent ||
    !customerName ||
    !customerEmail ||
    !customerPhone ||
    !Number.isFinite(input.referencePrice) ||
    input.referencePrice <= 0 ||
    !Number.isFinite(input.offerAmount) ||
    input.offerAmount <= 0
  ) {
    return { ok: false, error: "Datos inválidos para registrar la oferta." };
  }

  const createdAt = input.createdAt ?? new Date().toISOString();
  const { error } = await supabase.from(OFFERS_TABLE).insert({
    item_key: itemKey,
    vehicle_title: vehicleTitle,
    patent,
    reference_price: Math.round(input.referencePrice),
    offer_amount: Math.round(input.offerAmount),
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    created_at: createdAt,
  });

  if (error) {
    return {
      ok: false,
      error:
        `No se pudo guardar la oferta en '${OFFERS_TABLE}'. ` +
        "Verifica columnas: item_key, vehicle_title, patent, reference_price, offer_amount, customer_name, customer_email, customer_phone, created_at.",
    };
  }

  try {
    await sendOfferNotificationEmail({
      vehicleTitle,
      patent,
      referencePrice: Math.round(input.referencePrice),
      offerAmount: Math.round(input.offerAmount),
      customerName,
      customerEmail,
      customerPhone,
      createdAt,
    });
  } catch (error) {
    console.error("No se pudo enviar notificación de oferta por email:", error);
  }

  return { ok: true };
}

export async function readVehicleOffers(options: {
  limit?: number;
}): Promise<{ ok: boolean; offers: OfferRecord[]; error?: string }> {
  const supabase = getOffersSupabase();
  if (!supabase) return { ok: false, offers: [], error: "No hay conexión a ofertas." };

  const limit = Math.max(50, Math.min(options.limit ?? 5000, 10000));
  const { data, error } = await supabase
    .from(OFFERS_TABLE)
    .select(
      "id,item_key,vehicle_title,patent,reference_price,offer_amount,customer_name,customer_email,customer_phone,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return {
      ok: false,
      offers: [],
      error: `No se pudo leer ofertas desde '${OFFERS_TABLE}'.`,
    };
  }

  const offers = (data ?? []).map((row) => {
    const safe = row as Record<string, unknown>;
    return {
      id: String(safe.id ?? crypto.randomUUID()),
      itemKey: String(safe.item_key ?? ""),
      vehicleTitle: String(safe.vehicle_title ?? ""),
      patent: String(safe.patent ?? ""),
      referencePrice: Number(safe.reference_price ?? 0),
      offerAmount: Number(safe.offer_amount ?? 0),
      customerName: String(safe.customer_name ?? ""),
      customerEmail: String(safe.customer_email ?? ""),
      customerPhone: String(safe.customer_phone ?? ""),
      createdAt: String(safe.created_at ?? ""),
    } satisfies OfferRecord;
  });

  return { ok: true, offers };
}
