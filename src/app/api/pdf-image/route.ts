import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const PDF_IMAGE_FETCH_TIMEOUT_MS = 8_000;

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

function isAllowedImageUrl(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (isPrivateHost(url.hostname)) return false;

  const href = url.href.toLowerCase();
  if (href.includes("glo3d.net/iframe") || href.includes("<iframe")) return false;

  return (
    /\.(jpg|jpeg|png|webp|gif|bmp|avif)(\?|$)/i.test(href) ||
    /cloudinary|cloudfront|amazonaws|glo3d|supabase|cdn\.|img|image|media|vedisa|tasacion|foto|photo|thumb/i.test(
      href,
    )
  );
}

function inferImageContentTypeFromUrl(url: string): string | null {
  const href = url.toLowerCase().split("?")[0] ?? url.toLowerCase();
  if (/\.jpe?g$/.test(href)) return "image/jpeg";
  if (/\.png$/.test(href)) return "image/png";
  if (/\.webp$/.test(href)) return "image/webp";
  if (/\.gif$/.test(href)) return "image/gif";
  if (/\.bmp$/.test(href)) return "image/bmp";
  if (/\.avif$/.test(href)) return "image/avif";
  return null;
}

function sniffImageContentType(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    buffer.length >= 6 &&
    (buffer.subarray(0, 6).toString("ascii") === "GIF87a" ||
      buffer.subarray(0, 6).toString("ascii") === "GIF89a")
  ) {
    return "image/gif";
  }
  return null;
}

function resolveImageContentType(url: string, headerValue: string | null, buffer: Buffer): string | null {
  const header = (headerValue ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (header.startsWith("image/")) return header;

  const genericTypes = new Set([
    "",
    "application/octet-stream",
    "binary/octet-stream",
    "application/download",
    "application/x-download",
  ]);
  if (!genericTypes.has(header)) return null;

  return sniffImageContentType(buffer) ?? inferImageContentTypeFromUrl(url);
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const limited = checkRateLimit(`pdf-image:${ip}`, 40, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const rawUrl = request.nextUrl.searchParams.get("url")?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!isAllowedImageUrl(parsed)) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
  }

  try {
    const response = await fetch(parsed.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(PDF_IMAGE_FETCH_TIMEOUT_MS),
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    if (!response.ok) {
      return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0) {
      return NextResponse.json({ error: "Empty image" }, { status: 502 });
    }

    const contentType = resolveImageContentType(
      parsed.href,
      response.headers.get("content-type"),
      buffer,
    );
    if (!contentType) {
      return NextResponse.json({ error: "Not an image" }, { status: 415 });
    }

    const base64 = buffer.toString("base64");
    return NextResponse.json({
      dataUrl: `data:${contentType};base64,${base64}`,
      contentType,
    });
  } catch {
    return NextResponse.json({ error: "Proxy error" }, { status: 502 });
  }
}
