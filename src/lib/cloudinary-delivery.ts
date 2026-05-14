/**
 * Cloudinary suele entregar `raw` (PDF) como descarga. Con `fl_inline` el navegador
 * puede abrir el PDF en una pestaña en lugar de forzar adjunto.
 * @see https://cloudinary.com/documentation/image_transformation_reference#fl_inline
 */
export function cloudinaryRawPdfUrlForInlineDisplay(url: string): string {
  try {
    const u = new URL(url.trim());
    if (!/^res\.cloudinary\.com$/i.test(u.hostname)) return url;
    if (!u.pathname.includes("/raw/upload/")) return url;
    if (u.pathname.includes("/fl_inline") || u.pathname.includes("fl_inline/")) return url;
    u.pathname = u.pathname.replace("/raw/upload/", "/raw/upload/fl_inline/");
    return u.toString();
  } catch {
    return url;
  }
}

/** Inserta `fl_inline` en todas las URLs raw de Cloudinary dentro de HTML (p. ej. observaciones). */
export function cloudinaryRawUrlsInlineInHtml(html: string): string {
  if (!html.includes("res.cloudinary.com") || !html.includes("/raw/upload/")) return html;
  return html.replace(
    /https?:\/\/res\.cloudinary\.com[^"'\\\s>]+/gi,
    (match) => cloudinaryRawPdfUrlForInlineDisplay(match),
  );
}
