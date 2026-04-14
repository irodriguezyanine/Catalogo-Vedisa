import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";

function isFile(value: FormDataEntryValue): value is File {
  return typeof value !== "string";
}

function buildSignature(params: Record<string, string>, secret: string): string {
  const serialized = Object.entries(params)
    .filter(([, value]) => value.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return createHash("sha1").update(`${serialized}${secret}`).digest("hex");
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = verifyAdminSessionToken(token);
  if (!session.valid || !session.email) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const folder = process.env.CLOUDINARY_FOLDER ?? "vedisa/catalogo";

  if (!cloudName) {
    return Response.json(
      { ok: false, error: "Falta CLOUDINARY_CLOUD_NAME en variables de entorno." },
      { status: 400 },
    );
  }

  if (!uploadPreset && (!apiKey || !apiSecret)) {
    return Response.json(
      {
        ok: false,
        error:
          "Configura CLOUDINARY_UPLOAD_PRESET (unsigned) o CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET (signed).",
      },
      { status: 400 },
    );
  }

  const formData = await req.formData();
  const fileEntries = formData.getAll("files").filter(isFile);
  if (fileEntries.length === 0) {
    return Response.json({ ok: false, error: "No se enviaron archivos." }, { status: 400 });
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const uploadedUrls: string[] = [];

  for (const file of fileEntries) {
    const body = new FormData();
    body.set("file", file);
    body.set("folder", folder);

    if (uploadPreset) {
      body.set("upload_preset", uploadPreset);
    } else {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = buildSignature({ folder, timestamp }, apiSecret as string);
      body.set("api_key", apiKey as string);
      body.set("timestamp", timestamp);
      body.set("signature", signature);
    }

    const response = await fetch(endpoint, {
      method: "POST",
      body,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      secure_url?: string;
      error?: { message?: string };
    };
    if (!response.ok || !payload.secure_url) {
      const message = payload.error?.message ?? "No se pudo subir imagen a Cloudinary.";
      return Response.json({ ok: false, error: message }, { status: 400 });
    }
    uploadedUrls.push(payload.secure_url);
  }

  return Response.json({ ok: true, urls: uploadedUrls });
}
