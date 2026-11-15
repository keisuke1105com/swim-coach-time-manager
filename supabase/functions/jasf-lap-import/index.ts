// Authorization rollout: enforce approved roles.
import { requireAdmin, matchesActiveAthlete } from "../_shared/require-admin.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if(req.method!=='POST')return new Response(JSON.stringify({success:false,error:'POST only'}),{status:405,headers:corsHeaders});
  const authorization=await requireAdmin(req);
  if(authorization instanceof Response)return authorization;
  try {
    const body = await req.json().catch(() => ({}));

    const swimmerId = String(body.swimmer_id || "");
    const athleteId = String(body.athlete_id || "");
    const resultId = String(body.result_id || "");

    const stroke = String(body.stroke || "");
    const distance = Number(body.distance || 0);
    const course = String(body.course || "");

    const recordDate = String(body.record_date || "");
    const timeSeconds = Number(body.time_seconds || 0);
    const meetName = String(body.meet_name || "");

    // JASFコード
    const waterwayCode =
      Number(body.waterway_code) ||
      (course === "短水路" ? 2 : 1);

    const swimmingStyleCode =
      Number(body.swimming_style_code) ||
      strokeToCode(stroke);

    const distanceCode =
      Number(body.distance_code) ||
      distanceToCode(distance);

    const raceDivisionCode =
      Number(body.race_division_code ?? body.division_code ?? 0);

    if (!swimmerId) {
      throw new Error("swimmer_id がありません");
    }

    if (!athleteId) {
      throw new Error("athlete_id がありません");
    }

    if (!resultId) {
      throw new Error("result_id がありません");
    }

    if (!stroke) {
      throw new Error("stroke がありません");
    }

    if (!distance) {
      throw new Error("distance がありません");
    }

    if (!course) {
      throw new Error("course がありません");
    }

    if (!swimmingStyleCode) {
      throw new Error(`種目コードを判定できません: ${stroke}`);
    }

    if (!distanceCode) {
      throw new Error(`距離コードを判定できません: ${distance}`);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    if(!await matchesActiveAthlete(authorization.client,athleteId,swimmerId)||swimmingStyleCode!==strokeToCode(stroke)||distanceCode!==distanceToCode(distance)||waterwayCode!==(course==='短水路'?2:1)||!['短水路','長水路'].includes(course))
      return new Response(JSON.stringify({success:false,error:'Swimmer and official query do not match'}),{status:422,headers:corsHeaders});
    // ==========================================
    // Results of Japan comparing API
    // ==========================================

    const comparingUrl =
      `https://result.swim.or.jp/api/v1/athletes/${encodeURIComponent(
        athleteId
      )}/histories/waterways/${waterwayCode}` +
      `/swimming_styles/${swimmingStyleCode}` +
      `/distances/${distanceCode}` +
      `/race_divisions/${raceDivisionCode}` +
      `/comparing?result_ids[]=${encodeURIComponent(resultId)}`;

    console.log("JASF comparing URL:", comparingUrl);

    const response = await fetch(comparingUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!response.ok) {
      throw new Error(
        `JASF comparing API error: ${response.status}`
      );
    }

    const comparingData = await response.json();

    console.log(
      "JASF comparing response:",
      JSON.stringify(comparingData)
    );

    const selected = Array.isArray(comparingData?.selected)
      ? comparingData.selected
      : [];

    const officialResult = selected.find(
      (row: any) =>
        String(row?.result_id || "") === resultId
    );

    if (!officialResult) {
      throw new Error(
        `comparing APIにresult_id=${resultId}がありません`
      );
    }

    // ==========================================
    // base_on_50 → アプリ用 laps
    // ==========================================

    const baseOn50 =
      Array.isArray(officialResult?.data?.base_on_50)
        ? officialResult.data.base_on_50
        : [];

    const laps = baseOn50
      .map((lap: any, index: number) => ({
        distance: (index + 1) * 50,
        split_time: String(lap?.lap_time || ""),
        cumulative_time: String(lap?.passing_time || ""),
      }))
      .filter(
        (lap: any) =>
          lap.distance > 0 &&
          lap.split_time
      );

    if (!laps.length) {
      return jsonResponse({
        success: true,
        skipped: true,
        reason: "公式結果に50mラップデータがありません",
        athlete_id: athleteId,
        result_id: resultId,
      });
    }

    const officialResultTime =
      String(officialResult?.result_time || "");

    const officialSeconds =
      timeToSeconds(officialResultTime);

    if(officialSeconds===null||!Number.isFinite(officialSeconds)||officialSeconds<=0)throw new Error('Official result time unavailable');
    const finalTimeSeconds = officialSeconds;

    const finalRecordDate =
      String(
        officialResult?.result_date ||
        recordDate
      );

    const finalMeetName =
      String(
        officialResult?.game_short_name ||
        officialResult?.game_name ||
        meetName ||
        "日本水泳連盟公式記録"
      );

    // ==========================================
    // DBの既存公式記録を検索
    // ==========================================

    let existing: any[] | null = null;

    const { data: resultIdRows, error: resultIdError } =
      await supabase
        .from("swim_records")
        .select("*")
        .eq("swimmer_id", swimmerId)
        .ilike(
          "memo",
          `%result_id:${resultId}%`
        )
        .limit(1);

    if (resultIdError) throw resultIdError;

    existing = resultIdRows;

    // result_idで見つからない場合
    if (!existing || existing.length === 0) {
      let query = supabase
        .from("swim_records")
        .select("*")
        .eq("swimmer_id", swimmerId)
        .eq("stroke", stroke)
        .eq("distance", distance)
        .eq("course", course);

      if (finalRecordDate) {
        query = query.eq(
          "record_date",
          finalRecordDate
        );
      }

      if (finalTimeSeconds) {
        query = query.eq(
          "time_seconds",
          finalTimeSeconds
        );
      }

      const {
        data: fallbackRows,
        error: fallbackError,
      } = await query.limit(1);

      if (fallbackError) throw fallbackError;

      existing = fallbackRows;
    }

    // ==========================================
    // 既存記録を更新
    // ==========================================

    let dbResult;

    if (existing && existing.length > 0) {
      const oldMemo =
        String(existing[0]?.memo || "");

      const updatePayload: any = {
        laps,
        source: "jasf",
        jasf_athlete_id: athleteId,
        jasf_synced_at: new Date().toISOString(),
      };

      if (
        resultId &&
        !oldMemo.includes(`result_id:${resultId}`)
      ) {
        updatePayload.memo = oldMemo
          ? `${oldMemo} / result_id:${resultId}`
          : `日本水泳連盟 ID:${athleteId} / result_id:${resultId}`;
      }

      const { data: updated, error } =
        await supabase
          .from("swim_records")
          .update(updatePayload)
          .eq("id", existing[0].id)
          .select();

      if (error) throw error;

      dbResult = {
        action: "updated",
        record: updated,
      };
    }

    // ==========================================
    // 記録が無ければ新規登録
    // ==========================================

    else {
      const insertPayload: any = {
        swimmer_id: swimmerId,
        stroke,
        distance,
        course,
        time_seconds: finalTimeSeconds,
        meet_name: finalMeetName,
        record_date: finalRecordDate,
        source: "jasf",
        jasf_athlete_id: athleteId,
        jasf_synced_at: new Date().toISOString(),
        laps,
        memo:
          `日本水泳連盟 ID:${athleteId} / result_id:${resultId}`,
      };

      const { data: inserted, error } =
        await supabase
          .from("swim_records")
          .insert(insertPayload)
          .select();

      if (error) throw error;

      dbResult = {
        action: "inserted",
        record: inserted,
      };
    }

    return jsonResponse({
      success: true,

      athlete_id: athleteId,
      result_id: resultId,

      stroke,
      distance,
      course,

      record_date: finalRecordDate,
      meet_name: finalMeetName,

      time: officialResultTime,
      time_seconds: finalTimeSeconds,

      lap_count: laps.length,
      laps,

      result: dbResult,

      source_url: comparingUrl,
    });

  } catch (error) {
    console.error(
      "jasf-lap-import error:",
      error
    );

    return new Response(
      JSON.stringify(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : (error as any)?.message || String(error),
        },
        null,
        2
      ),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json; charset=utf-8",
        },
      }
    );
  }
});


// ==========================================
// JSONレスポンス
// ==========================================

function jsonResponse(data: any) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json; charset=utf-8",
      },
    }
  );
}


// ==========================================
// 種目 → JASFコード
// ==========================================

function strokeToCode(stroke: string): number {
  const s = String(stroke || "").trim();

  if (s === "自由形") return 1;
  if (s === "背泳ぎ") return 2;
  if (s === "平泳ぎ") return 3;
  if (s === "バタフライ") return 4;
  if (s === "個人メドレー") return 5;

  return 0;
}


// ==========================================
// 距離 → JASFコード
// ==========================================

function distanceToCode(distance: number): number {
  const map: Record<number, number> = {
    50: 2,
    100: 3,
    200: 4,
    400: 5,
    800: 6,
    1500: 7,
  };

  return map[Number(distance)] || 0;
}


// ==========================================
// 時間 → 秒
// ==========================================

function timeToSeconds(
  value: unknown
): number | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text = String(value).trim();

  if (!text) return null;

  const parts = text.split(":");

  if (parts.length === 1) {
    const seconds = Number(parts[0]);

    return Number.isFinite(seconds)
      ? seconds
      : null;
  }

  if (parts.length === 2) {
    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);

    if (
      !Number.isFinite(minutes) ||
      !Number.isFinite(seconds)
    ) {
      return null;
    }

    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    const seconds = Number(parts[2]);

    if (
      !Number.isFinite(hours) ||
      !Number.isFinite(minutes) ||
      !Number.isFinite(seconds)
    ) {
      return null;
    }

    return (
      hours * 3600 +
      minutes * 60 +
      seconds
    );
  }

  return null;
}
