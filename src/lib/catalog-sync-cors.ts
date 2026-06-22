const ALLOWED_ORIGINS = new Set([
  "https://vedisa.vercel.app",
  "https://www.vedisa.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
]);

export function buildCatalogSyncCorsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin")?.trim() ?? "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://vedisa.vercel.app";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-catalog-sync-secret",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function withCatalogSyncCors(req: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(buildCatalogSyncCorsHeaders(req))) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
