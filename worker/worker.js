// LANE NOTE URL読み込み用の中継（Cloudflare Workers）v0.25
// 使い方: https://<worker>.workers.dev/?url=<読み込みたいPDFやWebページのURL>
// v0.25（Astra 第3回監査 C308〜C311 の修正）
//  ・取りに行けるのは ALLOWED_HOSTS のサイトだけ（https・標準ポート・URLに利用者名/パスワードなし）。汎用の中継として使えない
//  ・Origin は必須（LANE NOTE の公開アドレスだけ）。※Origin は偽装できるので、守りの本体は許可リストと回数制限
//  ・リダイレクトは自分でたどり（最大3回）、行き先ごとに同じ検査をする。末尾のドットは取り除いてから比べる
//  ・20MiB は実際に受け取った量で数え、超えたら上流と下流を止める。上流は20秒で打ち切る
//  ・応答は「取得専用」：application/octet-stream・attachment・nosniff・CSP sandbox・no-store。元の形式は X-Lane-Type で知らせる
//  ・回数制限：環境に Rate Limiting の束縛（LIMITER）があれば、IPごとに使う（wrangler.toml の例は下）
//      [[ratelimits]]
//      name = "LIMITER"
//      namespace_id = "1001"
//      simple = { limit = 30, period = 60 }
const ALLOWED_ORIGINS = ["https://masarun0721.github.io"];
// 取りに行ってよいサイト（完全一致）。増やすときはここに足して再デプロイする
const ALLOWED_HOSTS = ["gold.jaic.org"];
const MAX_BYTES = 20 * 1024 * 1024; // 20MiB まで（実際の受信量）
const TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 3;

function baseHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Expose-Headers": "X-Lane-Type, X-Lane-Url",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Referrer-Policy": "no-referrer",
  };
}
function txt(body, status, h) { return new Response(body, { status, headers: { ...h, "Content-Type": "text/plain; charset=utf-8" } }); }

export function checkTarget(raw) {
  let u;
  try { u = new URL(raw); } catch { return { err: "bad url" }; }
  if (u.protocol !== "https:") return { err: "bad scheme" };
  if (u.username || u.password) return { err: "blocked host" };
  if (u.port && u.port !== "443") return { err: "blocked host" };
  const host = u.hostname.toLowerCase().replace(/\.+$/, "");
  if (!ALLOWED_HOSTS.includes(host)) return { err: "host not allowed" };
  u.hostname = host;
  return { url: u };
}
const TYPE_OK = /^(application\/pdf|text\/html|application\/xhtml\+xml|text\/plain|application\/octet-stream)\b/i;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const okOrigin = ALLOWED_ORIGINS.includes(origin);
    const h = baseHeaders(okOrigin ? origin : ALLOWED_ORIGINS[0]);
    if (request.method === "OPTIONS") return new Response(null, { status: okOrigin ? 204 : 403, headers: h });
    if (request.method !== "GET") return txt("GET only", 405, h);
    if (!okOrigin) return txt("forbidden", 403, h);
    // v0.25.2：環境変数 REQUIRE_LIMITER="1" のときは、LIMITER の設定がなければ 503（費用の上限を必須にする）
    if (env && env.REQUIRE_LIMITER === "1" && !(env.LIMITER && env.LIMITER.limit)) return txt("limiter not configured", 503, h);
    if (env && env.LIMITER && env.LIMITER.limit) {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      try { const r = await env.LIMITER.limit({ key: ip }); if (!r || !r.success) return txt("too many requests", 429, h); } catch { return txt("limiter unavailable", 503, h); }   // v0.25.2：制限の仕組みが故障したら通さない
    }
    let t = checkTarget(new URL(request.url).searchParams.get("url") || "");
    if (t.err) return txt(t.err, t.err === "host not allowed" ? 403 : 400, h);

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    let res, url = t.url;
    try {
      for (let hop = 0; ; hop++) {
        res = await fetch(url.toString(), { redirect: "manual", signal: ctl.signal, headers: { "User-Agent": "LANE-NOTE-fetch/1.1" } });
        if (res.status >= 300 && res.status < 400 && res.headers.get("Location")) {
          try { await res.body?.cancel(); } catch {}
          if (hop >= MAX_REDIRECTS) { clearTimeout(timer); return txt("too many redirects", 400, h); }
          t = checkTarget(new URL(res.headers.get("Location"), url).toString());
          if (t.err) { clearTimeout(timer); return txt(t.err, t.err === "host not allowed" ? 403 : 400, h); }
          url = t.url; continue;
        }
        break;
      }
    } catch (e) { clearTimeout(timer); return txt("upstream error", 502, h); }

    const cancel = () => { try { res.body?.cancel(); } catch {} };
    if (!res.ok) { cancel(); clearTimeout(timer); return txt("upstream " + res.status, res.status === 404 || res.status === 410 ? 404 : res.status === 401 || res.status === 403 ? 403 : 502, h); }
    const len = Number(res.headers.get("Content-Length") || 0);
    if (len > MAX_BYTES) { cancel(); clearTimeout(timer); return txt("too large", 413, h); }
    const type = (res.headers.get("Content-Type") || "application/octet-stream").slice(0, 200);
    if (!TYPE_OK.test(type)) { cancel(); clearTimeout(timer); return txt("unsupported type", 415, h); }

    // 実際の受信量で数える（20MiB を超えたら上流・下流とも止める）。ステータスは送り始めたあとは変えられないので、途中で切れたらアプリが「大きすぎる」と出す
    let got = 0;
    const counter = new TransformStream({
      transform(chunk, c) {
        got += chunk.byteLength;
        if (got > MAX_BYTES) { clearTimeout(timer); ctl.abort(); c.error(new Error("too large")); return; }
        c.enqueue(chunk);
      },
      flush() { clearTimeout(timer); },
    });
    const body = res.body ? res.body.pipeThrough(counter) : null;
    return new Response(body, {
      status: 200,
      headers: { ...h, "Content-Type": "application/octet-stream", "Content-Disposition": "attachment", "X-Lane-Type": type, "X-Lane-Url": url.toString().slice(0, 2000) },
    });
  },
};
