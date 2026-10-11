/* v0.20 URLから読み込む（大会準備・記録・照合で共通）
   ・ブラウザから直接ほかのサイトのファイルは取れない（CORS）ので、LANE NOTE の Cloudflare 中継（worker/worker.js）を通して取る。
   ・中継はURLと取ってきた中身をそのまま返すだけで、保存しない。取ってきたものは「ファイルを入れたとき」と同じ処理に File として渡す。
   ・Webページの中に PDF や別ページへのリンクがたくさんあるとき（大会のページなど）は、一覧を出して選んでもらう。 */
(function (root) {
  'use strict';
  var PROXY = 'https://lane-note-fetch.masashi-sakata1007.workers.dev/';
  var MAX = 20 * 1048576;
  var MSG = {
    bad: 'URLの形が正しくありません（https:// から始まるアドレスを入れてください）',
    net: '読み込めませんでした。URLが正しいか、インターネットにつながっているかを確かめてください',
    notfound: '読み込めませんでした（ページが見つかりません。URLが正しいか確かめてください）',
    big: '大きすぎるので読み込めませんでした（20MBまで）。PDFをダウンロードして、枠に入れてください',
    type: '対応していない形式です（読み込めるのはPDFとWebページだけです）',
    login: 'ログインが必要なページのようです。そのページを開いてPDFをダウンロードし、枠に入れてください',
    blocked: 'このアドレスは読み込めません'
  };
  function isUrlOnly(t) { return /^\s*https?:\/\/\S+\s*$/i.test(String(t || '')); }
  function normUrl(s) {
    s = String(s || '').trim(); if (!s) return null;
    if (!/^https?:\/\//i.test(s) && /^[\w-]+(\.[\w-]+)+(\/|$)/.test(s)) s = 'https://' + s;
    try { var u = new URL(s); return /^https?:$/.test(u.protocol) ? u.href : null; } catch (e) { return null; }
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
    var res;
    try { res = await (opt.fetch || root.fetch).call(root, PROXY + '?url=' + encodeURIComponent(u), { method: 'GET', credentials: 'omit', signal: opt.signal }); }
    catch (e) { if (e && e.name === 'AbortError') throw e; throw err('net'); }
    if (res.status === 413) throw err('big');
    if (res.status === 415) throw err('type');
    if (res.status === 401 || res.status === 407) throw err('login');
    if (res.status === 403) throw err(/forbidden/.test(await safeText(res)) ? 'net' : 'login');
    if (res.status === 404 || res.status === 410) throw err('notfound');
    if (res.status === 400) { var bt = await safeText(res); throw err(/blocked/.test(bt) ? 'blocked' : 'bad'); }
    if (!res.ok) throw err('net');
    var len = +(res.headers.get('Content-Length') || 0); if (len > MAX) throw err('big');
    var buf; try { buf = new Uint8Array(await res.arrayBuffer()); } catch (e) { if (e && e.name === 'AbortError') throw e; throw err('net'); }
    if (buf.length > MAX) throw err('big');
    var type = res.headers.get('Content-Type') || '', kind = sniff(buf, type);
    if (kind === 'text') kind = 'html';
    if (kind !== 'pdf' && kind !== 'html') throw err('type');
    var out = { url: u, kind: kind, bytes: buf, type: type, name: fileName(u, kind) };
    if (kind === 'html') {
      out.html = decodeHtml(buf, type);
      if (looksLogin(out.html)) throw err('login');
      var t = (out.html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]; out.title = t ? t.trim() : '';
      // 転送だけのページ（meta refresh・location.href=）は1回だけついていく
      var rd = out.html.length < 4000 && (out.html.match(/http-equiv\s*=\s*["']?refresh["']?[^>]*url\s*=\s*['"]?([^"'>\s]+)/i) || out.html.match(/location\.href\s*=\s*["']([^"']+)["']/i));
      if (rd && !opt.noRedirect) { try { return await fetchUrl(new URL(rd[1], u).href, Object.assign({}, opt, { noRedirect: true })); } catch (e) { if (e && e.name === 'AbortError') throw e; } }
    }
    return out;
  }
  async function safeText(res) { try { return await res.text(); } catch (e) { return ''; } }
  function toFile(r) {
    var type = r.kind === 'pdf' ? 'application/pdf' : 'text/html';
    try { return new File([r.bytes], r.name, { type: type }); }
    catch (e) { var b = new Blob([r.bytes], { type: type }); b.name = r.name; b.lastModified = Date.now(); return b; }
  }
  // Webページの中のリンク（PDFと、同じサイトの別ページ）を集める。相対URLは解決する
  function findLinks(html, base) {
    var doc = new DOMParser().parseFromString(html, 'text/html'), seen = {}, out = [], bu;
    try { bu = new URL(base); } catch (e) { return out; }
    var b = doc.querySelector('base[href]'); var baseHref = base; if (b) { try { baseHref = new URL(b.getAttribute('href'), base).href; } catch (e) { } }
    Array.prototype.forEach.call(doc.querySelectorAll('a[href], area[href], frame[src], iframe[src]'), function (a) {
      var raw = a.getAttribute('href') || a.getAttribute('src') || ''; if (!raw || /^\s*(#|javascript:|mailto:|tel:)/i.test(raw)) return;
      var u; try { u = new URL(raw.trim(), baseHref); } catch (e) { return; }
      if (!/^https?:$/.test(u.protocol)) return;
      u.hash = ''; var href = u.href; if (href === bu.href.replace(/#.*$/, '') || seen[href]) return;
      var isPdf = /\.pdf$/i.test(u.pathname);
      var isPage = !isPdf && u.host === bu.host && /(\/|\.s?html?|\.php|\.aspx?|\/[^.\/]+)$/i.test(u.pathname) && !/\.(css|js|png|jpe?g|gif|svg|ico|zip|xlsx?|docx?|csv|txt|mp4)$/i.test(u.pathname);
      if (!isPdf && !isPage) return;
      seen[href] = 1;
      var label = (a.textContent || a.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
      // 表の中のリンクは、行の見出し（左のセル）も付けておくと何のリンクか分かりやすい
      var tr = a.closest && a.closest('tr'); var rowh = '';
      if (tr) { var c0 = tr.querySelector('th,td'); if (c0 && !c0.contains(a)) rowh = c0.textContent.replace(/\s+/g, ' ').trim().slice(0, 40); }
      out.push({ url: href, kind: isPdf ? 'pdf' : 'page', label: (rowh && rowh !== label ? rowh + '　' : '') + (label || decodeURIComponent(u.pathname.split('/').pop() || href)) });
    });
    return out.slice(0, 500);
  }
  function guessTarget(label, targets) {
    for (var i = 0; i < targets.length; i++) if (targets[i].re && targets[i].re.test(label)) return targets[i].k;
    return '';
  }
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  /* 画面の部品
     mount(el, { id, targets:[{k,label,re}], accept:['pdf'] or ['pdf','html'], multiple, onFiles(filesByTarget, ctx) , begin() → ctx })
     targets が2つ以上のときは、リンクごとに「どこに入れるか」を選ぶ */
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
      var u = normUrl(url); if (!u) { st('✖ ' + MSG.bad, 'ng'); return; }
      $('Url').value = u; $('Links').hidden = true; $('Links').innerHTML = '';
      var ctx = o.begin ? o.begin() : null;   // 記録：押した時点の scope を最後まで持ち回る（A01）
      busy = true; $('Go').disabled = true; ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      st('読み込み中…（LANE NOTE の中継を通して取りに行っています）', 'busy');
      try {
        var r = await fetchUrl(u, { signal: ctrl && ctrl.signal });
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
      box.innerHTML = '<p class="small"><b>このページから ' + links.length + ' 件のリンクが見つかりました。</b>' + (multi ? 'それぞれ「どこに入れるか」を選んでください（名前から見当をつけてあります）。' : '読み込むものにチェックを入れてください。') + '</p>' +
        (!multi && o.multiple ? '<div class="url-acts"><button type="button" class="btn sub" data-all="1">全部選ぶ</button><button type="button" class="btn sub" data-all="0">全部はずす</button><label class="small"><input type="checkbox" data-onlypdf> PDFだけ表示</label></div>' : '') +
        '<ul class="url-list">' + rows.map(function (l, i) {
          var tag = l.kind === 'pdf' ? '<span class="url-k pdf">PDF</span>' : l.kind === 'self' ? '<span class="url-k self">ページ</span>' : '<span class="url-k pg">ページ</span>';
          var ctl = multi ? '<select data-i="' + i + '">' + opt(guessTarget(l.label, o.targets)) + '</select>'
            : '<input type="' + (o.multiple ? 'checkbox' : 'radio') + '" name="' + id + 'Pick" data-i="' + i + '"' + (l.kind === 'self' && links.length < 2 ? ' checked' : '') + '>';
          return '<li data-kind="' + l.kind + '"><label>' + ctl + ' ' + tag + ' <span class="url-t">' + esc(l.label) + '</span></label> <a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer" class="small muted url-a">開く</a></li>';
        }).join('') + '</ul><div class="url-acts"><button type="button" class="btn" data-load>選んだものを読み込む</button><button type="button" class="btn sub" data-cancel>やめる</button></div>';
      box.hidden = false;
      st('リンクを ' + links.length + ' 件見つけました。読み込むものを選んでください。', '');
      box.onclick = function (e) {
        var t = e.target;
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
    async function loadPicked(page, pick, ctx) {
      busy = true; $('Go').disabled = true; var got = [], ng = [];
      try {
        for (var i = 0; i < pick.length; i++) {
          st('読み込み中…（' + (i + 1) + '／' + pick.length + '）' + pick[i].l.label.slice(0, 40), 'busy');
          try {
            var r = pick[i].l.kind === 'self' ? page : await fetchUrl(pick[i].l.url, { noRedirect: true });
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
  var api = { PROXY: PROXY, MAX: MAX, MSG: MSG, isUrlOnly: isUrlOnly, normUrl: normUrl, sniff: sniff, decodeHtml: decodeHtml, fetchUrl: fetchUrl, toFile: toFile, findLinks: findLinks, guessTarget: guessTarget, fileName: fileName, mount: mount };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LaneUrl = api;
})(typeof window !== 'undefined' ? window : globalThis);
