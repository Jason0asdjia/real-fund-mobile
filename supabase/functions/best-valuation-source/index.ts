// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

type SourceName = "fundgz" | "sina_ds2" | "sina_ds3" | "supabase_qdii";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const getTodayInShanghai = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: request.headers.get("Authorization") || "",
        },
      },
    });

    const { code, jzrq, actualZzl } = await request.json() as { code?: string; jzrq?: string; actualZzl?: number };
    const normalizedCode = String(code || "").trim();
    if (!normalizedCode) {
      return Response.json({ success: false, error: "missing code" }, { status: 400, headers: corsHeaders });
    }
    if (!jzrq || typeof jzrq !== "string") {
      return Response.json({ success: false, error: "missing jzrq" }, { status: 400, headers: corsHeaders });
    }
    if (!Number.isFinite(Number(actualZzl))) {
      return Response.json({ success: false, error: "invalid actualZzl" }, { status: 400, headers: corsHeaders });
    }

    const { data, error } = await supabase
      .from("fund_pingzhongdata")
      .select("source")
      .eq("fund_code", normalizedCode)
      .maybeSingle();

    if (error) {
      return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
    }

    const bestSourceMap: Record<SourceName, 1 | 2 | 3 | 4> = {
      fundgz: 1,
      sina_ds2: 2,
      sina_ds3: 3,
      supabase_qdii: 4,
    };

    const source = data?.source as SourceName | undefined;
    const bestSource = source ? bestSourceMap[source] : null;
    const today = getTodayInShanghai();
    const isTodayAccuracy = Boolean(bestSource) && jzrq === today;
    const isYesterdayAccuracy = Boolean(bestSource) && !isTodayAccuracy;

    return Response.json({
      success: true,
      data: {
        bestSource,
        isYesterdayAccuracy,
        isTodayAccuracy,
        diffs: bestSource ? { [String(bestSource)]: 0 } : {},
        actualZzl: Number(actualZzl),
        jzrq,
      },
    }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : "unknown error" }, { status: 500, headers: corsHeaders });
  }
});
