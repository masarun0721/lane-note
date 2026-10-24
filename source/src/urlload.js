/* v0.20 URLから読み込む（大会準備・記録・照合で共通）
   ・ブラウザから直接ほかのサイトのファイルは取れない（CORS）ので、LANE NOTE の Cloudflare 中継（worker/worker.js）を通して取る。
   ・中継はURLと取ってきた中身をそのまま返すだけで、保存しない。取ってきたものは「ファイルを入れたとき」と同じ処理に File として渡す。
   ・Webページの中に PDF や別ページへのリンクがたくさんあるとき（大会のページなど）は、一覧を出して選んでもらう。 */
(function (root) {
  'use strict';
  // v0.28.3 中継（Cloudflare Worker）のアドレス：ここだけで決める。名前を変えるときはここと README を直す
  // v0.29.2 新しい中継（個人名の入らないアドレス）ができたら、PROXY_NEW に入れる（Cloudflare で作った新しい中継のアドレス）。空のあいだは今の中継を使う
  var PROXY_NEW = 'https://lane-note-fetch.lanenote-info.workers.dev/';   // v0.29.8 新しい中継（前の個人名入りのアドレスはもう使わない）
  var PROXY = PROXY_NEW;
  var MAX = 20 * 1048576;
  var MSG = {
    bad: 'URLの形が正しくありません（https:// から始まるアドレスを入れてください）',
    net: '読み込めませんでした。URLが正しいか、インターネットにつながっているかを確かめてください',
    notfound: '読み込めませんでした（ページが見つかりません。URLが正しいか確かめてください）',
    big: '大きすぎるので読み込めませんでした（20MBまで）。PDFをダウンロードして、枠に入れてください',
    type: '対応していない形式です（読み込めるのはPDFとWebページだけです）',
    login: 'ログインが必要なページのようです。そのページを開いてPDFをダウンロードし、枠に入れてください',
    blocked: 'このアドレスは読み込めません（公開されていない宛先・使えない形式のアドレスです）',
    host: 'このサイトは今の中継では読み込めません（中継の更新が必要です）。ページを開いてPDFを保存し、枠に入れてください',
    many: '短い時間に何度も読み込んだので、少し待ってからもう一度ためしてください',
    paused: 'いまは管理者が「URLから読み込む」を一時停止しています。PDFをダウンロードして、枠に入れてください'
  };
  function isUrlOnly(t) { return /^\s*https?:\/\/\S+\s*$/i.test(String(t || '')); }
  function normUrl(s) {
    s = String(s || '').trim(); if (!s) return null;
    if (!/^https?:\/\//i.test(s) && /^[\w-]+(\.[\w-]+)+(\/|$)/.test(s)) s = 'https://' + s;
    try { var u = new URL(s); return /^https?:$/.test(u.protocol) ? u.href : null; } catch (e) { return null; }
  }
  async function readCapped(res, max) {
    if (!res.body || !res.body.getReader) { var b = new Uint8Array(await res.arrayBuffer()); if (b.length > max) throw err('big'); return b; }
    var rd = res.body.getReader(), parts = [], n = 0;
    for (;;) {
      var r = await rd.read(); if (r.done) break;
      n += r.value.byteLength; if (n > max) { try { rd.cancel(); } catch (e) { } throw err('big'); }
      parts.push(r.value);
    }
    var out = new Uint8Array(n), o = 0; parts.forEach(function (p) { out.set(p, o); o += p.byteLength; }); return out;
  }
  function err(code) { var e = new Error(MSG[code] || code); e.code = code; return e; }
  function sniff(bytes, type) {
    var h = ''; for (var i = 0; i < Math.min(bytes.length, 1024); i++) h += String.fromCharCode(bytes[i]);
    if (/^\s*%PDF-/.test(h.slice(0, 16)) || h.indexOf('%PDF-') >= 0 && h.indexOf('%PDF-') < 1024) return 'pdf';
    if (/<(!doctype html|html|head|body|table|meta|title|!--)/i.test(h)) return 'html';
    if (/pdf/i.test(type)) return 'pdf';
    if (/html/i.test(type)) return 'html';
    if (/^text\//i.test(type)) return 'text';
    return 'other';
  }
  function decodeHtml(bytes, type) {
    var head = ''; for (var i = 0; i < Math.min(bytes.length, 4096); i++) head += String.fromCharCode(bytes[i]);
    var cs = (String(type || '').match(/charset\s*=\s*["']?([\w-]+)/i) || head.match(/charset\s*=\s*["']?([\w-]+)/i) || [])[1] || 'utf-8';
    if (/shift_jis|sjis|x-sjis|windows-31j|cp932/i.test(cs)) cs = 'shift_jis';
    var t; try { t = new TextDecoder(cs).decode(bytes); } catch (e) { t = new TextDecoder('utf-8').decode(bytes); }
    // v0.26.23（東京私学陸上情報の PC 用結果）：中身は UTF-8 なのに <meta charset=Shift_JIS> のままのページがある。正しい UTF-8 として読めるなら UTF-8 を使う
    if (cs === 'shift_jis') { try { t = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { } }
    if ((t.match(/\ufffd/g) || []).length > 20 && cs !== 'shift_jis') { try { t = new TextDecoder('shift_jis').decode(bytes); } catch (e) { } }
    return t;
  }
  function looksLogin(html) { return /<input[^>]+type\s*=\s*["']?password/i.test(html) || /<title>[^<]*(ログイン|サインイン|log\s*in|sign\s*in)[^<]*<\/title>/i.test(html); }
  function fileName(url, kind) {
    var n = ''; try { var u = new URL(url); n = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || u.hostname); } catch (e) { n = 'download'; }
    n = n.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
    if (kind === 'pdf' && !/\.pdf$/i.test(n)) n += '.pdf';
    if (kind === 'html' && !/\.html?$/i.test(n)) n += '.html';
    return n;
  }
  // 中継を通して1つのURLを取る → { url, kind:'pdf'|'html', bytes, type, name, html? }
  async function fetchUrl(url, opt) {
    opt = opt || {};
    var u = normUrl(url); if (!u) throw err('bad');
    // v0.26.43（監査 C603）：最初が https なら「https 必須」を、HTML の転送（meta refresh・location.href）の先まで持ち回る。取りに行く前に止める
    var httpsOnly = !!opt.httpsOnly || /^https:/i.test(u);
    if (opt.httpsOnly && !/^https:/i.test(u)) throw err('blocked');
    var res;
    try { res = await (opt.fetch || root.fetch).call(root, PROXY + '?url=' + encodeURIComponent(u), { method: 'GET', credentials: 'omit', signal: opt.signal }); }
    catch (e) { if (e && e.name === 'AbortError') throw e; throw err('net'); }
    if (res.status === 413) throw err('big');
    if (res.status === 415) throw err('type');
    if (res.status === 401 || res.status === 407) throw err('login');
    if (res.status === 429) throw err('many');
    if (res.status === 503) { var t5 = await safeText(res); throw err(/paused/.test(t5) ? 'paused' : 'net'); }
    if (res.status === 403) { var t3 = await safeText(res); throw err(/host not allowed/.test(t3) ? 'host' : /forbidden/.test(t3) ? 'net' : 'login'); }
    if (res.status === 404 || res.status === 410) throw err('notfound');
    if (res.status === 400) { var bt = await safeText(res); throw err(/blocked/.test(bt) ? 'blocked' : 'bad'); }
    if (!res.ok) throw err('net');
    var len = +(res.headers.get('Content-Length') || 0); if (len > MAX) throw err('big');
    // v0.25（監査 C310）：全部受け取ってからではなく、受け取りながら数えて 20MiB を超えたら止める
    var buf; try { buf = await readCapped(res, MAX); } catch (e) { if (e && e.name === 'AbortError') throw e; throw err(e && e.code === 'big' ? 'big' : 'net'); }
    var type = res.headers.get('X-Lane-Type') || res.headers.get('Content-Type') || '', kind = sniff(buf, type);
    if (kind === 'text') kind = 'html';
    if (kind !== 'pdf' && kind !== 'html') throw err('type');
    // v0.26.39（監査 C509）：中継が HTTP の転送（302 など）についていったときは、X-Lane-Url に実際に読んだ先が入る。
    //   それを url に入れて出典として出す（頼んだURLは from）。https から http への転送は受け取らない
    var fin = u, xl = res.headers.get('X-Lane-Url');
    if (xl) { var fu = normUrl(xl); if (!fu) throw err('bad'); if (httpsOnly && !/^https:/i.test(fu)) throw err('blocked'); fin = fu; }
    var out = { url: fin, from: u, redirected: fin !== u, kind: kind, bytes: buf, type: type, name: fileName(fin, kind) };
    if (kind === 'html') {
      out.html = decodeHtml(buf, type);
      if (looksLogin(out.html)) throw err('login');
      var t = (out.html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]; out.title = t ? t.trim() : '';
      // 転送だけのページ（meta refresh・location.href=）は1回だけついていく
      var rd = out.html.length < 4000 && (out.html.match(/http-equiv\s*=\s*["']?refresh["']?[^>]*url\s*=\s*['"]?([^"'>\s]+)/i) || out.html.match(/location\.href\s*=\s*["']([^"']+)["']/i));
      if (rd && !opt.noRedirect) {
        var nx = ''; try { nx = new URL(rd[1], fin).href; } catch (e) { }
        if (nx && (httpsOnly || /^https:/i.test(fin)) && !/^https:/i.test(nx)) throw err('blocked');   // C603：http へ下がる転送は、取りに行かずに止める（握りつぶさない）
        if (nx) { try { return await fetchUrl(nx, Object.assign({}, opt, { noRedirect: true, httpsOnly: httpsOnly || /^https:/i.test(fin) })); } catch (e) { if (e && (e.name === 'AbortError' || e.code === 'blocked')) throw e; } }
      }
    }
    return out;
  }
  async function safeText(res) { try { return await res.text(); } catch (e) { return ''; } }
  function toFile(r) {
    var type = r.kind === 'pdf' ? 'application/pdf' : 'text/html';
    try { var f = new File([r.bytes], r.name, { type: type }); try { f.srcUrl = r.url || ''; } catch (e) { } return f; }   // v0.26.33 どのURLから取ったか（大会準備の保存に使う）
    catch (e) { var b = new Blob([r.bytes], { type: type }); b.name = r.name; b.lastModified = Date.now(); return b; }
  }
  // Webページの中のリンク（PDFと、同じサイトの別ページ）を集める。相対URLは解決する
  function findLinks(html, base) {
    var doc = new DOMParser().parseFromString(html, 'text/html'), seen = {}, out = [], bu, ctx = linkContext(doc);
    try { bu = new URL(base); } catch (e) { return out; }
    var b = doc.querySelector('base[href]'); var baseHref = base; if (b) { try { baseHref = new URL(b.getAttribute('href'), base).href; } catch (e) { } }
    Array.prototype.forEach.call(doc.querySelectorAll('a[href], area[href], frame[src], iframe[src]'), function (a) {
      var raw = a.getAttribute('href') || a.getAttribute('src') || ''; if (!raw || /^\s*(#|javascript:|mailto:|tel:)/i.test(raw)) return;
      var u; try { u = new URL(raw.trim(), baseHref); } catch (e) { return; }
      if (!/^https?:$/.test(u.protocol)) return;
      u.hash = ''; var href = u.href; if (href === bu.href.replace(/#.*$/, '')) return;
      if (seen[href]) { seen[href].n++; return; }
      var isPdf = /\.pdf$/i.test(u.pathname);
      var isPage = !isPdf && u.host === bu.host && /(\/|\.s?html?|\.php|\.aspx?|\/[^.\/]+)$/i.test(u.pathname) && !/\.(css|js|png|jpe?g|gif|svg|ico|zip|xlsx?|docx?|csv|txt|mp4)$/i.test(u.pathname);
      if (!isPdf && !isPage) return;
      var label = nk(a.textContent || a.getAttribute('title') || '');
      // 「1」「1組 13:19」のように短いリンク名は、前にある見出し（種目）とラウンドの行を付けて読めるようにする
      var cx = ctx.get(a); if (cx && (label.length <= 8 || /^[\d\s:組]+$/.test(label))) label = [cx.head, cx.line, label.replace(/\s*\d{1,2}:\d{2}\s*/g, ' ').trim()].filter(Boolean).join(' ');
      // 表の中のリンクは、行の見出し（左のセル）も付けておくと何のリンクか分かりやすい
      var tr = a.closest && a.closest('tr'); var rowh = '';
      if (tr) { var c0 = tr.querySelector('th,td'); if (c0 && !c0.contains(a)) rowh = c0.textContent.replace(/\s+/g, ' ').trim().slice(0, 40); }
      var item = { url: href, kind: isPdf ? 'pdf' : 'page', n: 1, label: (rowh && rowh !== label && label.indexOf(rowh) < 0 ? rowh + '　' : '') + (label || decodeURIComponent(u.pathname.split('/').pop() || href)) };
      seen[href] = item; out.push(item);
    });
    out.forEach(function (x) { if (x.n > 1) x.label += ' など' + x.n + '件の一覧'; });
    return out.slice(0, 500);
  }
  function nk(t) { return String(t || '').normalize('NFKC').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); }
  // リンクごとの文脈：直前の見出し（<a name>・h1〜h4）と、直前のリンクでない文字の行
  function linkContext(doc) {
    var m = new Map(), head = '', line = '', body = doc.body || doc.documentElement; if (!body) return m;
    var tw = doc.createTreeWalker(body, 5 /* ELEMENT|TEXT */), n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 1) {
        var tg = n.tagName;
        if ((tg === 'A' && n.hasAttribute('name') && !n.hasAttribute('href')) || /^H[1-4]$/.test(tg)) { var h = nk(n.textContent); if (h && h.length < 60) { head = h; line = ''; } }
        else if (tg === 'A' && n.hasAttribute('href')) m.set(n, { head: head, line: line });
      } else {
        var p = n.parentNode; if (p && p.closest && (p.closest('a') || p.closest('script,style'))) continue;
        var t = nk(n.textContent); if (!t || /^[(（]?全\s*\d+組[)）]?$|^結果$/.test(t)) continue;
        line = t.replace(/\s*\d{1,2}月\d{1,2}日.*$/, '').trim().slice(0, 30);
      }
    }
    return m;
  }

  /* v0.20.2：大会の速報ページ（gold.jaic.org 型：kyougi.html → kyougi1..N.html → rel001.html…）を、同じフォルダの中だけたどって結果のページを全部集める。
     ・一覧のページ（kyougi*.html）はたどるだけ、結果のページ（rel*.html）は取り込む。コンディション・競技者一覧・開始時刻順などは飛ばす。
     ・行儀よく：同時に2つまで・1件ごとに少し待つ・合計 max 件まで。途中でやめられる（signal）。 */
  var GOLD_IDX = /\/kyougi\d*\.html?$/i, GOLD_RES = /\/rel\d+\.html?$/i;
  var SKIP_URL = /\/(cond|master|tt|index|record|kiroku)\w*\.html?$/i, SKIP_LAB = /コンディション|競技者一覧|開始時刻|気象|トップ|top|戻る|大会記録/i;
  function isMeetPage(page, links) {
    if (!page || page.kind !== 'html') return false;
    var n = links.filter(function (l) { return GOLD_IDX.test(l.url) || GOLD_RES.test(l.url); }).length;
    return n >= 2 || (/(^|\.)jaic\.org$/i.test(hostOf(page.url)) && GOLD_IDX.test(page.url));
  }
  function hostOf(u) { try { return new URL(u).hostname; } catch (e) { return ''; } }
  function dirOf(u) { var x = new URL(u); x.hash = ''; x.search = ''; x.pathname = x.pathname.replace(/[^\/]*$/, ''); return x.href; }
  var MAX_CRAWL = 400;   // 私学大会（3日間・中高）で 377 回（結果376＋一覧1）→ 50 単位で切り上げ
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  async function crawlMeet(page, o) {
    // v0.26.4：上限 300 → 400（私学大会は結果 376 ページあり 77 件取れなかった）。上限で止まった分は rest に返し「続きを読み込む」で続きから取る
    o = o || {}; var max = o.max || MAX_CRAWL, depth = o.depth || 3, wait = o.delay == null ? 120 : o.delay, conc = o.conc || 2;
    var dir = dirOf(page.url), seen = {}, idx = [], res = [], failed = [], req = 0, gold = isMeetPage(page, findLinks(page.html, page.url));
    seen[page.url.replace(/#.*$/, '')] = 1;
    var within = function (l) { return l.kind === 'page' && l.url.indexOf(dir) === 0 && !SKIP_URL.test(l.url) && !SKIP_LAB.test(l.label); };
    var abort = function () { if (o.signal && o.signal.aborted) { var e = new Error('中止しました'); e.name = 'AbortError'; throw e; } };
    var level = [{ page: page, d: 0 }], rest = [];
    // 続きから：前回取れなかった結果のページだけを取る（一覧はたどらない）
    if (o.resume) level = [];
    var todo0 = o.resume ? o.resume.map(function (t) { return { l: t.l, d: t.d, isRes: true, isIdx: false }; }) : null;
    while (level.length || todo0) {
      var next = [], todo = todo0 || []; todo0 = null;
      level.forEach(function (x) {
        findLinks(x.page.html, x.page.url).filter(within).forEach(function (l) {
          if (seen[l.url]) return; seen[l.url] = 1;
          var isRes = gold ? GOLD_RES.test(l.url) : true, isIdx = gold ? GOLD_IDX.test(l.url) : x.d + 1 < depth;
          if (!isRes && !isIdx) return;
          todo.push({ l: l, d: x.d + 1, isRes: isRes, isIdx: isIdx && x.d + 1 < depth });
        });
      });
      // 一覧のページを先に取る（結果のページの名前・件数がわかる）
      todo.sort(function (a, b) { return (b.isIdx && !b.isRes) - (a.isIdx && !a.isRes); });
      var i = 0;
      var worker = async function () {
        while (i < todo.length) {
          var t = todo[i++]; abort();
          if (req >= max) { if (t.isRes) rest.push({ l: t.l, d: t.d }); continue; }
          req++; o.onProgress && o.onProgress({ done: req, found: res.length, total: Math.min(max, req + (todo.length - i)), label: t.l.label });
          try {
            var r = await fetchUrl(t.l.url, { noRedirect: true, signal: o.signal, fetch: o.fetch });
            if (r.kind !== 'html') continue;
            if (t.isRes) res.push({ r: r, label: t.l.label });
            if (t.isIdx) next.push({ page: r, d: t.d });
          } catch (e) { if (e && e.name === 'AbortError') throw e; failed.push({ label: t.l.label, error: e.message }); }
          if (wait) await sleep(wait);
        }
      };
      var ws = []; for (var k = 0; k < conc; k++) ws.push(worker()); await Promise.all(ws);
      level = next;
    }
    // 取り込む順は URL（rel001, rel002 …）の順にそろえる
    res.sort(function (a, b) { return a.r.url < b.r.url ? -1 : a.r.url > b.r.url ? 1 : 0; });
    return { results: res, failed: failed, requests: req, gold: gold, rest: rest };
  }
  /* v0.26.51 速報ページ（gold）を、ラウンドの順に必要なページだけ取る（1年分の記録をまとめる）
     ・一覧（kyougi*.html）を全部取り、種目ごとのラウンドを o.rounds(html, url) で読む
     ・まず各種目の最初のラウンド（予選・ﾀｲﾑﾚｰｽ・1回目の決勝…）のページを全部取る。o.has(ページ) で、この学校の選手がいそうか見る
     ・その種目の最初のラウンドに一度も出てこなければ、あとのラウンド（準決勝・決勝・総合結果）は取らない（出ていない選手は次のラウンドにもいない）
     ・読めなかったページは「いそう」とみなす（あとのラウンドも取る）。一覧に種目がないページ・どの種目か分からないページは全部取る
     ・取るページの選び方（同じフォルダ・結果のページ・とばす名前）は crawlMeet と同じ。いくつかを同時に取る（速さは o.fetch の側でそろえる）
     ・o.get(url) は前に取ったページ（同じ画面のうちは読み直さない）、o.no(url) はこの学校がいないと分かっているページ（取らない）、o.put(url, r, いそうか) で控える
     返すもの：{ results: [{r, label}]（この学校がいそうなページ、URLの順）, failed, requests, pages（取ったページの数・控えから使った数も含む）, skipped（とばしたページの数）, events } */
  async function crawlRounds(page, o) {
    o = o || {}; var conc = o.conc || 6, dir = dirOf(page.url), seen = {}, req = 0, failed = [], done = 0;
    var within = function (l) { return l.kind === 'page' && l.url.indexOf(dir) === 0 && !SKIP_URL.test(l.url) && !SKIP_LAB.test(l.label); };
    var abort = function () { if (o.signal && o.signal.aborted) { var e = new Error('中止しました'); e.name = 'AbortError'; throw e; } };
    var get = async function (u) {
      var c = o.get && o.get(u); if (c) return c;
      abort(); req++; var r = await fetchUrl(u, { noRedirect: true, signal: o.signal, fetch: o.fetch }); return r;
    };
    var many = async function (list, each) {
      var i = 0, ws = [];
      var w = async function () { while (i < list.length) { var t = list[i++]; abort(); await each(t); } };
      for (var k = 0; k < Math.min(conc, list.length); k++) ws.push(w()); await Promise.all(ws);
    };
    // 1) 一覧のページ（2段まで）と、結果のページのURL（出てきた順）
    seen[page.url.replace(/#.*$/, '')] = 1;
    var idx = [page], level = [page], res = [], lab = {};
    for (var d = 0; level.length; d++) {
      var nx = [];
      level.forEach(function (pg) {
        findLinks(pg.html, pg.url).filter(within).forEach(function (l) {
          if (seen[l.url]) return;
          if (GOLD_RES.test(l.url)) { seen[l.url] = 1; res.push(l.url); lab[l.url] = l.label; } else if (GOLD_IDX.test(l.url) && d < 2) { seen[l.url] = 1; nx.push(l); }
        });
      });
      var got = [];
      await many(nx, async function (l) {
        try { var r = await get(l.url); if (r.kind === 'html') { got.push(r); o.put && o.put(l.url, r, true); } }
        catch (e) { if (e && e.name === 'AbortError') throw e; failed.push({ label: l.label, error: e.message }); }
        o.onProgress && o.onProgress({ done: ++done, total: done + nx.length - got.length, label: l.label, step: 'idx' });
      });
      got.sort(function (a, b) { return a.url < b.url ? -1 : a.url > b.url ? 1 : 0; });
      idx = idx.concat(got); level = got;
    }
    var inRes = {}; res.forEach(function (u) { inRes[u] = 1; });
    // 2) 種目ごとのラウンド
    var evs = [], where = {};
    idx.forEach(function (pg) { (o.rounds ? o.rounds(pg.html, pg.url) : []).forEach(function (ev) { evs.push(ev); }); });
    evs.forEach(function (ev, ei) {
      var rs = ev.rounds.map(function (r) { return { lab: r.lab, sogo: r.sogo, links: r.links.filter(function (u) { return inRes[u] && where[u] == null; }) }; }).filter(function (r) { return r.links.length; });
      var f = -1; for (var k = 0; k < rs.length; k++) if (!rs[k].sogo) { f = k; break; }
      rs.forEach(function (r, k) { r.links.forEach(function (u) { where[u] = { ev: ei, first: f < 0 || k === f }; }); });
    });
    var first = res.filter(function (u) { return !where[u] || where[u].first; }), later = res.filter(function (u) { return where[u] && !where[u].first; });
    var hit = {}, keep = {}, total = first.length + later.length;
    var one = async function (u) {
      var pos = true, r = null;
      if (o.no && o.no(u)) pos = false;
      else {
        try { r = await get(u); pos = r.kind === 'html' ? (o.has ? !!o.has(r) : true) : false; if (r.kind === 'html') o.put && o.put(u, r, pos); }
        catch (e) { if (e && e.name === 'AbortError') throw e; failed.push({ label: lab[u] || u, error: e.message }); pos = true; r = null; }
      }
      if (pos && where[u]) hit[where[u].ev] = 1;
      if (pos && r) keep[u] = r;
      done++; o.onProgress && o.onProgress({ done: done, total: done + Math.max(0, total - doneRes()), label: lab[u] || '', step: 'res' });
    };
    var nRes = 0, doneRes = function () { return nRes; };
    var wrap = async function (u) { await one(u); nRes++; };
    // 3) 最初のラウンド → この学校がいた種目だけ、あとのラウンド
    await many(first, wrap);
    var go = later.filter(function (u) { return hit[where[u].ev]; }); total = first.length + go.length;
    await many(go, wrap);
    var out = Object.keys(keep).sort().map(function (u) { return { r: keep[u], label: lab[u] || '' }; });
    return { results: out, failed: failed, requests: req, pages: idx.length + first.length + go.length, skipped: later.length - go.length, events: evs.length };
  }
  function guessTarget(label, targets) {
    for (var i = 0; i < targets.length; i++) if (targets[i].re && targets[i].re.test(label)) return targets[i].k;
    return '';
  }
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  /* 画面の部品
     mount(el, { id, targets:[{k,label,re}], accept:['pdf'] or ['pdf','html'], multiple, onFiles(filesByTarget, ctx) , begin() → ctx })
     targets が2つ以上のときは、リンクごとに「どこに入れるか」を選ぶ */
  // v0.26.9：管理者が「URLから読み込む」を止めているとき（config/flags の relay=false）。空文字で再開
  var PAUSED = '';
  function setPaused(msg) { PAUSED = String(msg || ''); }
  function mount(el, o) {
    var id = o.id, multi = o.targets.length > 1, acceptHtml = o.accept.indexOf('html') >= 0;
    el.classList.add('url-load');
    el.innerHTML = '<div class="url-row"><label for="' + id + 'Url" class="url-lab">🔗 URLから読み込む</label>' +
      (multi ? '<select id="' + id + 'Tgt" aria-label="入れる先">' + o.targets.map(function (t) { return '<option value="' + t.k + '">' + esc(t.label) + '</option>'; }).join('') + '</select>' : '') +
      '<input type="url" id="' + id + 'Url" inputmode="url" autocomplete="off" placeholder="https://… （PDFや大会のページのアドレス）">' +
      '<button class="btn" type="button" id="' + id + 'Go">読み込む</button></div>' +
      '<div class="status" id="' + id + 'St" aria-live="polite"></div><div class="url-links" id="' + id + 'Links" hidden></div>';
    var $ = function (s) { return document.getElementById(id + s); };
    var busy = false, ctrl = null;
    function st(msg, cls) { var s = $('St'); s.textContent = msg; s.className = 'status ' + (cls || ''); }
    function tgtOf(k) { return o.targets.filter(function (t) { return t.k === k; })[0] || o.targets[0]; }
    async function deliver(list, ctx) {   // list: [{ r, k }]
      var by = {}; list.forEach(function (x) { (by[x.k] = by[x.k] || []).push(toFile(x.r)); });
      for (var k in by) await o.onFiles(by[k], k, ctx);
    }
    async function go(url) {
      if (busy) return; url = url != null ? url : $('Url').value;
      if (PAUSED) { st(PAUSED, 'ng'); return; }
      var u = normUrl(url); if (!u) { st('✖ ' + MSG.bad, 'ng'); return; }
      $('Url').value = u; $('Links').hidden = true; $('Links').innerHTML = '';
      var ctx = o.begin ? o.begin() : null;   // 記録：押した時点の scope を最後まで持ち回る（A01）
      busy = true; $('Go').disabled = true; ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      st('読み込み中…（LANE NOTE の中継を通して取りに行っています）', 'busy');
      try {
        var r = await fetchUrl(u, { signal: ctrl && ctrl.signal, fetch: o.fetch });
        var k0 = multi ? $('Tgt').value : o.targets[0].k;
        if (r.kind === 'pdf') { st('✔ PDFを取ってきました：' + r.name, 'ok'); await deliver([{ r: r, k: k0 }], ctx); return; }
        var links = findLinks(r.html, r.url).filter(function (l) { return acceptHtml || l.kind === 'pdf'; });
        if (!links.length) {
          if (acceptHtml) { st('✔ Webページを取ってきました：' + (r.title || r.name), 'ok'); await deliver([{ r: r, k: k0 }], ctx); return; }
          throw err('このページにはPDFへのリンクが見つかりませんでした。PDFそのもののアドレスを入れてください');
        }
        showLinks(r, links, ctx);
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        st('✖ ' + (e && e.message || e), 'ng');
      } finally { busy = false; $('Go').disabled = false; }
    }
    function showLinks(page, links, ctx) {
      var box = $('Links'), k0 = multi ? $('Tgt').value : o.targets[0].k;
      var rows = (acceptHtml ? [{ url: page.url, kind: 'self', label: 'このページ自体（' + (page.title || page.name) + '）' }] : []).concat(links);
      var opt = function (sel) { return '<option value="">読み込まない</option>' + o.targets.map(function (t) { return '<option value="' + t.k + '"' + (t.k === sel ? ' selected' : '') + '>' + esc(t.label) + '</option>'; }).join(''); };
      var meet = acceptHtml && isMeetPage(page, links);
      box.innerHTML = (meet ? '<div class="url-meet"><p><b>🏟 大会の速報ページのようです。</b>種目・組ごとの結果のページを全部たどって、まとめて取り込めます（数十〜数百ページ。少し時間がかかります）。</p><button type="button" class="btn" data-crawl>📥 この大会の結果をまとめて取り込む</button></div>' : '') +
        '<p class="small"><b>このページから ' + links.length + ' 件のリンクが見つかりました。</b>' + (multi ? 'それぞれ「どこに入れるか」を選んでください（名前から見当をつけてあります）。' : '読み込むものにチェックを入れてください。') + '</p>' +
        (!multi && o.multiple ? '<div class="url-acts"><button type="button" class="btn sub" data-all="1">全部選ぶ</button><button type="button" class="btn sub" data-all="0">全部はずす</button><label class="small"><input type="checkbox" data-onlypdf> PDFだけ表示</label></div>' : '') +
        '<ul class="url-list">' + rows.map(function (l, i) {
          var tag = l.kind === 'pdf' ? '<span class="url-k pdf">PDF</span>' : l.kind === 'self' ? '<span class="url-k self">ページ</span>' : '<span class="url-k pg">ページ</span>';
          var ctl = multi ? '<select data-i="' + i + '">' + opt(guessTarget(l.label, o.targets)) + '</select>'
            : '<input type="' + (o.multiple ? 'checkbox' : 'radio') + '" name="' + id + 'Pick" data-i="' + i + '"' + (l.kind === 'self' && links.length < 2 ? ' checked' : '') + '>';
          return '<li data-kind="' + l.kind + '"><label>' + ctl + ' ' + tag + ' <span class="url-t">' + esc(l.label) + '</span></label> <a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer" class="small muted url-a">開く</a></li>';
        }).join('') + '</ul><div class="url-acts"><button type="button" class="btn" data-load>選んだものを読み込む</button><button type="button" class="btn sub" data-cancel>やめる</button></div>';
      box.hidden = false;
      st('', '');
      box.onclick = function (e) {
        var t = e.target;
        if (t.hasAttribute('data-crawl')) { crawlAll(page, ctx); return; }
        if (t.hasAttribute('data-all')) { box.querySelectorAll('li:not([hidden]) input[data-i]').forEach(function (c) { c.checked = t.getAttribute('data-all') === '1'; }); }
        else if (t.hasAttribute('data-onlypdf')) { box.querySelectorAll('li').forEach(function (li) { li.hidden = t.checked && li.getAttribute('data-kind') !== 'pdf'; }); }
        else if (t.hasAttribute('data-cancel')) { box.hidden = true; box.innerHTML = ''; st('', ''); }
        else if (t.hasAttribute('data-load')) {
          var pick = [];
          box.querySelectorAll('[data-i]').forEach(function (c) { var i = +c.getAttribute('data-i'); if (multi ? c.value : c.checked) pick.push({ l: rows[i], k: multi ? c.value : k0 }); });
          if (!pick.length) { st('✖ 読み込むものを選んでください', 'ng'); return; }
          if (pick.length > 60) { st('✖ 一度に読み込めるのは60件までです', 'ng'); return; }
          loadPicked(page, pick, ctx);
        }
      };
    }
    async function crawlAll(page, ctx, resume) {
      if (busy) return; busy = true; $('Go').disabled = true;
      ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var box = $('Links'); box.innerHTML = '<div class="url-meet"><p class="small">結果のページを集めています。止めたいときは「やめる」を押してください（そこまでに集めた分は取り込みません）。</p><progress id="' + id + 'Prog" max="1" value="0" style="width:100%"></progress><button type="button" class="btn sub" data-stop>やめる</button></div>';
      box.onclick = function (e) { if (e.target.hasAttribute('data-stop') && ctrl) ctrl.abort(); };
      try {
        var out = await crawlMeet(page, { resume: resume, signal: ctrl && ctrl.signal, fetch: o.fetch, delay: o.delay, max: o.max, onProgress: function (p) {
          st('読み込み中…（' + p.done + '／約' + p.total + 'ページ・結果 ' + p.found + 'ページ）' + String(p.label || '').slice(0, 40), 'busy');
          var pr = document.getElementById(id + 'Prog'); if (pr) { pr.max = p.total; pr.value = p.done; } } });
        box.hidden = true; box.innerHTML = '';
        var more = out.rest.length ? '　ⓘ 大きな大会なので、通信が ' + out.requests + ' 回に達したところで一度止めました。残りの結果 ' + out.rest.length + 'ページは、下の「続きを読み込む」で取り込めます。' : '';
        if (out.rest.length) {
          box.innerHTML = '<div class="url-meet"><button type="button" class="btn" data-more>📥 続きを読み込む（残り ' + out.rest.length + 'ページ）</button></div>'; box.hidden = false;
          box.onclick = function (e) { if (e.target.hasAttribute('data-more')) crawlAll(page, ctx, out.rest); };
        }
        if (!out.results.length) { st('✖ 結果のページが見つかりませんでした' + (out.failed.length ? '（読み込めなかったもの ' + out.failed.length + '件）' : ''), 'ng'); return; }
        st('✔ 結果のページを ' + out.results.length + ' 件取ってきました（通信 ' + out.requests + ' 回）。' + (out.failed.length ? '　✖ 読み込めなかったもの ' + out.failed.length + '件：' + out.failed.slice(0, 3).map(function (f) { return f.label.slice(0, 20) + '：' + f.error; }).join('／') : '') + more, out.failed.length || more ? 'warn' : 'ok');
        busy = false;   // 取り込み（onFiles）の間も次の読み込みを受け付けてよい
        // 最初のページ（競技一覧）も渡す：大会名はそこにだけ書いてある
        await deliver((resume ? [] : [{ r: page, k: o.targets[0].k }]).concat(out.results.map(function (x) { return { r: x.r, k: o.targets[0].k }; })), ctx);
      } catch (e) {
        box.hidden = true; box.innerHTML = '';
        st(e && e.name === 'AbortError' ? 'やめました（取り込んでいません）。' : '✖ ' + (e && e.message || e), e && e.name === 'AbortError' ? '' : 'ng');
      } finally { busy = false; $('Go').disabled = false; }
    }
    async function loadPicked(page, pick, ctx) {
      busy = true; $('Go').disabled = true; var got = [], ng = [];
      try {
        for (var i = 0; i < pick.length; i++) {
          st('読み込み中…（' + (i + 1) + '／' + pick.length + '）' + pick[i].l.label.slice(0, 40), 'busy');
          try {
            var r = pick[i].l.kind === 'self' ? page : await fetchUrl(pick[i].l.url, { noRedirect: true, fetch: o.fetch });
            if (r.kind === 'html' && !acceptHtml) throw err('type');
            got.push({ r: r, k: pick[i].k });
          } catch (e) { if (e && e.name === 'AbortError') return; ng.push(pick[i].l.label.slice(0, 30) + '：' + e.message); }
        }
        $('Links').hidden = true; $('Links').innerHTML = '';
        st((got.length ? '✔ ' + got.length + '件を取ってきました。' : '') + (ng.length ? '　✖ 読み込めなかったもの：' + ng.join('／') : ''), ng.length && !got.length ? 'ng' : ng.length ? 'warn' : 'ok');
        if (got.length) await deliver(got, ctx);
      } finally { busy = false; $('Go').disabled = false; }
    }
    $('Go').addEventListener('click', function () { go(); });
    $('Url').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    // URLだけを貼った・落としたとき：入れておいて「読み込む」を押せるようにする
    function offer(url, k) {
      $('Url').value = String(url).trim(); if (multi && k) $('Tgt').value = k;
      st('ⓘ URLを入れました。「読み込む」を押すと、このアドレスから読み込みます。', '');
      el.scrollIntoView && el.scrollIntoView({ behavior: 'smooth', block: 'center' }); $('Go').focus();
    }
    return { go: go, offer: offer, setTarget: function (k) { if (multi) $('Tgt').value = k; } };
  }
  var api = { PROXY: PROXY, MAX: MAX, MSG: MSG, isUrlOnly: isUrlOnly, normUrl: normUrl, sniff: sniff, decodeHtml: decodeHtml, fetchUrl: fetchUrl, toFile: toFile, findLinks: findLinks, guessTarget: guessTarget, isMeetPage: isMeetPage, crawlMeet: crawlMeet, crawlRounds: crawlRounds, setPaused: setPaused, MAX_CRAWL: MAX_CRAWL, fileName: fileName, mount: mount };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LaneUrl = api;
})(typeof window !== 'undefined' ? window : globalThis);
