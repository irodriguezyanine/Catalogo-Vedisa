import { createHash } from "node:crypto";
import { cloudinaryRawPdfUrlForInlineDisplay } from "@/lib/cloudinary-delivery";
import type { RainworxDocumento } from "@/lib/rainworx-scrape";
import { getRainworxOrigin } from "@/lib/rainworx-scrape";

const FETCH_UA =
  "Mozilla/5.0 (compatible; VedisaCatalogBot/1.0; +https://vedisaremates.cl)";
const MAX_PDF_BYTES = 12 * 1024 * 1024;

type CloudinaryCreds = {
  cloudName: string;
  folder: string;
  uploadPreset?: string;
  apiKey?: string;
  apiSecret?: string;
};

function buildSignature(params: Record<string, string>, secret: string): string {
  const serialized = Object.entries(params)
    .filter(([, value]) => value.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return createHash("sha1").update(`${serialized}${secret}`).digest("hex");
}

function getCloudinaryCreds(): CloudinaryCreds | null {
  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME ??
    process.env.VITE_CLOUDINARY_CLOUD_NAME ??
    process.env.CATALOG_CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return null;
  const folder =
    process.env.CLOUDINARY_FOLDER ??
    process.env.VITE_CLOUDINARY_FOLDER ??
    process.env.CATALOG_CLOUDINARY_FOLDER ??
    "vedisa/catalogo";
  const uploadPreset =
    process.env.CLOUDINARY_UPLOAD_PRESET ??
    process.env.VITE_CLOUDINARY_UPLOAD_PRESET ??
    process.env.CATALOG_CLOUDINARY_UPLOAD_PRESET;
  const apiKey =
    process.env.CLOUDINARY_API_KEY ??
    process.env.VITE_CLOUDINARY_API_KEY ??
    process.env.CATALOG_CLOUDINARY_API_KEY;
  const apiSecret =
    process.env.CLOUDINARY_API_SECRET ??
    process.env.VITE_CLOUDINARY_API_SECRET ??
    process.env.CATALOG_CLOUDINARY_API_SECRET;
  if (!uploadPreset && (!apiKey || !apiSecret)) return null;
  return { cloudName, folder, uploadPreset, apiKey, apiSecret };
}

function hostnameMatchesRainworx(url: string): boolean {
  let baseHost: string;
  try {
    baseHost = new URL(getRainworxOrigin()).hostname.toLowerCase();
  } catch {
    return false;
  }
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === baseHost;
  } catch {
    return false;
  }
}

async function uploadPdfBuffer(
  buffer: Buffer,
  creds: CloudinaryCreds,
  subfolder: string,
): Promise<string | null> {
  const endpoint = `https://api.cloudinary.com/v1_1/${creds.cloudName}/raw/upload`;
  const body = new FormData();
  const fileName = `lote-${subfolder}-${createHash("sha256").update(buffer).digest("hex").slice(0, 14)}.pdf`;
  body.append("file", new Blob([new Uint8Array(buffer)], { type: "application/pdf" }), fileName);

  const folder = `${creds.folder}/documentos-lote/${subfolder}`;

  if (creds.uploadPreset) {
    body.append("upload_preset", creds.uploadPreset);
    body.append("folder", folder);
  } else {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = buildSignature({ folder, timestamp }, creds.apiSecret as string);
    body.append("folder", folder);
    body.append("timestamp", timestamp);
    body.append("api_key", creds.apiKey as string);
    body.append("signature", signature);
  }

  const res = await fetch(endpoint, { method: "POST", body });
  const payload = (await res.json().catch(() => ({}))) as {
    secure_url?: string;
    error?: { message?: string };
  };
  if (!res.ok || !payload.secure_url) {
    return null;
  }
  return cloudinaryRawPdfUrlForInlineDisplay(payload.secure_url);
}

/**
 * Descarga PDFs desde Rainworx (mismo dominio configurado) y los sube a Cloudinary como `raw`.
 * Si no hay credenciales o falla la subida, conserva la URL original.
 */
export async function mirrorRainworxDocumentsToCloudinary(
  docs: RainworxDocumento[],
  lotId: string,
): Promise<RainworxDocumento[]> {
  if (docs.length === 0) return docs;
  const creds = getCloudinaryCreds();
  if (!creds) return docs;

  const out: RainworxDocumento[] = [];
  for (const doc of docs) {
    if (!hostnameMatchesRainworx(doc.url)) {
      out.push(doc);
      continue;
    }
    try {
      const head = await fetch(doc.url, {
        method: "GET",
        headers: { "User-Agent": FETCH_UA, Accept: "application/pdf,*/*" },
        redirect: "follow",
      });
      if (!head.ok) {
        out.push(doc);
        continue;
      }
      const ct = (head.headers.get("content-type") ?? "").toLowerCase();
      const arrayBuf = await head.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const magicPdf =
        buffer.length >= 5 && buffer.subarray(0, 4).toString("ascii") === "%PDF";
      const isPdf = ct.includes("pdf") || magicPdf;
      if (!isPdf || buffer.length > MAX_PDF_BYTES || buffer.length < 64) {
        out.push(doc);
        continue;
      }
      const uploaded = await uploadPdfBuffer(buffer, creds, lotId);
      if (uploaded) {
        out.push({ url: uploaded, label: doc.label });
      } else {
        out.push(doc);
      }
    } catch {
      out.push(doc);
    }
  }
  return out;
}
