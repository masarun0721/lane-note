/* ===== v0.28.4 引っ越しのお知らせ（旧アドレス＝GitHub Pages で開いたときだけ。すべてのページ）
   ・開くたびに全画面で出す。自動では移らない（この端末の記録は住所ごとに別の保存場所のため、旧アドレスで書き出せるように残す）
   ・「このまま使う（記録を移すときだけ）」→ この画面のあいだは、上の赤い帯だけにする
   ・この端末に記録（lanenote-records）があるときだけ「記録を書き出す」を出す。記録のページ以外は records.html?export=1 を開く */
var LaneMove = (function () {
  'use strict';
  var SITE = typeof LANE_SITE !== 'undefined' ? LANE_SITE : 'https://lane-note.web.app/', OLD = 'masarun0721.github.io', KEY = 'lanenote.move.stay.v1';
  var st = { has: false, done: false, msg: '' };
  function $(id) { return document.getElementById(id); }
  function on() { return typeof location !== 'undefined' && location.hostname === OLD; }
  function newUrl() { var p = location.pathname.replace(/^\/lane-note\//, '/').replace(/^\/+/, ''), q = location.search.replace(/([?&])export=1(&|$)/, '$1').replace(/[?&]$/, ''); return SITE + p + q + location.hash; }
  function recPage() { return !!$('rbExport') && /\/records\.html$/.test(location.pathname); }
  function stay() { try { return !!sessionStorage.getItem(KEY); } catch (e) { return false; } }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // この端末の記録があるか（無いときにデータベースを作らない）
  function hasLocal() {
    return new Promise(function (ok) {
      try {
        if (!window.indexedDB) return ok(false);
        var q = indexedDB.open('lanenote-records'), fresh = false;
        q.onupgradeneeded = function () { fresh = true; try { q.transaction.abort(); } catch (e) { } };
        q.onerror = function () { ok(false); };
        q.onsuccess = function () { var d = q.result; if (fresh || !d.objectStoreNames.contains('records')) { d.close(); return ok(false); } try { var c = d.transaction('records', 'readonly').objectStore('records').count(); c.onsuccess = function () { d.close(); ok(c.result > 0); }; c.onerror = function () { d.close(); ok(false); }; } catch (e) { d.close(); ok(false); } };
      } catch (e) { ok(false); }
    });
  }
  var CSS = '#laneMoveOv{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.72);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px}' +
    '#laneMoveOv .mv-box{background:#fff;color:#14213d;border-radius:16px;max-width:640px;width:100%;padding:26px 22px 18px;box-shadow:0 20px 60px rgba(0,0,0,.35);font-size:15px;line-height:1.6;text-align:center}' +
    '#laneMoveOv h2{margin:0 0 6px;font-size:22px;line-height:1.4}#laneMoveOv .mv-sub{margin:0 0 14px;color:#b3261e;font-weight:700}' +
    '#laneMoveOv .mv-url{display:block;font-size:26px;font-weight:900;letter-spacing:.01em;margin:6px 0 16px;color:#1f3a6b;word-break:break-all}' +
    '.mv-go{display:block;background:#c0392b;color:#fff!important;text-decoration:none!important;font-weight:900;font-size:20px;border-radius:12px;padding:16px 18px;cursor:pointer;box-shadow:0 3px 0 #8e2a1f}.mv-go:hover{background:#d2452f}' +
    '#laneMoveOv .mv-rec{margin:18px 0 6px;padding:12px 14px;border:1px solid #e3c98a;background:#fff8e6;border-radius:12px;text-align:left}#laneMoveOv .mv-rec h3{margin:0 0 6px;font-size:15px}' +
    '#laneMoveOv .mv-rec ol{margin:6px 0 4px 1.2em;padding:0}#laneMoveOv .mv-rec li{margin:4px 0}' +
    '.mv-exp{display:inline-block;border:1px solid #1f3a6b;background:#fff;color:#1f3a6b!important;text-decoration:none!important;font-weight:700;font-size:15px;border-radius:999px;padding:6px 14px;cursor:pointer}.mv-exp:hover{background:#eef3fb}' +
    '.mv-sign{display:block;margin:6px 0 4px;background:#1f3a6b;color:#fff!important;text-decoration:none!important;font-weight:900;font-size:16px;border:0;border-radius:10px;padding:11px 14px;cursor:pointer;width:100%;text-align:center;box-sizing:border-box}.mv-sign:hover{background:#2c4f8f}' +
    '#laneMoveOv .mv-opt{margin:8px 0 2px;font-size:14px}#laneMoveOv .mv-steps{font-size:13px;color:#3d4757}.mv-hl{outline:3px solid #c0392b!important;outline-offset:3px}' +
    '#laneMoveOv .mv-note{font-size:13px;color:#5a6577;margin:6px 0 0}#laneMoveOv .mv-msg{font-size:13px;margin:6px 0 0;color:#1d6b3a}' +
    '#laneMoveOv .mv-stay{display:inline-block;margin-top:16px;background:none;border:0;color:#7a8394;font-size:13px;text-decoration:underline;cursor:pointer}#laneMoveOv .mv-stay:hover{color:#14213d}' +
    '#laneMoveBar{position:sticky;top:0;z-index:2147482000;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px 12px;padding:10px 12px;background:#b3261e;color:#fff;font-size:14px;font-weight:700;line-height:1.5}' +
    '#laneMoveBar .mv-go{display:inline-block;font-size:15px;padding:6px 16px;background:#fff;color:#b3261e!important;box-shadow:none}#laneMoveBar .mv-go:hover{background:#ffe9e5}#laneMoveBar .mv-exp{border-color:#fff;background:transparent;color:#fff!important;font-size:13px;padding:4px 12px}#laneMoveBar .mv-exp:hover{background:rgba(255,255,255,.15)}' +
    '@media (max-width:480px){#laneMoveOv{padding:12px 8px}#laneMoveOv .mv-box{padding:20px 14px 14px}#laneMoveOv h2{font-size:19px}#laneMoveOv .mv-url{font-size:21px}.mv-go{font-size:18px}}' +
    '@media print{#laneMoveOv,#laneMoveBar{display:none!important}}';
  function css() { if ($('laneMoveCss')) return; var s = document.createElement('style'); s.id = 'laneMoveCss'; s.textContent = CSS; (document.head || document.documentElement).appendChild(s); }
  // 記録を書き出す：記録のページならその場で（今までの「💾 ファイルに書き出す（JSON）」）、ほかのページは記録のページを開く
  function expHtml() { return recPage() ? '<button type="button" class="mv-exp" id="laneMoveExp">💾 記録を書き出す</button>' : '<a class="mv-exp" id="laneMoveExp" href="records.html?export=1#rbH3">💾 記録を書き出す</a>'; }
  // v0.28.4 Googleでログインして移す：記録のページでログイン → 今までの「このアカウントへ移す」（v0.14 の rbGuest）。ほかのページは記録のページを開く
  function signHtml() { return recPage() ? '<button type="button" class="mv-sign" id="laneMoveSign">Googleでログインして移す（おすすめ）</button>' : '<a class="mv-sign" id="laneMoveSign" href="records.html?migrate=1">Googleでログインして移す（おすすめ）</a>'; }
  function guestBox() { var g = $('rbGuest'); return g && !g.hidden && g.querySelector('[data-guest="move"]') ? g : null; }
  function toGuest(n) {
    var g = guestBox(); if (g) { try { g.scrollIntoView({ block: 'center' }); } catch (e) { } g.classList.add('mv-hl'); var b = g.querySelector('[data-guest="move"]'); if (b && b.focus) b.focus(); return; }
    if (n > 0) setTimeout(function () { toGuest(n - 1); }, 500);
  }
  function render() {
    if (!on() || !document.body) return;
    css(); var ov = $('laneMoveOv'), bar = $('laneMoveBar'), go = '<a class="mv-go" id="laneMoveGo" href="' + esc(newUrl()) + '">新しい住所で開く</a>';
    if (stay()) {
      if (ov) ov.remove(); if (bar && bar.parentNode === document.body) return;
      bar = document.createElement('div'); bar.id = 'laneMoveBar'; bar.setAttribute('role', 'alert');
      bar.innerHTML = '<span>⚠ LANE NOTEは新しい住所（lane-note.web.app）に引っ越しました。こちらは今後更新されません。</span>' + go + (st.has ? expHtml() : '');
      document.body.insertBefore(bar, document.body.firstChild); return;
    }
    if (ov && ov.parentNode === document.body) return;
    ov = document.createElement('div'); ov.id = 'laneMoveOv'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'laneMoveT');
    ov.innerHTML = '<div class="mv-box"><h2 id="laneMoveT">LANE NOTEは新しい住所に引っ越しました</h2><p class="mv-sub">こちらの住所は今後更新されません。</p>' +
      '<span class="mv-url">' + esc(SITE) + '</span>' + go +
      (st.has ? '<div class="mv-rec" id="laneMoveRec"><h3>この端末に記録を保存している人へ</h3>' +
        '<p class="mv-opt"><b>おすすめ：</b>Googleアカウントに移すと、新しい住所でログインするだけで見られます</p>' + signHtml() +
        '<ol class="mv-steps"><li>このページでGoogleでログイン →「このアカウントへ移す」を押す</li><li>新しい住所で同じGoogleアカウントでログイン</li></ol>' +
        '<p class="mv-opt"><b>ログインしない人：</b>ファイルで移す</p><ol><li>' + expHtml() + '</li><li>新しい住所の記録のページで「ファイルから読み込む」</li></ol>' +
        '<p class="mv-note">Googleでログインして保存している記録は、新しい住所でログインすればそのまま見られます</p>' + (st.msg ? '<p class="mv-msg" id="laneMoveMsg">' + esc(st.msg) + '</p>' : '') + '</div>' : '') +
      '<button type="button" class="mv-stay" id="laneMoveStay">このまま使う（記録を移すときだけ）</button></div>';
    document.body.appendChild(ov);
    var g = $('laneMoveGo'); if (g && g.focus) try { g.focus(); } catch (e) { }
  }
  function click(e) {
    var t = e.target; if (!t || !t.closest) return;
    var sg = t.closest('#laneMoveSign'); if (sg && recPage()) {
      e.preventDefault(); try { sessionStorage.setItem(KEY, '1'); } catch (x) { } render();   // お知らせは赤い帯にして、移す画面を見せる
      if (!guestBox()) { var si = $('rbSignIn'); if (si && !si.hidden && si.offsetParent !== null) si.click(); }
      toGuest(240); return;   // ログインのあと「このアカウントへ移す」が出たら、そこへ（2分まで待つ）
    }
    if (t.closest('#laneMoveStay')) { try { sessionStorage.setItem(KEY, '1'); } catch (x) { } render(); return; }
    var x = t.closest('#laneMoveExp'); if (x && recPage()) {
      e.preventDefault(); var b = $('rbExport'); if (b) b.click();
      setTimeout(function () { var s = $('rbDataStatus'); st.msg = s && s.textContent.trim() ? s.textContent.trim() : '書き出しを始めました（ダウンロードを確かめてください）'; var m = $('laneMoveMsg'), r = $('laneMoveRec'); if (m) m.textContent = st.msg; else if (r) { m = document.createElement('p'); m.className = 'mv-msg'; m.id = 'laneMoveMsg'; m.textContent = st.msg; r.appendChild(m); } }, 400);
    }
  }
  function start() {
    if (!on() || st.started) return; st.started = true;
    render(); document.addEventListener('click', click);
    hasLocal().then(function (h) { st.has = h; var ov = $('laneMoveOv'), bar = $('laneMoveBar'); if (ov) ov.remove(); if (bar) bar.remove(); render(); });
    // ページの組み立て直しで消えたら戻す（どのページでも必ず出す）
    if (window.MutationObserver) new MutationObserver(function () { if (!$('laneMoveOv') && !$('laneMoveBar')) render(); }).observe(document.body, { childList: true });
  }
  if (typeof document !== 'undefined' && on()) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start(); }
  return { start: start, render: render, newUrl: newUrl, hasLocal: hasLocal, on: on };
})();
