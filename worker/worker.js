// LANE NOTE URL読み込み用の中継（Cloudflare Workers）v0.26.25（公開サイトならどこでも・非公開の宛先は通さない）
// 使い方: https://<worker>.workers.dev/?url=<読み込みたいPDFやWebページのURL>
// v0.25（Astra 第3回監査 C308〜C311 の修正）
//  ・Origin は必須（LANE NOTE の公開アドレスだけ）。※Origin は偽装できるので、守りの本体は宛先の検査と回数制限
//  ・リダイレクトは自分でたどり（最大5回）、行き先ごとに同じ検査をする。末尾のドットは取り除いてから比べる
//  ・20MiB は実際に受け取った量で数え、超えたら上流と下流を止める。上流は20秒で打ち切る
//  ・応答は「取得専用」：application/octet-stream・attachment・nosniff・CSP sandbox・no-store。元の形式は X-Lane-Type で知らせる
//  ・回数制限：環境に Rate Limiting の束縛（LIMITER）があれば、IPごとに使う（wrangler.toml の例は下）
//      [[ratelimits]]
//      name = "LIMITER"
//      namespace_id = "1001"
//      simple = { limit = 30, period = 60 }
const ALLOWED_ORIGINS = ["https://masarun0721.github.io", "https://lane-note.web.app", "https://lane-note.firebaseapp.com"];
// v0.26.25：サイトの許可リストはやめ、公開されているサイトならどこでも取りに行く。ただし次は通さない
//  ・http/https 以外、80/443 以外のポート、URL に利用者名/パスワード
//  ・内部向けの名前（localhost・*.local・*.internal・*.lan・*.home.arpa・ドットのない名前）と、この中継自身
//  ・IP アドレスで書かれた非公開の宛先（127/8・10/8・172.16/12・192.168/16・169.254/16・100.64/10・0/8・224/4 以上・::1・fc00::/7・fe80::/10 など。IPv4 の 0x7f.1 などの書き方も URL の解釈でそろえてから調べる）
//  ※ 名前から非公開の IP に向くもの（DNS）は Workers からは調べられないが、Cloudflare Workers の fetch はそもそも非公開の宛先に届かない
const MAX_BYTES = 20 * 1024 * 1024; // 20MiB まで（実際の受信量）
const TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 5;
const RATE = { limit: 600, period: 60000 };   // LIMITER の束縛がないときの簡易な回数制限（IPごと・1分600回＝大会まとめ取り込みは通る。1つの実行環境の中だけで数える）

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

function privateV4(a) {
  const [x, y] = a;
  return x === 0 || x === 10 || x === 127 || (x === 100 && y >= 64 && y <= 127) || (x === 169 && y === 254) || (x === 172 && y >= 16 && y <= 31) ||
    (x === 192 && y === 168) || (x === 192 && y === 0) || (x === 198 && (y === 18 || y === 19)) || x >= 224;
}
export function blockedHost(host, self) {
  if (!host) return true;
  if (self && host === self) return true;
  if (/^\[.*\]$/.test(host)) {   // IPv6（URL の解釈で小文字・短い形になっている）
    const v = host.slice(1, -1);
    if (v === "::" || v === "::1") return true;
    if (/^(fc|fd)/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v)) return true;
    const m = v.match(/^::ffff:(?:([\d.]+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/);   // IPv4 を埋め込んだ形
    if (m) { const a = m[1] ? m[1].split(".").map(Number) : [parseInt(m[2], 16) >> 8, parseInt(m[2], 16) & 255]; return privateV4(a); }
    if (/^64:ff9b:/.test(v) || /^2002:/.test(v)) return true;   // 変換用の範囲は使わせない
    return false;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return privateV4(host.split(".").map(Number));
  if (!host.includes(".")) return true;
  if (/(^|\.)(localhost|local|internal|lan|intranet|corp|home|home\.arpa|localdomain)$/.test(host)) return true;
  if (/^metadata\./.test(host)) return true;
  return false;
}
export function checkTarget(raw, self) {
  let u;
  try { u = new URL(raw); } catch { return { err: "bad url" }; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { err: "bad scheme" };
  if (u.username || u.password) return { err: "blocked host" };
  if (u.port && !["80", "443"].includes(u.port)) return { err: "blocked host" };
  const host = u.hostname.toLowerCase().replace(/\.+$/, "");
  if (blockedHost(host, self)) return { err: "blocked host" };
  u.hostname = host;
  return { url: u };
}
const hits = new Map();
function rateOk(ip, now) {
  const r = hits.get(ip);
  if (!r || now - r.t > RATE.period) { hits.set(ip, { t: now, n: 1 }); if (hits.size > 5000) hits.clear(); return true; }
  r.n++; return r.n <= RATE.limit;
}
export function _resetRate() { hits.clear(); }
const TYPE_OK = /^(application\/pdf|application\/x-pdf|text\/html|application\/xhtml\+xml|text\/plain)\b/i;
const TYPE_MAYBE_PDF = /^(application\/octet-stream|binary\/octet-stream|application\/download|application\/force-download)\b/i;   // 中身が %PDF のときだけ通す

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const okOrigin = ALLOWED_ORIGINS.includes(origin);
    const h = baseHeaders(okOrigin ? origin : ALLOWED_ORIGINS[0]);
    if (request.method === "OPTIONS") return new Response(null, { status: okOrigin ? 204 : 403, headers: h });
    if (request.method !== "GET") return txt("GET only", 405, h);
    // v0.26.9 非常停止：Cloudflare の環境変数 RELAY_OFF を "1" にすると、中継を止める（コードの再デプロイなしで切りかえられる）
    if (env && env.RELAY_OFF === "1") return txt("paused", 503, h);
    if (!okOrigin) return txt("forbidden", 403, h);
    // v0.25.2：環境変数 REQUIRE_LIMITER="1" のときは、LIMITER の設定がなければ 503（費用の上限を必須にする）
    if (env && env.REQUIRE_LIMITER === "1" && !(env.LIMITER && env.LIMITER.limit)) return txt("limiter not configured", 503, h);
    if (env && env.LIMITER && env.LIMITER.limit) {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      try { const r = await env.LIMITER.limit({ key: ip }); if (!r || !r.success) return txt("too many requests", 429, h); } catch { return txt("limiter unavailable", 503, h); }   // v0.25.2：制限の仕組みが故障したら通さない
    } else if (!rateOk(request.headers.get("CF-Connecting-IP") || "unknown", Date.now())) return txt("too many requests", 429, h);   // v0.26.25：束縛がなくても簡易に数える
    const self = new URL(request.url).hostname.toLowerCase();
    let t = checkTarget(new URL(request.url).searchParams.get("url") || "", self);
    if (t.err) return txt(t.err, 400, h);

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    let res, url = t.url;
    try {
      for (let hop = 0; ; hop++) {
        // Cookie・Authorization などは付けない（利用者の情報は上流に渡さない）
        res = await fetch(url.toString(), { redirect: "manual", signal: ctl.signal, headers: { "User-Agent": "LANE-NOTE-fetch/1.2", "Accept": "application/pdf,text/html,text/plain;q=0.9,*/*;q=0.1" } });
        if (res.status >= 300 && res.status < 400 && res.headers.get("Location")) {
          try { await res.body?.cancel(); } catch {}
          if (hop >= MAX_REDIRECTS) { clearTimeout(timer); return txt("too many redirects", 400, h); }
          t = checkTarget(new URL(res.headers.get("Location"), url).toString(), self);
          if (t.err) { clearTimeout(timer); return txt(t.err, 400, h); }
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
    let first = null, src = res.body;
    if (!TYPE_OK.test(type)) {
      if (!TYPE_MAYBE_PDF.test(type) || !src) { cancel(); clearTimeout(timer); return txt("unsupported type", 415, h); }
      // 種類が書かれていないファイル：先頭が %PDF のときだけ PDF として通す
      const rd = src.getReader(); let head = new Uint8Array(0);
      try { while (head.length < 5) { const c = await rd.read(); if (c.done) break; const n = new Uint8Array(head.length + c.value.length); n.set(head); n.set(c.value, head.length); head = n; } } catch { clearTimeout(timer); return txt("upstream error", 502, h); }
      if (String.fromCharCode(...head.slice(0, 5)) !== "%PDF-") { try { rd.cancel(); } catch {} clearTimeout(timer); return txt("unsupported type", 415, h); }
      first = head;
      src = new ReadableStream({ start(c) { c.enqueue(head); }, async pull(c) { try { const r = await rd.read(); if (r.done) c.close(); else c.enqueue(r.value); } catch (e) { c.error(e); } }, cancel() { try { rd.cancel(); } catch {} } });
    }
    const outType = first ? "application/pdf" : type;

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
    const body = src ? src.pipeThrough(counter) : null;
    return new Response(body, {
      status: 200,
      headers: { ...h, "Content-Type": "application/octet-stream", "Content-Disposition": "attachment", "X-Lane-Type": outType, "X-Lane-Url": url.toString().slice(0, 2000) },
    });
  },
};
