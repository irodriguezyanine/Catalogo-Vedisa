import { createHash } from "node:crypto";
import { cloudinaryRawPdfUrlForInlineDisplay } from "@/lib/cloudinary-delivery";

export type CloudinaryServerCreds = {
  cloudName: string;
  folder: string;
  uploadPreset?: string;
  apiKey?: string;
  apiSecret?: string;
};

export type CloudinaryUploadedFile = {
  url: string;
  label: string;
  mimeType: string;
  resourceType: "image" | "raw";
};

const MAX_BYTES = 15 * 1024 * 1024;

export function getCloudinaryServerCreds(): CloudinaryServerCreds | null {
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

export function buildCloudinarySignature(params: Record<string, string>, secret: string): string {
  const serialized = Object.entries(params)
    .filter(([, value]) => value.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return createHash("sha1").update(`${serialized}${secret}`).digest("hex");
}

function sanitizeSubfolder(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "general";
}

function resolveResourceType(mimeType: string): "image" | "raw" {
  return mimeType.startsWith("image/") ? "image" : "raw";
}

function normalizeDeliveryUrl(url: string, resourceType: "image" | "raw"): string {
  if (resourceType === "raw") {
    return cloudinaryRawPdfUrlForInlineDisplay(url);
  }
  return url;
}

export async function uploadBufferToCloudinary(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  creds: CloudinaryServerCreds,
  subfolder: string,
): Promise<CloudinaryUploadedFile | null> {
  if (buffer.length === 0 || buffer.length > MAX_BYTES) return null;

  const resourceType = resolveResourceType(mimeType);
  const endpoint = `https://api.cloudinary.com/v1_1/${creds.cloudName}/${resourceType}/upload`;
  const folder = `${creds.folder}/documentos/${sanitizeSubfolder(subfolder)}`;
  const body = new FormData();
  body.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType || "application/octet-stream" }), fileName);
  body.append("folder", folder);

  if (creds.uploadPreset) {
    body.append("upload_preset", creds.uploadPreset);
  } else {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = buildCloudinarySignature({ folder, timestamp }, creds.apiSecret as string);
    body.append("timestamp", timestamp);
    body.append("api_key", creds.apiKey as string);
    body.append("signature", signature);
  }

  const response = await fetch(endpoint, { method: "POST", body });
  const payload = (await response.json().catch(() => ({}))) as {
    secure_url?: string;
    error?: { message?: string };
  };
  if (!response.ok || !payload.secure_url) return null;

  return {
    url: normalizeDeliveryUrl(payload.secure_url, resourceType),
    label: fileName.replace(/\.[^.]+$/, "") || "Documento",
    mimeType: mimeType || "application/octet-stream",
    resourceType,
  };
}

export async function uploadFileToCloudinary(
  file: File,
  creds: CloudinaryServerCreds,
  subfolder: string,
): Promise<CloudinaryUploadedFile | null> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  return uploadBufferToCloudinary(buffer, file.name || "documento", mimeType, creds, subfolder);
}

export const ACCEPTED_DOCUMENT_MIME_PREFIXES = [
  "image/",
  "application/pdf",
  "application/vnd.",
  "application/msword",
  "application/vnd.ms-",
  "text/csv",
  "text/plain",
] as const;

export function isAcceptedDocumentFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  if (!mime) {
    return /\.(pdf|jpe?g|png|gif|webp|xlsx?|docx?|pptx?|csv)$/i.test(file.name);
  }
  if (mime.startsWith("image/")) return true;
  return ACCEPTED_DOCUMENT_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}
