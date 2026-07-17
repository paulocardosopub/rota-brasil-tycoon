import { createClient } from 'npm:@supabase/supabase-js@2.110.7';

const allowedOrigins = new Set([
  'https://paulocardosopub.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173'
]);

const baseHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Vary': 'Origin'
};

type Json = Record<string, unknown>;

export function serveOnlineRpc(rpcName: string, mapBody: (body: Json) => Json) {
  Deno.serve(async (request) => {
    const origin = request.headers.get('Origin');
    if (origin && !allowedOrigins.has(origin)) return typedError('ORIGIN_NOT_ALLOWED', 403, undefined, baseHeaders);
    const responseHeaders = corsHeaders(origin);
    if (request.method === 'OPTIONS') return new Response('ok', { headers: responseHeaders });
    if (request.method !== 'POST') return typedError('METHOD_NOT_ALLOWED', 405, undefined, responseHeaders);
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > 8_192) return typedError('PAYLOAD_TOO_LARGE', 413, undefined, responseHeaders);
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return typedError('AUTH_REQUIRED', 401, undefined, responseHeaders);
    try {
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > 8_192) return typedError('PAYLOAD_TOO_LARGE', 413, undefined, responseHeaders);
      const body = JSON.parse(rawBody) as Json;
      if (!body || typeof body !== 'object' || Array.isArray(body)) return typedError('PAYLOAD_INVALID', 400, undefined, responseHeaders);
      if (body.version !== 1) return typedError('VERSION_MISMATCH', 409, undefined, responseHeaders);
      const url = Deno.env.get('SUPABASE_URL');
      const key = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
      if (!url || !key) return typedError('SERVER_CONFIGURATION', 503, undefined, responseHeaders);
      const client = createClient(url, key, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError || !user) return typedError('AUTH_INVALID', 401, undefined, responseHeaders);
      const { data, error } = await client.rpc(rpcName, mapBody(body));
      if (error) return typedError(normalizeCode(error.message), statusFor(error.message), error.message, responseHeaders);
      return new Response(JSON.stringify(data), { status: 200, headers: responseHeaders });
    } catch (error) {
      return typedError('PAYLOAD_INVALID', 400, error instanceof Error ? error.message : undefined, responseHeaders);
    }
  });
}

function corsHeaders(origin: string | null) {
  return { ...baseHeaders, 'Access-Control-Allow-Origin': origin ?? 'https://paulocardosopub.github.io' };
}

function typedError(code: string, status: number, detail?: string, headers: HeadersInit = baseHeaders) {
  return new Response(JSON.stringify({ error: { code, detail } }), { status, headers });
}

function normalizeCode(message: string) {
  const known = ['AUTH_REQUIRED','RATE_LIMITED','VERSION_MISMATCH','PUBLIC_PROFILE_INVALID','CHUNKS_INVALID','NAME_COOLDOWN','SESSION_INVALID','VEHICLE_NOT_OWNED','DEPLOYMENT_INVALID','LOCATION_INVALID','PAYLOAD_TOO_LARGE'];
  return known.find((code) => message.includes(code)) ?? 'ONLINE_REQUEST_REJECTED';
}

function statusFor(message: string) {
  if (message.includes('AUTH_')) return 401;
  if (message.includes('RATE_LIMITED')) return 429;
  if (message.includes('VERSION_MISMATCH')) return 409;
  return 422;
}
