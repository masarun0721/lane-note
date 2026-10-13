/* ===== v0.24：顧問モード／選手モード（どちらで使うかを、この端末の localStorage にだけ覚える。ログイン不要）
   ・顧問モード＝今までの全部の機能
   ・選手モード＝自分の予定・自己ベスト・体調メモ・自分の記録・もらったリンクをまとめた、かんたんな画面
   ・共有リンク（#p= / #d= / ?s= / ?t=）を開いたときは、モードに関係なくそのページを出す */
var LaneMode = (function () {
  'use strict';
  var KEY = 'lanenote.mode.v1', PKEY = 'lanenote.player.v1.';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function get() { try { var v = localStorage.getItem(KEY); return v === 'coach' || v === 'player' ? v : ''; } catch (e) { return ''; } }
  function set(m) { try { if (m === 'coach' || m === 'player') localStorage.setItem(KEY, m); } catch (e) { } }
  // v0.26.20：招待リンク（team.html#join=）で来た人には、はじめてのモードの質問を出さない（参加の画面を先に）
  function inviteView() { if (!document.body.classList.contains('team-page')) return false; if (/^#join=/.test(location.hash)) return true; try { return !!sessionStorage.getItem('lanenote.join.v1'); } catch (e) { return false; } }
  function sharedView() { return /^#[dpt]=/.test(location.hash) || /[?&][st]=/.test(location.search); }
  function base() { return /^https?:$/.test(location.protocol) ? location.origin + location.pathname.replace(/[^\/]*$/, '') : (window.LANE_SHARE_BASE || './'); }
  /* この端末に保存されている、もらったリンク（大会当日の予定＝p・個人ページ＝pp） */
  function savedLinks() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i); if (!k || k.indexOf(PKEY) !== 0) continue;
        var v = null; try { v = JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { }
        if (!v || typeof v.p !== 'string') continue;
        if (v.exp && v.exp < Date.now()) continue;
        var id = k.slice(PKEY.length), short = /^[A-Za-z0-9]{10}$/.test(id);
        out.push({ id: id, kind: v.kind === 'pp' ? 'pp' : 'p', p: v.p, at: v.at || '', exp: v.exp || null, url: short ? base() + '?s=' + id : base() + '#p=' + v.p });
      }
    } catch (e) { }
    return out.sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
  }
  /* C306：共用のスマホ向け。選手モードで保存したものを全部消す */
  function wipeDevice() {
    if (window.LaneTalk) LaneTalk.clearDevice();   // R253：読み込み中のやり取りを無効にしてから消す
    try { var ks = []; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && (k.indexOf(PKEY) === 0 || k === 'lanenote.talks.v1' || k === 'lanenote.talksent.v1' || k === 'lanenote.cond.v1')) ks.push(k); } ks.forEach(function (k) { localStorage.removeItem(k); }); } catch (e) { }
  }
  function forget(id) { try { localStorage.removeItem(PKEY + id); } catch (e) { } }
  function dayOf(s) { var m = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(String(s || '').normalize('NFKC')); return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : ''; }
  function today() { var d = window.__playerNow ? new Date(window.__playerNow) : new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  /* ---------- 画面の切りかえ ---------- */
  function apply() {
    var m = get(), pl = m === 'player' && !sharedView() && !!$('phome');
    document.body.classList.toggle('ln-player', pl);
    var sw = $('modeSw'); if (sw) sw.innerHTML = m === 'player' ? '👟 選手モード<small>切りかえ</small>' : m === 'coach' ? '🧑‍🏫 顧問モード<small>切りかえ</small>' : '👤 モードを選ぶ';
    if ($('phome')) { $('phome').hidden = !pl; if (pl) renderHome(); }
  }
  function choose(m) {
    var was = get(); set(m); $('modePick').hidden = true; document.body.classList.remove('mp-open');
    // v0.24.1：大会準備以外のページで選手モードにしたら、選手モードのホーム（トップ）へ移る
    if (m === 'player' && !$('phome')) { location.href = 'index.html'; return; }
    apply(); if (m !== was) window.scrollTo(0, 0);
  }
  function openPick(first) {
    var d = $('modePick'); d.hidden = false; document.body.classList.add('mp-open');
    $('mpFirst').hidden = !first; $('mpClose').hidden = !!first;
    var cur = get(); d.querySelectorAll('[data-mode]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-mode') === cur); b.setAttribute('aria-pressed', b.getAttribute('data-mode') === cur); });
    var f = d.querySelector('[data-mode]'); if (f) f.focus();
  }

  /* ---------- 選手モードのホーム ---------- */
  var GEN = 0;
  async function renderHome() {
    var gen = ++GEN, box = $('phBody'); if (!box) return;
    var app = window.__meetApp, links = savedLinks(), meets = [], pps = [];
    for (var i = 0; i < links.length; i++) {
      try { var o = await app.decodePayload(links[i].p); if (gen !== GEN) return;
        if (links[i].kind === 'pp' && o.k === 'pp') pps.push({ L: links[i], o: o }); else if (o.k === 'p') meets.push({ L: links[i], o: o, day: dayOf(o.d) });
      } catch (e) { }
    }
    if (gen !== GEN) return;
    var td = today(), up = meets.filter(function (m) { return !m.day || m.day >= td; }).sort(function (a, b) { return (a.day || '9') < (b.day || '9') ? -1 : 1; });
    var h = '';
    // 1 次の大会
    h += '<section class="ph-card"><h3>📅 次の大会の予定・招集</h3>';
    if (up.length) {
      var n = up[0], items = PlayerLogic.autoItems(n.o).filter(function (x) { return x.t && !x.tent; }), call = items.filter(function (x) { return x.kind === 'call'; })[0], race = items.filter(function (x) { return x.kind === 'race'; })[0];
      h += '<a class="ph-next" href="' + esc(n.L.url) + '"><span class="ph-meet">' + esc(n.o.n || '大会') + '</span><span class="ph-date">' + esc([n.o.d, n.o.pl].filter(Boolean).join('・')) + '</span>' +
        '<span class="ph-times">' + (call ? '<span><small>最初の招集</small><b>' + esc(call.t) + '</b><em>' + esc(call.label) + '</em></span>' : '') + (race ? '<span><small>最初の競技</small><b>' + esc(race.t) + '</b><em>' + esc(race.label) + '</em></span>' : '') + '</span><span class="ph-open">予定を開く →</span></a>';
      if (up.length > 1) h += '<ul class="ph-list">' + up.slice(1, 6).map(function (m) { return '<li><a href="' + esc(m.L.url) + '">' + esc(m.o.n || '大会') + '<small>' + esc(m.o.d || '') + '</small></a></li>'; }).join('') + '</ul>';
    } else h += '<p class="ph-empty">まだありません。先生から「大会当日の予定」のリンクをもらって開くと、ここに出ます。</p>';
    h += '</section>';
    // 2 自己ベスト
    h += '<section class="ph-card"><h3>🏅 自己ベスト・グラフ</h3>';
    if (pps.length) {
      var p = pps[0];
      h += '<p class="ph-sub">' + esc(p.o.a.name) + ' さん・' + esc(LanePersonal.snapLabel(p.o.g)) + '時点</p><ul class="ph-pbs">' + p.o.e.slice(0, 8).map(function (e) { var b = e.b || e.rf; return '<li><span>' + esc(e.l) + '</span><b>' + esc(b ? b[0] : '—') + '</b></li>'; }).join('') + '</ul>' +
        '<a class="ph-btn" href="' + esc(p.L.url) + '">📈 グラフと最近の記録を見る</a>';
    } else h += '<p class="ph-empty">まだありません。先生から「個人ページ」のリンクをもらって開くと、ここに出ます。自分で記録をつけるなら、下の「自分の記録をつける」へ。</p>';
    h += '</section>';
    // 3 先生とのやり取り（先生がオンにしているときだけ。LaneTalk が中身を入れる）
    h += '<section class="ph-card" id="phTalk" hidden></section>';
    // 4 体調メモ
    h += '<section class="ph-card"><h3>📝 体調メモ</h3><div id="phCond">' + LanePersonal.condFormHtml(td, '今日の体調') + '</div>' +
      (LanePersonal.cList().length ? '<ul class="ph-cdlist">' + LanePersonal.cList().slice(0, 5).map(function (x) { return '<li><b>' + esc(LanePersonal.mdLabel(x.d)) + '</b> ' + LanePersonal.condBadge(x.c) + '</li>'; }).join('') + '</ul>' : '') + '</section>';
    // 5 自分の記録
    h += '<section class="ph-card"><h3>📒 自分の記録をつける</h3><p class="ph-sub">大会の結果PDFやWebページから、自分の記録だけを取り込みます（「個人で使う」）。ログインしなくても、このスマホに保存できます。</p><a class="ph-btn" href="records.html?me=1">📒 自分の記録をつける・見る</a></section>';
    // 6 もらったリンク
    h += '<section class="ph-card"><h3>🔗 もらったリンク</h3>' + (links.length ? '<ul class="ph-links">' + links.map(function (L) {
      var o = (pps.concat(meets).filter(function (x) { return x.L.id === L.id; })[0] || {}).o || {};
      var t = L.kind === 'pp' ? '🏅 個人ページ' + (o.a ? '（' + o.a.name + '）' : '') : '📅 ' + (o.n || '大会当日の予定') + (o.d ? '（' + o.d + '）' : '');
      return '<li><a href="' + esc(L.url) + '">' + esc(t) + '</a><button type="button" class="ph-x" data-phforget="' + esc(L.id) + '" aria-label="このリンクをスマホから削除">削除</button></li>'; }).join('') + '</ul>' : '<p class="ph-empty">先生からもらったリンクは、一度開くと自動でここに保存されます。</p>') +
      '<div class="ph-paste"><input type="url" id="phUrl" placeholder="もらったリンクをここに貼る" aria-label="もらったリンク"><button type="button" class="ph-btn sm" id="phGo">開いて保存</button></div><div class="ph-msg" id="phMsg" role="status"></div></section>';
    h += '<p class="ph-foot">🔒 この画面の内容は、このスマホの中だけに保存しています。<br><button type="button" class="ph-link danger" id="phWipe">🗑 この端末から全部消す（共用のスマホを返す前に）</button><br><button type="button" class="ph-link" data-pickmode="1">🧑‍🏫 顧問・コーチの画面に切りかえる</button></p>';
    box.innerHTML = h;
    LanePersonal.bindCond($('phCond'), function () { });
    box.querySelectorAll('[data-phforget]').forEach(function (b) { b.addEventListener('click', function () { if (!confirm('このリンクを、このスマホから削除しますか？（もう一度開けば、また保存されます）')) return; forget(b.getAttribute('data-phforget')); renderHome(); }); });
    $('phWipe').addEventListener('click', function () {
      if (!confirm('このスマホに保存している、もらったリンク・個人ページ・先生とのやり取りのリンク・体調メモを全部消します。元に戻せません。よろしいですか？')) return;
      wipeDevice(); renderHome();
      var m = $('phMsg'); if (m) m.textContent = '✔ このスマホから全部消しました。';
    });
    $('phGo').addEventListener('click', function () {
      var u = $('phUrl').value.trim(), m = /^https?:\/\/[^\s]+$/.test(u) ? u : '';
      var ok = m && (u.indexOf(base()) === 0 || /^https:\/\/masarun0721\.github\.io\/lane-note\//.test(u)) && (/[#](p|d)=/.test(u) || /[?&](s|t)=/.test(u));
      if (!ok) { $('phMsg').textContent = 'LANE NOTE のリンク（先生からもらったもの）を貼ってください。'; return; }
      location.href = u.indexOf(base()) === 0 ? u : base() + u.replace(/^https:\/\/masarun0721\.github\.io\/lane-note\//, '');
    });
    if (window.LaneTalk) LaneTalk.renderHomeCard($('phTalk'), []);   // v0.25（C302）：個人ページの tk は使わない
  }
  function init() {
    if (!$('modePick')) return;
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-mode]'); if (b && b.closest('#modePick')) { choose(b.getAttribute('data-mode')); return; }
      if (e.target.closest('[data-pickmode]') || e.target.closest('#modeSw')) { openPick(false); return; }
      if (e.target.closest('#mpClose')) { $('modePick').hidden = true; document.body.classList.remove('mp-open'); }
    });
    window.addEventListener('hashchange', apply);
    if (($('phome') || document.body.classList.contains('records')) && !get() && !sharedView() && !inviteView()) openPick(true);   // はじめての質問はトップ（v0.25.8 から記録のページ）と大会準備だけ
    apply();
  }
  return { get: get, set: set, apply: apply, init: init, savedLinks: savedLinks, sharedView: sharedView, renderHome: renderHome, KEY: KEY, wipeDevice: wipeDevice };
})();
