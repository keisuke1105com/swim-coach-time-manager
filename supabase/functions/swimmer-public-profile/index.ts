import { createClient } from "npm:@supabase/supabase-js@2";
import { JO_STANDARDS } from "../_shared/jo-standards.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
});
const validToken = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function ageOnDate(birthDate: string | null, targetDate: string | null) {
  if (!birthDate || !targetDate) return null;
  const birth = new Date(birthDate + "T00:00:00");
  const target = new Date(targetDate + "T00:00:00");
  if (Number.isNaN(birth.getTime()) || Number.isNaN(target.getTime())) return null;
  let age = target.getFullYear() - birth.getFullYear();
  if (target.getMonth() < birth.getMonth() || (target.getMonth() === birth.getMonth() && target.getDate() < birth.getDate())) age--;
  return age;
}

function nextJoMeetDate(today = new Date().toISOString().slice(0, 10)) {
  const d = new Date(today + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const seasonYear = month >= 4 ? year : year - 1;
  const schedule: Record<number, { summer: string; spring: string }> = {
    2026: { summer: "2026-08-22", spring: "2027-03-27" },
  };
  const season = schedule[seasonYear];
  if (!season) return null;
  return today <= season.summer ? season.summer : season.spring;
}

function joStandard(swimmer: any, stroke: string, distance: number, course: string, meetDate: string | null) {
  let age = ageOnDate(swimmer.birth_date || null, meetDate);
  let division = String(swimmer.age_group || "");
  if (age !== null) {
    if (age <= 9) division = "9歳以下";
    else if (age <= 14) division = `${age}歳`;
    else if (age <= 16) division = "15〜16歳";
    else division = "CS";
  }
  if (division === "17-18歳" || division === "17～18歳") division = "CS";
  const cs50AgeDivision = ["13歳", "14歳", "15〜16歳", "15～16歳", "17-18歳", "17～18歳", "CS"].includes(division.trim());
  if (distance === 50 && ["背泳ぎ", "平泳ぎ", "バタフライ"].includes(stroke) &&
      ((age !== null && age >= 13) || cs50AgeDivision)) division = "CS";
  const standard = JO_STANDARDS.find((row) =>
    row.event === stroke && Number.parseInt(row.distance, 10) === distance && row.division === division
  );
  if (!standard) return null;
  const gender = String(swimmer.gender || "").trim();
  const field = gender === "男子"
    ? (course === "長水路" ? standard.maleLC : standard.maleSC)
    : gender === "女子"
      ? (course === "長水路" ? standard.femaleLC : standard.femaleSC)
      : null;
  return field !== null && field !== undefined && Number.isFinite(Number(field)) && Number(field) > 0
    ? Number(field) : null;
}

async function buildPublicJoRanking(sb: any) {
  const meetDate = nextJoMeetDate();
  if (!meetDate) return [];
  const { data: shares, error: sharesError } = await sb.from("swimmer_public_shares")
    .select("swimmer_id").eq("is_enabled", true).not("consent_confirmed_at", "is", null);
  if (sharesError) throw sharesError;
  const ids = [...new Set((shares || []).map((row: any) => String(row.swimmer_id)).filter(Boolean))];
  if (!ids.length) return [];

  const { data: swimmers, error: swimmersError } = await sb.from("swimmers")
    .select("id, name, age_group, gender, birth_date").eq("active", true).in("id", ids);
  if (swimmersError) throw swimmersError;
  const swimmerById = new Map((swimmers || []).map((row: any) => [String(row.id), row]));
  if (!swimmerById.size) return [];

  const records: any[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await sb.from("swim_records")
      .select("swimmer_id, stroke, distance, course, time_seconds")
      .in("swimmer_id", [...swimmerById.keys()])
      .range(from, from + pageSize - 1);
    if (error) throw error;
    records.push(...(page ?? []));
    if ((page ?? []).length < pageSize) break;
  }

  const eventBests = new Map<string, any>();
  for (const record of records) {
    const swimmer = swimmerById.get(String(record.swimmer_id));
    const time = Number(record.time_seconds);
    const distance = Number(record.distance);
    if (!swimmer || !Number.isFinite(time) || time <= 0 || !Number.isInteger(distance)) continue;
    if (!["短水路", "長水路"].includes(String(record.course))) continue;
    const standard = joStandard(swimmer, String(record.stroke || ""), distance, String(record.course), meetDate);
    if (standard === null) continue;
    const key = `${swimmer.id}|${record.stroke}|${distance}|${record.course}`;
    const previous = eventBests.get(key);
    if (!previous || time < previous.time) {
      eventBests.set(key, { swimmer, stroke: record.stroke, distance, course: record.course, time, standard });
    }
  }

  const bestBySwimmer = new Map<string, any>();
  for (const item of eventBests.values()) {
    const rate = item.standard / item.time * 100;
    const swimmerId = String(item.swimmer.id);
    const previous = bestBySwimmer.get(swimmerId);
    if (!previous || rate > previous.rate) {
      bestBySwimmer.set(swimmerId, {
        name: String(item.swimmer.name || ""),
        stroke: String(item.stroke),
        distance: item.distance,
        course: String(item.course),
        time: item.time,
        standard: item.standard,
        rate,
        diff: item.time - item.standard,
        qualified: item.time <= item.standard,
      });
    }
  }
  return [...bestBySwimmer.values()]
    .sort((a, b) => Number(b.qualified) - Number(a.qualified) || b.rate - a.rate)
    .slice(0, 30)
    .map((row, index) => ({ rank: index + 1, ...row }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  try {
    const token = new URL(req.url).searchParams.get("token") || "";
    if (!validToken(token)) return json({ error: "Invalid link" }, 400);
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ error: "Server configuration error" }, 500);
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: share, error: shareError } = await sb.from("swimmer_public_shares")
      .select("swimmer_id").eq("share_token", token).eq("is_enabled", true)
      .not("consent_confirmed_at", "is", null).maybeSingle();
    if (shareError) throw shareError;
    if (!share) return json({ error: "Profile not found" }, 404);

    const { data: swimmer, error: swimmerError } = await sb.from("swimmers")
      .select("id, name, age_group, team, gender").eq("id", share.swimmer_id)
      .eq("active", true).maybeSingle();
    if (swimmerError) throw swimmerError;
    if (!swimmer) return json({ error: "Profile not found" }, 404);

    const records: any[] = [];
    const pageSize = 500;
    for (let from = 0; ; from += pageSize) {
      const { data: page, error } = await sb.from("swim_records")
        .select("stroke, distance, course, time_seconds, meet_name, record_date, laps, is_personal_best, is_jo_qualified")
        .eq("swimmer_id", swimmer.id)
        .order("record_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      records.push(...(page ?? []));
      if ((page ?? []).length < pageSize) break;
    }

    // コーチアプリが保存した2026年度同学年順位から、公開許可済みの本人分だけを抽出。
    const rankings: Record<string, { found: true; gradeRank: number | null; prefRank: number | null; prefName: string }> = {};
    const { data: progressRow, error: progressError } = await sb.from("swimmer_ranking_share_cache")
      .select("progress").eq("job_key", "same_grade_2026").maybeSingle();
    if (progressError) console.warn("Ranking cache unavailable:", progressError.message);
    const cache = progressRow?.progress?.rankingCache;
    if (cache && typeof cache === "object" && !Array.isArray(cache)) {
      const prefix = `nationalRank|2026|${swimmer.id}|`;
      const validEvents = new Set(records.map((r) => `${r.stroke}|${Number(r.distance)}|${r.course}`));
      for (const [key, raw] of Object.entries(cache)) {
        if (!key.startsWith(prefix) || !raw || typeof raw !== "object") continue;
        const event = key.slice(prefix.length);
        if (!validEvents.has(event)) continue;
        const r = raw as Record<string, unknown>;
        if (r.found !== true) continue;
        const rank = Number(r.gradeRank ?? r.rank);
        const pref = Number(r.prefRank);
        const gradeRank = Number.isInteger(rank) && rank > 0 ? rank : null;
        const prefRank = Number.isInteger(pref) && pref > 0 ? pref : null;
        if (gradeRank === null && prefRank === null) continue;
        rankings[event] = { found: true, gradeRank, prefRank, prefName: String(r.prefName || "").slice(0, 30) };
      }
    }

    let joRanking: any[] = [];
    try {
      joRanking = await buildPublicJoRanking(sb);
    } catch (rankingError) {
      // Leaderboard failure must not take down the existing individual QR profile.
      console.warn("Public JO ranking unavailable:", rankingError);
    }

    return json({
      swimmer: { name: swimmer.name, age_group: swimmer.age_group, team: swimmer.team, gender: swimmer.gender },
      records: records.map((r) => ({
        stroke: r.stroke, distance: r.distance, course: r.course,
        time_seconds: r.time_seconds, meet_name: r.meet_name, record_date: r.record_date,
        laps: Array.isArray(r.laps) ? r.laps.map((l: any) => ({
          distance: l.distance, cumulative_time: l.cumulative_time, split_time: l.split_time,
        })) : [],
        is_personal_best: r.is_personal_best, is_jo_qualified: r.is_jo_qualified,
      })),
      rankings,
      joRanking,
      joRankingMeetDate: nextJoMeetDate(),
    });
  } catch (error) {
    console.error("Public profile error:", error);
    return json({ error: "Unable to load profile" }, 500);
  }
});
