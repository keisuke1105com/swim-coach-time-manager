// Authorization rollout: enforce approved roles.
import { requireAdmin, matchesActiveAthlete } from "../_shared/require-admin.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  // CORS
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
    let athleteId = "";
    let year = 2026;
    let waterwayCode = 1;

    // 種目・距離
    // 1 = 自由形
    // distanceCode はJASF側のコード
    let swimmingStyleCode = 1;
    let distanceCode = 2;

    // POSTで指定された値を使用
    if (req.method === "POST") {
      try {
        const body = await req.json();

        athleteId =
          body.athlete_id ||
          body.athleteId ||
          athleteId;

        year = Number(
          body.year ||
          year
        );

        waterwayCode = Number(
          body.waterway_code ||
          body.waterwayCode ||
          waterwayCode
        );

        swimmingStyleCode = Number(
          body.swimming_style_code ||
          body.swimmingStyleCode ||
          swimmingStyleCode
        );

        distanceCode = Number(
          body.distance_code ||
          body.distanceCode ||
          distanceCode
        );
      } catch {
        // bodyが無い場合は初期値を使用
      }
    }

    // GETの場合はURLパラメータも使用可能
    const requestUrl = new URL(req.url);

    if (requestUrl.searchParams.get("athlete_id")) {
      athleteId =
        requestUrl.searchParams.get("athlete_id")!;
    }

    if (requestUrl.searchParams.get("year")) {
      year = Number(
        requestUrl.searchParams.get("year")
      );
    }

    if (requestUrl.searchParams.get("waterway_code")) {
      waterwayCode = Number(
        requestUrl.searchParams.get("waterway_code")
      );
    }

    if (requestUrl.searchParams.get("swimming_style_code")) {
      swimmingStyleCode = Number(
        requestUrl.searchParams.get(
          "swimming_style_code"
        )
      );
    }

    if (requestUrl.searchParams.get("distance_code")) {
      distanceCode = Number(
        requestUrl.searchParams.get(
          "distance_code"
        )
      );
    }

    if(![1,2].includes(waterwayCode)||![1,2,3,4,5].includes(swimmingStyleCode)||![2,3,4,5,6,7].includes(distanceCode)||!await matchesActiveAthlete(authorization.client,String(athleteId)))
      return new Response(JSON.stringify({success:false,error:'Invalid or unregistered athlete query'}),{status:422,headers:corsHeaders});
    // JASF records API
    const apiUrl =
      `https://result.swim.or.jp/api/v1/athletes/${encodeURIComponent(
        athleteId
      )}/results/waterways/${waterwayCode}` +
      `/swimming_styles/${swimmingStyleCode}` +
      `/distances/${distanceCode}` +
      `/records?period_code=4`;

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
      },
    });

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = {
        raw: text,
      };
    }

    return new Response(
      JSON.stringify(
        {
          success: response.ok,

          athlete_id: athleteId,
          year,
          waterway_code: waterwayCode,
          swimming_style_code: swimmingStyleCode,
          distance_code: distanceCode,

          status: response.status,
          source_url: apiUrl,

          data,
        },
        null,
        2
      ),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json; charset=utf-8",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify(
        {
          success: false,
          error: String(error),
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
