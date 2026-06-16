/** Sanitización básica de HTML de descripciones (sin dependencias externas). */

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "h4",
  "span",
  "div",
  "a",
]);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function sanitizeCatalogHtml(html?: string | null): string {
  if (!html?.trim()) return "";
  let out = html;
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style[\s\S]*?<\/style>/gi, "");
  out = out.replace(/<(iframe|object|embed|link|meta|form|input|button)[^>]*>/gi, "");
  out = out.replace(/<\/(iframe|object|embed|link|meta|form|input|button)>/gi, "");
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/\s(href|src)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]*)/gi, "");
  out = out.replace(/<(\/?)([a-z0-9]+)([^>]*)>/gi, (match, slash, tagName: string, attrs: string) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (slash) return `</${tag}>`;
    if (tag === "a") {
      const hrefMatch = attrs.match(/\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const href = (hrefMatch?.[2] ?? hrefMatch?.[3] ?? hrefMatch?.[4] ?? "").trim();
      if (href && /^https?:\/\//i.test(href)) {
        return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">`;
      }
      return "<a>";
    }
    return `<${tag}>`;
  });
  return out;
}

export function stripHtmlToPlainText(html?: string | null): string {
  if (!html?.trim()) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
