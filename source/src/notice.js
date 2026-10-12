/* v0.22 保護者へのお知らせ（文書づくり）。AIは使わない：ひな形の文章に、読み込んだ資料から見つけた値を差し込むだけ。
   ・ひな形（学校の設定＝毎回同じ）と、この大会だけの値（大会名・日付・競技場・集合時刻など）に分ける。
   ・レイアウトは3つ（標準／表中心／すっきり）。どれも白黒・A4 1枚に収める（文字と余白を自動で小さくする）。
   ・Word（.docx）も作る（JSZip で OOXML をまとめる）。 */
var LaneNotice = (function () {
  'use strict';
  var nk = function (s) { return String(s == null ? '' : s).normalize('NFKC'); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  var MIN_FS = 8, MAX_STR = 2000;
  var SEC_LABEL = { header: '宛先・日付・学校・クラブ名', title: 'タイトル', greeting: 'あいさつ', points: '要点（日にち・競技場・集合など）', belongings: '持ち物', cautions: 'その他注意事項', contact: '連絡先', athletes: '出場選手表', schedule: '時間順の予定', free: '自由欄' };
  function defaults() {
    return {
      v: 2, layout: 'std', font: 'gothic', accent: 'navy', mono: false, size: 10.5, fit: true, era: 'wareki',
      school: '', club: '陸上競技部', advisors: [], to: '保護者各位', title: '{大会名}について', place: '競技場 正門前',
      greeting: '日頃より陸上競技部の活動にご理解とご協力をいただき、ありがとうございます。\n先日の大会では、温かいご声援をありがとうございました。\nさて、下記のとおり{大会名}に出場いたします。お忙しいところ恐縮ですが、ご確認をお願いいたします。',
      points: [{ k: 'date', label: '日にち', on: true }, { k: 'venue', label: '競技場', on: true }, { k: 'station', label: '最寄り駅', on: true }, { k: 'gate', label: '開門', on: false }, { k: 'gather', label: '集合', on: true }, { k: 'dismiss', label: '解散予定', on: true }, { k: 'fare', label: '交通費', on: true }, { k: 'address', label: '住所', on: false }, { k: 'phone', label: '電話', on: false }],
      fareInBelongings: false,
      belongings: { items: ['ユニフォーム', 'ナンバーカード（ゼッケン）', 'スパイク', '安全ピン', '弁当', '水筒・飲み物', 'タオル', '着替え', '雨具', '保険証のコピー'], note: '※ 貴重品は各自で管理してください。' },
      cautions: ['会場までは公共交通機関を利用し、車内では他の利用者の迷惑にならないようにしてください。', '欠席・遅刻の場合は、当日朝 7:00 までに顧問へ連絡してください。', '体調がすぐれない場合は無理をせず、早めに相談してください。', '会場ではごみを各自持ち帰ってください。', '保護者の方の観戦は、スタンドのみとなります。'],
      contact: ['当日の連絡先：顧問 携帯 000-0000-0000'],
      venues: [],
      table: { grade: true, split: true },
      call: { base: 'first', h: 2, m: 0 }, dismiss: { on: true, h: 0, m: 30 },
      sections: ['header', 'title', 'greeting', 'points', 'belongings', 'cautions', 'contact', 'athletes', 'schedule'].map(function (t) { return { id: t, type: t, on: t !== 'athletes' }; })
    };
  }
  // 保存しておいたひな形を、決まった形・長さに作り直す（壊れた・古いデータでも動くように）
  function sanitize(o) {
    var d = defaults(); if (!o || typeof o !== 'object') return d;
    var str = function (v, def, n) { return typeof v === 'string' ? v.slice(0, n || MAX_STR) : def; };
    var list = function (v, def, n) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }).slice(0, n || 40).map(function (x) { return x.slice(0, 400); }) : def; };
    var num = function (v, def, lo, hi) { v = +v; return isFinite(v) && v >= lo && v <= hi ? v : def; };
    var t = {
      v: 2, layout: ['std', 'table', 'clean'].indexOf(o.layout) >= 0 ? o.layout : d.layout, font: o.font === 'mincho' ? 'mincho' : 'gothic', accent: ACCENT[o.accent] ? o.accent : 'navy', mono: o.mono === true, size: num(o.size, d.size, 8, 14), fit: o.fit !== false, era: o.era === 'seireki' ? 'seireki' : 'wareki',
      school: str(o.school, d.school, 60), club: str(o.club, d.club, 40), advisors: list(o.advisors, d.advisors, 6), to: str(o.to, d.to, 60), title: str(o.title, d.title, 100), place: str(o.place, d.place, 60),
      greeting: str(o.greeting, d.greeting),
      points: d.points.map(function (p) { var q = Array.isArray(o.points) ? o.points.filter(function (x) { return x && x.k === p.k; })[0] : null; return { k: p.k, label: q ? str(q.label, p.label, 20) : p.label, on: q ? q.on !== false : p.on }; }),
      belongings: { items: list(o.belongings && o.belongings.items, d.belongings.items), note: str(o.belongings && o.belongings.note, d.belongings.note, 300) },
      cautions: list(o.cautions, d.cautions), contact: list(o.contact, d.contact, 10),
      fareInBelongings: o.fareInBelongings === true,
      venues: (Array.isArray(o.venues) ? o.venues : []).slice(0, 50).filter(function (v) { return v && typeof v === 'object' && typeof v.name === 'string' && v.name.trim(); }).map(function (v) { var r = {}; VENUE_KEYS.forEach(function (k) { r[k] = str(v[k], '', k === 'memo' ? 300 : 120); }); return r; }),
      table: { grade: !(o.table && o.table.grade === false), split: !(o.table && o.table.split === false) },
      call: { base: o.call && ['first', 'start', 'gate'].indexOf(o.call.base) >= 0 ? o.call.base : 'first', h: num(o.call && o.call.h, 2, 0, 6), m: num(o.call && o.call.m, 0, 0, 59) },
      dismiss: { on: !(o.dismiss && o.dismiss.on === false), h: num(o.dismiss && o.dismiss.h, 0, 0, 6), m: num(o.dismiss && o.dismiss.m, 30, 0, 59) },
      sections: []
    };
    var seen = {};
    (Array.isArray(o.sections) ? o.sections : []).slice(0, 40).forEach(function (s) {
      if (!s || typeof s !== 'object') return;
      if (s.type === 'free') { var id = 'f' + String(s.id || '').replace(/\W/g, '').slice(0, 12); if (seen[id]) return; seen[id] = 1; t.sections.push({ id: id, type: 'free', on: s.on !== false, title: str(s.title, '', 60), text: str(s.text, '') }); }
      else if (SEC_LABEL[s.type] && !seen[s.type]) { seen[s.type] = 1; t.sections.push({ id: s.type, type: s.type, on: s.on !== false && !(s.type === 'athletes' && !(o.v >= 2)) }); }   // v0.22.2：出場選手表ははじめは出さない（前の版のひな形も）
    });
    d.sections.forEach(function (s) { if (!seen[s.type]) t.sections.push(s); });   // 新しく増えた欄は最後に
    return t;
  }
  /* ---------- 競技場リスト（学校の設定に保存。はじめは空：駅などのデータは作らない） ---------- */
  var VENUE_KEYS = ['name', 'address', 'phone', 'station', 'access', 'place', 'memo', 'route', 'fareOne', 'fareRound', 'fareNote'];
  // 交通費の1行：保存した金額だけを使う（運賃を調べたり推測したりはしない）
  function fareText(v) {
    if (!v) return '';
    var yen = function (x) { x = nk(x).replace(/[^\d]/g, ''); return x ? Number(x).toLocaleString('ja-JP') + '円' : ''; };
    var r = yen(v.fareRound), o = yen(v.fareOne), amt = r ? '往復' + r + '程度' : o ? '片道' + o + '程度' : '';
    if (!amt) return '';
    return amt + (v.route ? '（' + nk(v.route).trim() + '）' : '') + (v.fareNote ? '　' + v.fareNote.trim() : '');
  }
  function vnorm(s) { return nk(s).replace(/[\s　・･\-－ー]/g, '').toLowerCase(); }
  // 要項の競技場名と、保存した競技場（名前の一部でも）を突き合わせる
  function findVenue(T, name) {
    var n = vnorm(name); if (n.length < 2) return -1;
    for (var i = 0; i < T.venues.length; i++) { var v = vnorm(T.venues[i].name); if (v.length >= 2 && (v === n || n.indexOf(v) >= 0 || v.indexOf(n) >= 0)) return i; }
    return -1;
  }
  /* ---------- 日付・時刻 ---------- */
  function parseDate(s) {
    s = nk(s).replace(/\s+/g, '');
    var m = s.match(/(20\d\d)[年\/.-](\d{1,2})[月\/.-](\d{1,2})/); if (m) return { y: +m[1], m: +m[2], d: +m[3] };
    m = s.match(/令和(\d+|元)年(\d{1,2})月(\d{1,2})日/); if (m) return { y: 2018 + (m[1] === '元' ? 1 : +m[1]), m: +m[2], d: +m[3] };
    return null;
  }
  function fmtDate(p, era, noWd) {
    if (!p) return '';
    var w = WD[new Date(p.y, p.m - 1, p.d).getDay()];
    return (era === 'seireki' ? p.y + '年' : '令和' + (p.y - 2018 === 1 ? '元' : p.y - 2018) + '年') + p.m + '月' + p.d + '日' + (noWd ? '' : '（' + w + '）');
  }
  function toMin(t) { var m = nk(t).match(/(\d{1,2})[:：時](\d{2})?/); return m ? +m[1] * 60 + (+m[2] || 0) : null; }
  function fmtMin(n) { if (n == null || !isFinite(n)) return ''; n = ((n % 1440) + 1440) % 1440; return Math.floor(n / 60) + ':' + ('0' + n % 60).slice(-2); }
  /* ---------- 資料から見つける（見つからなければ空。推測はしない） ---------- */
  var SRC_NAME = { yoko: '大会要項', note: '競技注意事項', tt: 'タイムテーブル', sl: 'スタートリスト' };
  function extract(docs) {
    var out = {}, order = ['yoko', 'note', 'tt', 'sl'];
    var pats = {
      venue: [/(?:^|\n|[\d.．、)）]\s*)(?:会\s*場|場\s*所|競\s*技\s*場)\s*[:：]?\s*([^\s〒(（:：]{2,30})/, /(?:会\s*場|場\s*所|競\s*技\s*場)\s*[:：]?\s*([^\s:：、。()（）]{2,24}(?:陸上競技場|競技場|スタジアム|フィールド|総合運動場))/, /([一-龯ァ-ヶーA-Za-z0-9・]{2,20}(?:陸上競技場|スタジアム))/],
      station: [/最寄り?駅\s*[:：]?\s*([^\s、。:：]{1,15}駅)/, /([一-龯ァ-ヶーぁ-ん]{1,12}駅)\s*(?:から|より|下車|徒歩|[東西南北]口)/],
      address: [/(〒\s*\d{3}-?\d{4}\s*[^\s]+)/],
      phone: [/(?:電\s*話|TEL|Tel|tel)\s*[:：.]?\s*(0\d{1,4}-\d{1,4}-\d{3,4})/],
      date: [/期\s*日\s*[:：]?\s*((?:20\d\d|令和\s*(?:\d+|元))\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)/],
      gate: [/開\s*門\s*(?:時\s*刻)?\s*[:：]?\s*(?:は)?\s*(\d{1,2}\s*[:：時]\s*\d{0,2})/],
      reception: [/受\s*付\s*(?:開\s*始)?\s*(?:時\s*刻)?\s*[:：]?\s*(\d{1,2}\s*[:：時]\s*\d{0,2})/],
      start: [/(\d{1,2}\s*[:：時]\s*\d{2})\s*分?\s*(?:から)?\s*競\s*技\s*開\s*始/, /競\s*技\s*開\s*始\s*(?:時\s*刻)?\s*[:：]?\s*(\d{1,2}\s*[:：時]\s*\d{0,2})/]
    };
    Object.keys(pats).forEach(function (k) {
      for (var i = 0; i < order.length && !out[k]; i++) {
        var txt = nk(docs && docs[order[i]] || ''); if (!txt) continue;
        for (var j = 0; j < pats[k].length; j++) {
          var m = txt.match(pats[k][j]); if (!m) continue;
          var v = k === 'address' ? m[1].replace(/〒\s*/, '〒').replace(/(\d{4})\s*/, '$1 ') : m[1].replace(/\s+/g, ''); if (/gate|reception|start/.test(k)) { var mm = toMin(v); if (mm == null || mm < 300 || mm > 1200) continue; v = fmtMin(mm); }
          out[k] = { v: v, src: SRC_NAME[order[i]] }; break;
        }
      }
    });
    return out;
  }
  // 集合・解散の時刻（base の時刻から h 時間 m 分前／後）
  function gatherTime(rule, t) { var b = rule.base === 'start' ? t.start : rule.base === 'gate' ? t.gate : t.first; var n = toMin(b); return n == null ? '' : fmtMin(n - rule.h * 60 - rule.m); }
  function dismissTime(rule, t) { var n = toMin(t.last); return !rule.on || n == null ? '' : fmtMin(n + rule.h * 60 + rule.m); }
  function vars(T, M) {
    return { '大会名': M.name || '', '日付': M.date || '', '競技場': M.venue || '', '最寄り駅': M.station || '', '集合時刻': M.gather || '', '集合場所': M.place || T.place || '', '交通費': M.fare || '', '解散予定': M.dismiss || '', '開門': M.gate || '', '学校名': T.school || '', '部活名': T.club || '' };
  }
  function fill(s, V) { return String(s || '').replace(/\{([^{}]{1,10})\}/g, function (a, k) { return Object.prototype.hasOwnProperty.call(V, k) ? V[k] : a; }); }
  function belItems(T, M, V) { var a = T.belongings.items.filter(Boolean).map(function (x) { return fill(x, V); }); if (T.fareInBelongings && M.fare) a.push('交通費（' + M.fare + '）'); return a; }
  function pointRows(T, M) {
    var place = M.place || T.place;
    var val = { fare: [M.fare], date: [M.date], venue: [M.venue], address: [M.address], phone: [M.phone], station: [M.station, M.access || ''], gate: [M.gate], gather: [M.gather, place], dismiss: [M.dismiss, M.dismiss ? 'ごろ（予定）' : ''] };
    return T.points.filter(function (p) { return p.on && !(p.k === 'fare' && !M.fare); }).map(function (p) { var v = val[p.k] || ['']; return { k: p.k, label: p.label, main: v[0] || '', sub: v[1] || '', big: /gather|dismiss|gate/.test(p.k) && /^\d{1,2}:\d{2}$/.test(v[0] || ''), value: [v[0], v[1]].filter(Boolean).join('　') }; });
  }
  /* ---------- 文書（HTML）：プレビュー・印刷・PDF ---------- */
  var FONT = { gothic: '"Noto Sans JP","Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic UI","游ゴシック","Yu Gothic","Meiryo","Noto Sans CJK JP",sans-serif', mincho: '"游明朝","Yu Mincho","ＭＳ 明朝","MS Mincho","Hiragino Mincho ProN","Noto Serif CJK JP",serif' };
  var ACCENT = { navy: '#1f3a68', red: '#c8452b', green: '#2e7d4f', teal: '#0f6e7a', purple: '#5b3f8c', black: '#222222' };
  var ACCENT_NAME = { navy: '紺', red: '赤', green: '緑', teal: '青緑', purple: '紫', black: '黒' };
  function tint(hex, a) { var n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(function (v) { return Math.round(v + (255 - v) * a); }); return '#' + c.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join(''); }
  function colors(T) { var a = T.mono ? '#000000' : ACCENT[T.accent] || ACCENT.navy; return { a: a, soft: T.mono ? '#efefef' : tint(a, .9), zebra: T.mono ? '#f4f4f4' : tint(a, .95), line: T.mono ? '#9a9a9a' : tint(a, .6) }; }
  // 白黒でもカラーでも分かる線画アイコン（色は文字色にあわせる）
  var ICON = {
    date: '<path d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5"/>', venue: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    station: '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 11h12M9 21l2-4M15 21l-2-4"/><circle cx="9" cy="14" r=".6"/><circle cx="15" cy="14" r=".6"/>',
    gate: '<path d="M4 21V9l8-5 8 5v12M9 21v-7h6v7"/>', fare: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/>', gather: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>', dismiss: '<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>'
  };
  function icon(k) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (ICON[k] || '') + '</svg>'; }
  function tableHtml(g, cls) {
    if (!g || !g.body.length) return '<p class="muted">（該当なし）</p>';
    var h = '<table class="nt-t ' + (cls || '') + '"><thead>';
    if (g.caps) h += '<tr class="cap">' + g.caps.map(function (c, i) { return '<th colspan="' + g.ncol + '"' + (i ? ' class="dv"' : '') + '>' + esc(c) + '</th>'; }).join('') + '</tr>';
    h += '<tr>' + g.head.map(function (s, i) { return '<th' + (g.split && i === g.ncol ? ' class="dv"' : '') + '>' + esc(s) + '</th>'; }).join('') + '</tr></thead><tbody>';
    h += g.body.map(function (r, ri) { return '<tr' + (g.tent && g.tent[ri] ? ' class="tent"' : '') + '>' + r.map(function (c, i) { return '<td class="' + (g.split && i === g.ncol ? 'dv ' : '') + (/^(時刻|招集|学年|リレー)$/.test(g.head[i]) ? 'c' : '') + (g.head[i] === '時刻' ? ' tm' : '') + '">' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('');
    return h + '</tbody></table>';
  }
  function nl2p(s) { return String(s || '').split(/\n/).map(function (l) { return '<p>' + (esc(l) || '&nbsp;') + '</p>'; }).join(''); }
  function sectionHtml(s, T, M, tables, V) {
    var L = T.layout, head = function (t) { return '<h2><span>' + esc(t) + '</span></h2>'; };
    switch (s.type) {
      case 'header':
        return '<div class="nt-hd"><div class="to">' + esc(T.to) + '</div><div class="from"><span>' + esc(M.docDate || '') + '</span><span>' + esc([T.school, T.club].filter(Boolean).join('　')) + '</span>' + (T.advisors.length ? '<span>顧問　' + esc(T.advisors.join('・')) + '</span>' : '') + '</div></div>';
      case 'title':
        var chips = [['date', M.date], ['venue', M.venue]].filter(function (c) { return c[1]; }).map(function (c) { return '<span class="chip">' + icon(c[0]) + esc(c[1]) + '</span>'; }).join('');
        return '<div class="band"><div class="kick">' + esc([T.school, T.club].filter(Boolean).join('　') || 'お知らせ') + '</div><h1>' + esc(fill(T.title, V)) + '</h1>' + (chips ? '<div class="chips">' + chips + '</div>' : '') + '</div>';
      case 'greeting': return '<div class="nt-gr">' + nl2p(fill(T.greeting, V)) + '</div>';
      case 'points':
        var pr = pointRows(T, M);
        if (L === 'clean') return '<dl class="nt-dl">' + pr.map(function (r) { return '<div><dt>' + esc(r.label) + '</dt><dd' + (r.big ? ' class="big"' : '') + '>' + esc(r.main || '—') + (r.sub ? '<small>' + esc(r.sub) + '</small>' : '') + '</dd></div>'; }).join('') + '</dl>';
        return '<div class="cards n' + pr.length + '">' + pr.map(function (r) { return '<div class="card k-' + r.k + (r.big ? ' big' : '') + '"><div class="cl">' + icon(r.k) + esc(r.label) + '</div><div class="cv">' + (esc(r.main) || '<span class="muted">—</span>') + '</div>' + (r.sub ? '<div class="cs">' + esc(r.sub) + '</div>' : '') + '</div>'; }).join('') + '</div>';
      case 'belongings':
        var it = belItems(T, M, V);
        return head('持ち物') + '<ul class="chk">' + it.map(function (x) { return '<li><i></i>' + esc(x) + '</li>'; }).join('') + '</ul>' + (T.belongings.note ? '<p class="note">' + esc(fill(T.belongings.note, V)) + '</p>' : '');
      case 'cautions':
        return head('注意事項') + '<ol class="num">' + T.cautions.filter(Boolean).map(function (x, i) { return '<li><b>' + (i + 1) + '</b><span>' + esc(fill(x, V)) + '</span></li>'; }).join('') + '</ol>';
      case 'contact': return head('連絡先') + '<div class="nt-ct">' + T.contact.filter(Boolean).map(function (x) { return '<p>' + esc(fill(x, V)) + '</p>'; }).join('') + '</div>';
      case 'athletes': return head('出場選手') + tableHtml(tables.ath, 'ath');
      case 'schedule': return head('時間順の予定') + tableHtml(tables.time, 'time') + '<p class="note">※ 時刻は予定です。当日の進行により前後します。斜体は「通過したら」の予定です。</p>';
      case 'free': return (s.title ? head(fill(s.title, V)) : '') + '<div class="nt-fr">' + nl2p(fill(s.text, V)) + '</div>';
    }
    return '';
  }
  function css(T) {
    var C = colors(T);
    return '@page{size:A4 portrait;margin:11mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}html{background:#fff}' +
      'body{margin:0 auto;width:188mm;color:#1a1d24;background:#fff;font-family:' + FONT[T.font] + ';font-size:var(--fs,' + T.size + 'pt);line-height:calc(1.5 * var(--lh,1));--sp:1;--a:' + C.a + ';--soft:' + C.soft + ';--zebra:' + C.zebra + ';--line:' + C.line + ';display:flex;flex-direction:column}' +
      'p{margin:0}.sec{margin:0 0 calc(3.4mm * var(--sp))}.muted{color:#777}svg.ic{width:1.15em;height:1.15em;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;vertical-align:-.2em;margin-right:.35em;flex:none}' +
      '.nt-hd{display:flex;justify-content:space-between;align-items:flex-end;gap:6mm;font-size:.9em;color:#444}.nt-hd .to{font-size:1.1em;font-weight:700;color:#1a1d24}.nt-hd .from{display:flex;flex-direction:column;align-items:flex-end}' +
      '.band{background:var(--a);color:#fff;border-radius:3mm;padding:calc(4mm * var(--sp) + 1mm) 6mm calc(3.5mm * var(--sp) + 1mm)}.band .kick{font-size:.85em;letter-spacing:.12em;opacity:.85;font-weight:700}' +
      'h1{font-size:1.85em;line-height:1.3;margin:.6mm 0 0;font-weight:800;letter-spacing:.02em}.chips{display:flex;flex-wrap:wrap;gap:2mm;margin-top:2.4mm}.chip{display:inline-flex;align-items:center;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.55);border-radius:99px;padding:.5mm 3mm;font-size:.92em;font-weight:700}' +
      '.nt-gr{color:#333}.nt-gr p{margin:0}' +
      'h2{font-size:1.06em;font-weight:800;margin:0 0 calc(1.6mm * var(--sp));display:flex;align-items:center;gap:2mm;color:#1a1d24}h2::before{content:"";width:1.3mm;height:1.1em;border-radius:1mm;background:var(--a)}h2::after{content:"";flex:1;height:1px;background:var(--line)}' +
      '.cards{display:grid;grid-template-columns:repeat(6,1fr);gap:2.4mm}.card{grid-column:span 2}.card.big{grid-column:span 3}.card{border:1px solid var(--line);border-radius:2.5mm;padding:calc(1.6mm * var(--sp) + .6mm) 3mm;background:#fff;min-width:0}.card .cl{display:flex;align-items:center;font-size:.82em;font-weight:700;color:var(--a);letter-spacing:.04em}' +
      '.card .cv{font-size:1.18em;font-weight:800;line-height:1.3;overflow-wrap:anywhere}.card.big .cv{font-size:1.9em;letter-spacing:.01em;font-feature-settings:"tnum"}.card .cs{font-size:.85em;color:#555}.card.big{background:var(--soft);border-color:var(--a)}' +
      '.chk{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:.6mm 3mm}.chk li{display:flex;align-items:center;gap:1.6mm}.chk i{width:.9em;height:.9em;border:1.3px solid #333;border-radius:.4mm;flex:none}' +
      '.note{font-size:.86em;color:#555;margin-top:.8mm}.num{list-style:none;margin:0;padding:0}.num li{display:flex;gap:2mm;margin:0 0 calc(.8mm * var(--sp))}.num b{flex:none;width:1.45em;height:1.45em;border-radius:50%;background:var(--a);color:#fff;font-size:.78em;display:flex;align-items:center;justify-content:center;margin-top:.15em}' +
      '.nt-t{width:100%;border-collapse:separate;border-spacing:0;font-size:.9em;line-height:calc(1.3 * var(--lh,1));border:1px solid var(--line);border-radius:2mm;overflow:hidden}.nt-t th,.nt-t td{padding:calc(.45mm * var(--sp) + .25mm) 1.6mm;vertical-align:top;border-bottom:1px solid #e3e6eb}' +
      '.nt-t thead th{background:var(--soft);color:#1a1d24;font-weight:800;text-align:left;border-bottom:1.5px solid var(--a)}.nt-t tr.cap th{background:var(--a);color:#fff;text-align:center;border-bottom:0}.nt-t tbody tr:nth-child(even) td{background:var(--zebra)}.nt-t tbody tr:last-child td{border-bottom:0}' +
      '.nt-t .c{text-align:center;white-space:nowrap}.nt-t .tm{font-weight:800}.nt-t .dv{border-left:1.5px solid var(--a)}.nt-t tr.tent td{font-style:italic;color:#555}' +
      '.duo{display:grid;grid-template-columns:1.05fr 1fr;gap:5mm}.duo>.sec{margin:0}.duo .chk{grid-template-columns:repeat(2,1fr)}' +
      '.foot{margin-top:auto;padding-top:2mm;display:flex;justify-content:space-between;font-size:.72em;color:#888;border-top:1px solid #e3e6eb}.foot b{color:var(--a);letter-spacing:.08em}' +
      // カード：各欄を角丸の枠に
      '.L-table .sec:not(.s-header):not(.s-title):not(.s-points):not(.duo){border:1px solid var(--line);border-radius:2.5mm;padding:calc(1.2mm * var(--sp) + .5mm) 2.6mm}.L-table .duo>.sec{border:1px solid var(--line);border-radius:2.5mm;padding:calc(1.2mm * var(--sp) + .5mm) 2.6mm}' +
      '.L-table .card.big .cv{font-size:2.2em}.L-table .card{border-width:1.5px}.L-table .band{border-radius:0 0 3mm 3mm}' +
      // ミニマル：帯なし・細い線・余白多め
      '.L-clean .band{background:none;color:#1a1d24;padding:0 0 2.5mm;border-radius:0;border-bottom:2.5px solid var(--a)}.L-clean .band .kick{color:var(--a);opacity:1}.L-clean h1{font-size:2em}.L-clean .chip{background:none;border-color:var(--line);color:#333}' +
      '.L-clean h2{font-size:.92em;letter-spacing:.14em;color:var(--a)}.L-clean h2::before{display:none}.L-clean .nt-dl{display:grid;grid-template-columns:repeat(3,1fr);margin:0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.L-clean .nt-dl>div{padding:1.4mm 2mm;border-right:1px solid #e3e6eb}.L-clean .nt-dl>div:nth-child(3n){border-right:0}' +
      '.L-clean dt{font-size:.78em;color:#666;letter-spacing:.06em}.L-clean dd{margin:0;font-weight:800;font-size:1.12em}.L-clean dd.big{font-size:1.6em;line-height:1.2}.L-clean dd small{display:block;font-weight:400;font-size:.75em;color:#555}.L-clean .nt-t{border-radius:0;border-left:0;border-right:0}.L-clean .num b{background:none;color:var(--a);border:1.5px solid var(--a)}' +
      '@media screen{html{background:#d9dde3}body{padding:11mm;width:210mm;min-height:297mm;box-shadow:0 1px 6px rgba(0,0,0,.3);margin:8px auto}}@media print{body{padding:0;min-height:274mm}}';
  }
  function bodyHtml(T, M, tables) {
    var V = vars(T, M), secs = T.sections.filter(function (s) { return s.on; }), out = [];
    for (var i = 0; i < secs.length; i++) {
      var s = secs[i], h = '<div class="sec s-' + s.type + '" data-sec="' + esc(s.id) + '">' + sectionHtml(s, T, M, tables, V) + '</div>';
      // 持ち物と注意事項が並んでいれば2列
      if (s.type === 'belongings' && secs[i + 1] && secs[i + 1].type === 'cautions') { h = '<div class="sec duo">' + h + '<div class="sec s-cautions" data-sec="cautions">' + sectionHtml(secs[i + 1], T, M, tables, V) + '</div></div>'; i++; }
      out.push(h);
    }
    out.push('<div class="foot"><span>' + esc([T.school, T.club].filter(Boolean).join('　')) + '</span><span>作成：<b>LANE NOTE</b></span></div>');
    return out.join('');
  }
  function docHtml(T, M, tables, fit) {
    var st = fit ? ' style="--fs:' + fit.fs + 'pt;--sp:' + fit.sp + ';--lh:' + fit.lh + '"' : '';
    return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(fill(T.title, vars(T, M))) + '</title><style>' + css(T) + '</style></head><body class="L-' + T.layout + (T.mono ? ' mono' : '') + '"' + st + '>' + bodyHtml(T, M, tables) + '</body></html>';
  }
  /* ---------- A4 1枚に収める（ブラウザの中で測る） ---------- */
  // doc：プレビューの iframe の document。印刷の中身の高さ（A4 297mm − 余白 24mm）に入るまで、余白→行間→文字の順に小さくする
  function fitDoc(doc, base) {
    var b = doc.body, probe = doc.createElement('div'); probe.style.cssText = 'position:absolute;visibility:hidden;height:273mm;width:186mm'; b.appendChild(probe);
    var limit = probe.getBoundingClientRect().height * 0.985; probe.remove();
    var prev = b.getAttribute('style') || ''; b.style.padding = '0'; b.style.minHeight = '0'; b.style.boxShadow = 'none'; b.style.width = '186mm';
    var h = function () { return b.scrollHeight; };
    var set = function (fs, sp, lh) { b.style.setProperty('--fs', fs + 'pt'); b.style.setProperty('--sp', sp); b.style.setProperty('--lh', lh); };
    var res = null, steps = [];
    [1, .8, .6, .45].forEach(function (sp) { steps.push([base, sp, 1]); });
    [.95, .9].forEach(function (lh) { steps.push([base, .45, lh]); });
    for (var fs = base - .25; fs >= MIN_FS - 1e-9; fs -= .25) steps.push([Math.round(fs * 100) / 100, .45, .9]);
    steps.push([MIN_FS, .3, .88], [MIN_FS, .15, .85]);   // いちばん小さい文字のまま、余白・行間をもう少しつめる
    for (var i = 0; i < steps.length; i++) { set.apply(null, steps[i]); if (h() <= limit) { res = { fs: steps[i][0], sp: steps[i][1], lh: steps[i][2], fits: true }; break; } }
    if (!res) {
      var over = Array.prototype.map.call(doc.querySelectorAll('[data-sec]'), function (e) { return { id: e.getAttribute('data-sec'), h: e.getBoundingClientRect().height }; }).sort(function (a, c) { return c.h - a.h; });
      res = { fs: MIN_FS, sp: .15, lh: .85, fits: false, over: over.slice(0, 3), ratio: h() / limit };
    }
    b.setAttribute('style', prev); set(res.fs, res.sp, res.lh);
    return res;
  }
  /* ---------- Word（.docx） ---------- */
  function x(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''); }
  function docxXml(T, M, tables, fs) {
    var V = vars(T, M), hp = Math.round(fs * 2), C = colors(T), hx = function (c) { return c.replace('#', '').toUpperCase(); };
    var A = hx(C.a), SOFT = hx(C.soft), ZB = hx(C.zebra), LN = hx(C.line);
    var font = T.font === 'mincho' ? '游明朝' : '游ゴシック', L = T.layout;
    var sp = function (a, sz, b) { return '<w:spacing w:before="' + (b || 0) + '" w:after="' + (a == null ? 40 : a) + '" w:line="' + Math.round((sz || hp) * 10 * 1.38) + '" w:lineRule="exact"/>'; };
    var run = function (t, o) { o = o || {}; return '<w:r><w:rPr>' + (o.b ? '<w:b/><w:bCs/>' : '') + (o.i ? '<w:i/>' : '') + (o.color ? '<w:color w:val="' + o.color + '"/>' : '') + (o.sz ? '<w:sz w:val="' + o.sz + '"/><w:szCs w:val="' + o.sz + '"/>' : '') + '</w:rPr><w:t xml:space="preserve">' + x(t) + '</w:t></w:r>'; };
    var p = function (runs, o) {
      o = o || {};
      var bd = o.bar ? '<w:pBdr><w:left w:val="single" w:sz="36" w:space="4" w:color="' + A + '"/></w:pBdr>' : o.under ? '<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="' + A + '"/></w:pBdr>' : '';
      return '<w:p><w:pPr>' + (o.num ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : '') + bd + (o.shd ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.shd + '"/>' : '') + sp(o.after, o.sz, o.before) + (o.ind ? '<w:ind w:left="' + o.ind + '"/>' : '') + (o.align ? '<w:jc w:val="' + o.align + '"/>' : '') + '</w:pPr>' + (typeof runs === 'string' ? run(runs, o) : runs.join('')) + '</w:p>';
    };
    var W = 10660;   // 本文の幅（A4 210mm − 余白 11mm×2 ≒ 188mm → twip）
    var bdr = function (v, c, sz) { return ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (k) { return '<w:' + k + ' w:val="' + v + '" w:sz="' + (sz || 4) + '" w:space="0" w:color="' + (c || LN) + '"/>'; }).join(''); };
    // rows: [{cells:[{xml|t, w, fill, span}], head}]  o: {widths, border:'none'|'line'|'grid', mar}
    var tbl = function (rows, o) {
      o = o || {}; var widths = o.widths, m = o.mar == null ? 60 : o.mar;
      var h = '<w:tbl><w:tblPr><w:tblW w:w="' + W + '" w:type="dxa"/><w:tblBorders>' + (o.border === 'none' ? bdr('nil') : o.border === 'grid' ? bdr('single', o.color, o.sz) : bdr('single', LN).replace(/<w:insideV[^>]*\/>/, '<w:insideV w:val="nil" w:sz="0" w:space="0" w:color="auto"/>')) + '</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="' + (o.vm || 20) + '" w:type="dxa"/><w:left w:w="' + m + '" w:type="dxa"/><w:bottom w:w="' + (o.vm || 20) + '" w:type="dxa"/><w:right w:w="' + m + '" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' + widths.map(function (w) { return '<w:gridCol w:w="' + w + '"/>'; }).join('') + '</w:tblGrid>';
      rows.forEach(function (r) {
        var ci = 0;
        h += '<w:tr>' + (r.head ? '<w:trPr><w:tblHeader/></w:trPr>' : '') + r.cells.map(function (c) {
          var w = 0; for (var k = 0; k < (c.span || 1); k++) w += widths[ci++] || 0;
          return '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (c.span > 1 ? '<w:gridSpan w:val="' + c.span + '"/>' : '') + (c.fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + c.fill + '"/>' : '') + (c.bd ? '<w:tcBorders>' + c.bd + '</w:tcBorders>' : '') + '</w:tcPr>' + (c.xml || p([run(c.t, { b: c.b, sz: c.sz, color: c.color, i: c.i })], { after: 0, sz: c.sz, align: c.align })) + '</w:tc>';
        }).join('') + '</w:tr>';
      });
      return h + '</w:tbl>';
    };
    var gap = function (n) { return p('', { after: 0, sz: n || 8 }); };
    var heading = function (t) { return L === 'clean' ? p(t, { b: true, color: A, sz: Math.round(hp * .95), under: true, after: 50, before: 40 }) : p(' ' + t, { b: true, sz: Math.round(hp * 1.06), bar: true, shd: SOFT, after: 50, before: 40 }); };
    var gridRows = function (g) {
      if (!g || !g.body.length) return null;
      var colW = g.head.map(function (hd) { return /出場種目|種目/.test(hd) ? 3 : /出る人/.test(hd) ? 6 : /名前/.test(hd) ? 2.2 : /招集/.test(hd) ? 1.7 : /所属/.test(hd) ? 1.8 : 1; });
      var tot = colW.reduce(function (a, b) { return a + b; }, 0), widths = colW.map(function (w) { return Math.floor(W * w / tot); }), sz = Math.round(hp * .9), rows = [];
      var dv = function (i) { return g.split && i === g.ncol ? '<w:left w:val="single" w:sz="12" w:space="0" w:color="' + A + '"/>' : ''; };
      if (g.caps) rows.push({ head: true, cells: g.caps.map(function (c, i) { return { t: c, span: g.ncol, fill: A, color: 'FFFFFF', b: true, sz: sz, align: 'center', bd: dv(i * g.ncol) }; }) });
      rows.push({ head: true, cells: g.head.map(function (hd, i) { return { t: hd, fill: SOFT, b: true, sz: sz, bd: '<w:bottom w:val="single" w:sz="12" w:space="0" w:color="' + A + '"/>' + dv(i) }; }) });
      g.body.forEach(function (r, ri) { rows.push({ cells: r.map(function (c, i) { return { t: c, sz: sz, fill: ri % 2 ? ZB : null, align: /^(時刻|招集|学年|リレー)$/.test(g.head[i]) ? 'center' : null, b: g.head[i] === '時刻', i: g.tent && g.tent[ri], bd: dv(i) }; }) }); });
      return tbl(rows, { widths: widths, mar: 70, vm: 10 });
    };
    var checklist = function (cols) {
      var it = belItems(T, M, V).map(function (q) { return '☐ ' + q; }), out = [];
      for (var i = 0; i < it.length; i += cols) out.push(p(it.slice(i, i + cols).map(function (t, j) { return run((j ? '　　' : '') + t); }), { after: 10 }));
      if (T.belongings.note) out.push(p(fill(T.belongings.note, V), { sz: Math.round(hp * .86), color: '555555', after: 0 }));
      return out.join('');
    };
    var cautionsXml = function () { return T.cautions.filter(Boolean).map(function (c) { return p(fill(c, V), { num: true, after: 10 }); }).join(''); };
    var out = [], secs = T.sections.filter(function (s) { return s.on; }), school = [T.school, T.club].filter(Boolean).join('　');
    for (var si = 0; si < secs.length; si++) {
      var s = secs[si];
      switch (s.type) {
        case 'header':
          out.push(tbl([{ cells: [{ t: T.to, b: true, sz: Math.round(hp * 1.05) }, { xml: [M.docDate || '', school].concat(T.advisors.length ? ['顧問　' + T.advisors.join('・')] : []).map(function (t) { return p(t, { align: 'right', after: 0, sz: Math.round(hp * .9), color: '444444' }); }).join('') }] }], { border: 'none', widths: [W / 2, W / 2], mar: 0 }), gap(10));
          break;
        case 'title':
          var chips = [['日にち', M.date], ['会場', M.venue]].filter(function (c) { return c[1]; }).map(function (c) { return c[0] + '　' + c[1]; }).join('　｜　');
          var fg = L === 'clean' ? '1A1D24' : 'FFFFFF', bg = L === 'clean' ? null : A;
          var inner = p(school || 'お知らせ', { b: true, sz: Math.round(hp * .85), color: L === 'clean' ? A : fg, after: 0 }) + p(fill(T.title, V), { b: true, sz: Math.round(hp * 1.85), color: fg, after: 20 }) + (chips ? p(chips, { b: true, sz: Math.round(hp * .92), color: fg, after: 0 }) : '');
          out.push(L === 'clean' ? inner + p('', { under: true, after: 60, sz: 6 }) : tbl([{ cells: [{ xml: inner, fill: bg }] }], { border: 'none', widths: [W], mar: 220, vm: 120 }), gap(12));
          break;
        case 'greeting': fill(T.greeting, V).split('\n').forEach(function (l) { out.push(p(l, { after: 0, color: '333333' })); }); out.push(gap(10)); break;
        case 'points':
          var pr = pointRows(T, M), per = L === 'table' ? 3 : 3, rows = [];
          for (var i = 0; i < pr.length; i += per) {
            rows.push({ cells: pr.slice(i, i + per).concat(Array(Math.max(0, per - pr.slice(i, i + per).length)).fill(null)).map(function (r) {
              if (!r) return { t: '' };
              var big = r.big && L !== 'clean';
              return { fill: big ? SOFT : null, xml: p(r.label, { b: true, sz: Math.round(hp * .8), color: A, after: 0 }) + p(r.main || '—', { b: true, sz: Math.round(hp * (big ? (L === 'table' ? 2.1 : 1.8) : 1.15)), after: 0 }) + (r.sub ? p(r.sub, { sz: Math.round(hp * .82), color: '555555', after: 0 }) : '') };
            }) });
          }
          out.push(tbl(rows, { border: 'grid', color: L === 'clean' ? 'D5D9DF' : LN, sz: L === 'table' ? 8 : 4, widths: Array(per).fill(Math.floor(W / per)), mar: 120, vm: 50 }), gap(10));
          break;
        case 'belongings':
          if (secs[si + 1] && secs[si + 1].type === 'cautions') {
            var cw = Math.floor(W * .51);
            out.push(tbl([{ cells: [{ xml: heading('持ち物') + checklist(2) }, { xml: heading('注意事項') + cautionsXml() }] }], { border: L === 'table' ? 'grid' : 'none', widths: [cw, W - cw], mar: L === 'table' ? 120 : 60, vm: L === 'table' ? 60 : 0 }), gap(10)); si++;
          } else out.push(heading('持ち物'), checklist(3), gap(10));
          break;
        case 'cautions': out.push(heading('注意事項'), cautionsXml(), gap(10)); break;
        case 'contact': out.push(heading('連絡先')); T.contact.filter(Boolean).forEach(function (c) { out.push(p(fill(c, V), { after: 0 })); }); out.push(gap(10)); break;
        case 'athletes': out.push(heading('出場選手'), gridRows(tables.ath) || p('（該当なし）'), gap(10)); break;
        case 'schedule': out.push(heading('時間順の予定'), gridRows(tables.time) || p('（該当なし）'), p('※ 時刻は予定です。当日の進行により前後します。斜体は「通過したら」の予定です。', { sz: Math.round(hp * .86), color: '555555', after: 40 })); break;
        case 'free': if (s.title) out.push(heading(fill(s.title, V))); fill(s.text, V).split('\n').forEach(function (l) { out.push(p(l, { after: 0 })); }); out.push(gap(10)); break;
      }
    }
    out.push(p([run(school + '　　', { sz: Math.round(hp * .72), color: '888888' }), run('作成：', { sz: Math.round(hp * .72), color: '888888' }), run('LANE NOTE', { b: true, sz: Math.round(hp * .72), color: A })], { align: 'right', after: 0, sz: Math.round(hp * .72) }));
    var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>' + out.join('') +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="624" w:right="624" w:bottom="624" w:left="624" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>';
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="' + font + '" w:hAnsi="' + font + '" w:eastAsia="' + font + '" w:cs="' + font + '"/><w:color w:val="1A1D24"/><w:sz w:val="' + hp + '"/><w:szCs w:val="' + hp + '"/><w:lang w:val="en-US" w:eastAsia="ja-JP"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>';
    var numbering = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="300"/></w:pPr><w:rPr><w:b/><w:color w:val="' + A + '"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>';
    return { document: doc, styles: styles, numbering: numbering };
  }
  async function toDocx(T, M, tables, fs, JSZip) {
    var X = docxXml(T, M, tables, fs), z = new JSZip();
    z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>');
    z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
    z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>');
    z.file('word/document.xml', X.document); z.file('word/styles.xml', X.styles); z.file('word/numbering.xml', X.numbering);
    z.file('docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>' + x(fill(T.title, vars(T, M))) + '</dc:title><dc:creator>LANE NOTE</dc:creator></cp:coreProperties>');
    return z.generateAsync({ type: typeof Blob !== 'undefined' && typeof window !== 'undefined' ? 'blob' : 'uint8array', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
  }
  // レイアウトの見本（小さな絵）
  var THUMB = {
    std: '<svg viewBox="0 0 42 59" aria-hidden="true"><rect x=".5" y=".5" width="41" height="58" rx="2" fill="#fff" stroke="#9aa3b2"/><rect x="4" y="4" width="34" height="9" rx="1.5" fill="currentColor"/><rect x="7" y="7" width="18" height="2.5" rx="1" fill="#fff"/><g fill="none" stroke="currentColor" stroke-width=".7"><rect x="4" y="16" width="10.5" height="6" rx="1"/><rect x="15.8" y="16" width="10.5" height="6" rx="1"/><rect x="27.5" y="16" width="10.5" height="6" rx="1"/></g><rect x="4" y="25" width="1.2" height="3" fill="currentColor"/><rect x="22" y="25" width="1.2" height="3" fill="currentColor"/><g fill="#b8bfcb"><rect x="6" y="29.5" width="12" height="1"/><rect x="6" y="31.5" width="12" height="1"/><rect x="24" y="29.5" width="13" height="1"/><rect x="24" y="31.5" width="13" height="1"/></g><rect x="4" y="36" width="34" height="18" rx="1.5" fill="none" stroke="#9aa3b2" stroke-width=".7"/><rect x="4" y="36" width="34" height="3" rx="1.5" fill="currentColor" opacity=".35"/></svg>',
    table: '<svg viewBox="0 0 42 59" aria-hidden="true"><rect x=".5" y=".5" width="41" height="58" rx="2" fill="#fff" stroke="#9aa3b2"/><rect x="4" y="3" width="34" height="8" fill="currentColor"/><g fill="none" stroke="currentColor" stroke-width=".8"><rect x="4" y="14" width="16.5" height="9" rx="1.5"/><rect x="21.5" y="14" width="16.5" height="9" rx="1.5"/><rect x="4" y="26" width="16.5" height="8" rx="1.5"/><rect x="21.5" y="26" width="16.5" height="8" rx="1.5"/><rect x="4" y="37" width="34" height="17" rx="1.5"/></g><rect x="6.5" y="17" width="9" height="3.5" fill="currentColor"/><rect x="24" y="17" width="9" height="3.5" fill="currentColor"/></svg>',
    clean: '<svg viewBox="0 0 42 59" aria-hidden="true"><rect x=".5" y=".5" width="41" height="58" rx="2" fill="#fff" stroke="#9aa3b2"/><rect x="4" y="5" width="24" height="3.5" fill="#333"/><rect x="4" y="11" width="34" height=".9" fill="currentColor"/><g stroke="#c5ccd8" stroke-width=".5"><line x1="4" y1="14" x2="38" y2="14"/><line x1="4" y1="20" x2="38" y2="20"/><line x1="15.3" y1="14" x2="15.3" y2="20"/><line x1="26.6" y1="14" x2="26.6" y2="20"/></g><g fill="currentColor"><rect x="4" y="24" width="8" height="1"/><rect x="22" y="24" width="8" height="1"/></g><g fill="#b8bfcb"><rect x="4" y="27" width="14" height="1"/><rect x="4" y="29" width="14" height="1"/><rect x="22" y="27" width="15" height="1"/><rect x="22" y="29" width="15" height="1"/></g><g stroke="#c5ccd8" stroke-width=".5"><line x1="4" y1="37" x2="38" y2="37"/><line x1="4" y1="41" x2="38" y2="41"/><line x1="4" y1="45" x2="38" y2="45"/><line x1="4" y1="49" x2="38" y2="49"/><line x1="4" y1="53" x2="38" y2="53"/></g></svg>'
  };
  return { defaults: defaults, sanitize: sanitize, parseDate: parseDate, fmtDate: fmtDate, toMin: toMin, fmtMin: fmtMin, extract: extract, gatherTime: gatherTime, dismissTime: dismissTime, vars: vars, fill: fill, pointRows: pointRows, docHtml: docHtml, fitDoc: fitDoc, docxXml: docxXml, toDocx: toDocx, SEC_LABEL: SEC_LABEL, findVenue: findVenue, fareText: fareText, VENUE_KEYS: VENUE_KEYS, THUMB: THUMB, MIN_FS: MIN_FS, ACCENT: ACCENT, ACCENT_NAME: ACCENT_NAME, colors: colors };
})();
if (typeof module !== 'undefined') module.exports = LaneNotice;
