// Centralized CORS configuration for all edge functions
const ALLOWED_ORIGINS = [
  "https://audiomax.lovable.app",
  "https://id-preview--ec1ffb69-6081-4f85-9ac7-64b6751e9302.lovable.app",
  // Allow localhost for development
  "http://localhost:5173",
  "http://localhost:3000",
];

export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, stripe-signature, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Vary": "Origin",
  };
}

export function handleCorsPreflightIfNeeded(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  return null;
}
