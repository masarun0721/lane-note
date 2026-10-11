// LANE NOTE URL読み込み用の中継（Cloudflare Workers）
// 使い方: https://<worker>.workers.dev/?url=<読み込みたいPDFやWebページのURL>
const ALLOWED_ORIGINS = ["https://masarun0721.github.io"];
const MAX_BYTES = 20 * 1024 * 1024; // 20MB まで

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    const cors = {
      "Access-Control-Allow-Origin": allow,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "GET") return new Response("GET only", { status: 405, headers: cors });
    if (origin && !ALLOWED_ORIGINS.includes(origin)) return new Response("forbidden", { status: 403, headers: cors });

    const target = new URL(request.url).searchParams.get("url");
    let u;
    try { u = new URL(target); } catch { return new Response("bad url", { status: 400, headers: cors }); }
    if (u.protocol !== "https:" && u.protocol !== "http:") return new Response("bad scheme", { status: 400, headers: cors });
    const h = u.hostname;
    if (h === "localhost" || /^(\d+\.){3}\d+$/.test(h) || h.endsWith(".local") || h.includes(":")) {
      return new Response("blocked host", { status: 400, headers: cors });
    }

    const res = await fetch(u.toString(), { redirect: "follow", headers: { "User-Agent": "LANE-NOTE-fetch/1.0" } });
    const len = Number(res.headers.get("Content-Length") || 0);
    if (len > MAX_BYTES) return new Response("too large", { status: 413, headers: cors });
    const type = res.headers.get("Content-Type") || "application/octet-stream";
    if (!/pdf|html|text|octet-stream/i.test(type)) return new Response("unsupported type", { status: 415, headers: cors });

    return new Response(res.body, {
      status: res.status,
      headers: { ...cors, "Content-Type": type, "Cache-Control": "public, max-age=60" },
    });
  },
};
