import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin-session";
import {
  getCloudinaryServerCreds,
  isAcceptedDocumentFile,
  uploadFileToCloudinary,
} from "@/lib/cloudinary-upload-server";

function isFile(value: FormDataEntryValue): value is File {
  return typeof value !== "string";
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = verifyAdminSessionToken(token);
  if (!session.valid || !session.email) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const creds = getCloudinaryServerCreds();
  if (!creds) {
    return Response.json(
      {
        ok: false,
        error:
          "Cloudinary no está configurado. Define CLOUDINARY_CLOUD_NAME y preset o API key/secret.",
      },
      { status: 400 },
    );
  }

  const formData = await req.formData();
  const fileEntries = formData.getAll("files").filter(isFile);
  if (fileEntries.length === 0) {
    return Response.json({ ok: false, error: "No se enviaron archivos." }, { status: 400 });
  }

  const subfolder = formData.get("subfolder")?.toString().trim() || "vehiculos";
  const uploaded: Array<{ url: string; label: string; mimeType: string }> = [];

  for (const file of fileEntries) {
    if (!isAcceptedDocumentFile(file)) {
      return Response.json(
        {
          ok: false,
          error: `Tipo de archivo no permitido: ${file.name || "sin nombre"}. Usa PDF, imágenes, Excel, Word u otros documentos.`,
        },
        { status: 400 },
      );
    }

    const result = await uploadFileToCloudinary(file, creds, subfolder);
    if (!result) {
      return Response.json(
        {
          ok: false,
          error: `No se pudo subir ${file.name || "el archivo"} a Cloudinary (máx. 15 MB).`,
        },
        { status: 400 },
      );
    }
    uploaded.push({
      url: result.url,
      label: result.label,
      mimeType: result.mimeType,
    });
  }

  return Response.json({ ok: true, documents: uploaded });
}
