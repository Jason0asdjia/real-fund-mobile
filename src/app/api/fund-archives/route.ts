import { NextRequest, NextResponse } from "next/server";

const ALLOWED_TYPES = new Set(["jjcc", "jbgk"]);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code")?.trim();
  const type = searchParams.get("type")?.trim();

  if (!code || !type || !ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const upstreamUrl = new URL("https://fundf10.eastmoney.com/FundArchivesDatas.aspx");
  upstreamUrl.searchParams.set("type", type);
  upstreamUrl.searchParams.set("code", code);
  if (type === "jjcc") {
    upstreamUrl.searchParams.set("topline", "10");
    upstreamUrl.searchParams.set("year", "");
    upstreamUrl.searchParams.set("month", "");
  }
  upstreamUrl.searchParams.set("_", `${Date.now()}`);

  const response = await fetch(upstreamUrl.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://fundf10.eastmoney.com/",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Upstream request failed" }, { status: 502 });
  }

  const text = await response.text();
  const contentMatch = text.match(/content\s*:\s*"([\s\S]*?)"\s*,\s*arryear/i);
  const escapedContent = contentMatch?.[1] || "";
  const content = escapedContent
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"');

  return NextResponse.json({ content });
}
