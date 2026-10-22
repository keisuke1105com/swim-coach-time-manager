import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// Supabase Edge Function: jasf-ranking
// Existing app's JASF ranking query parameters are preserved.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return reply({ success: false, error: 'POST only' }, 405);
  // Only authenticated coaches may invoke the upstream ranking lookup.
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return reply({ success: false, error: 'Authentication required' }, 401);
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!supabaseUrl || !anonKey) return reply({ success: false, error: 'Server auth configuration missing' }, 500);
  const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  // The scheduled worker holds the existing server-only service credential.
  // Do not trust client-editable metadata or a decoded JWT role claim.
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  let worker = false;
  if (serviceKey && token.length === serviceKey.length) {
    let difference = 0;
    for (let i = 0; i < serviceKey.length; i++) difference |= token.charCodeAt(i) ^ serviceKey.charCodeAt(i);
    worker = difference === 0;
  }
  if (!worker) {
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    if (authError || !user) return reply({ success: false, error: 'Invalid session' }, 401);
  }


  // Do not allow arbitrary URLs or query keys: this function talks only to JASF.
  try {
    const body = await req.json();
    const year = Number(body.year);
    const waterway = Number(body.waterway_code);
    const gender = Number(body.gender_code);
    const distance = Number(body.distance_code);
    const style = Number(body.swimming_style_code);
    const schoolClass = String(body.school_class_code ?? '99');
    const grade = String(body.school_grade ?? '99');
    const name = String(body.swimmer_name ?? '').trim();
    const page = Number(body.page ?? 1);

    if (!Number.isInteger(year) || year < 2020 || year > 2100 ||
        ![1, 2].includes(waterway) || ![1, 2].includes(gender) ||
        !Number.isInteger(distance) || distance < 1 || distance > 20 ||
        !Number.isInteger(style) || style < 1 || style > 20 ||
        !/^\d{1,3}$/.test(schoolClass) || !/^\d{1,3}$/.test(grade) ||
        name.length > 100 || !Number.isInteger(page) || page < 1 || page > 500) {
      return reply({ success: false, error: 'Invalid ranking query parameters' }, 400);
    }

    const params = new URLSearchParams({
      year: String(year), waterway_code: String(waterway), gender_code: String(gender),
      distance_code: String(distance), swimming_style_code: String(style),
      school_class_code: schoolClass, school_grade: grade,
      swimmer_name: name, page: String(page),
    });
    const url = `https://result.swim.or.jp/api/v1/rankings/results?${params}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);
    let response: Response;
    try {
      response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    } catch (error) {
      return reply({ success: false, error: 'JASF connection failed', detail: String(error) }, 502);
    } finally {
      clearTimeout(timeout);
    }
    const raw = await response.text();
    if (!response.ok) return reply({ success: false, error: `JASF HTTP ${response.status}`, detail: raw.slice(0, 300) }, 502);
    let json: any;
    try { json = JSON.parse(raw); }
    catch { return reply({ success: false, error: 'JASF returned non-JSON', detail: raw.slice(0, 200) }, 502); }
    const rows = Array.isArray(json?.data) ? json.data : Array.isArray(json?.data?.data) ? json.data.data : null;
    if (!rows) return reply({ success: false, error: 'Unexpected JASF response shape', detail: JSON.stringify(json).slice(0, 300) }, 502);
    return reply({ success: true, data: rows });
  } catch (error) {
    return reply({ success: false, error: 'Function error', detail: String(error) }, 500);
  }
});
