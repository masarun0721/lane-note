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
  var SEC_LABEL = { header: '宛先・日付・学校名', title: 'タイトル', greeting: 'あいさつ', points: '要点（日にち・競技場・集合など）', belongings: '持ち物', cautions: 'その他注意事項', contact: '連絡先', athletes: '出場選手表', schedule: '時間順の予定', free: '自由欄' };
  function defaults() {
    return {
      v: 1, layout: 'std', font: 'mincho', size: 10.5, fit: true, era: 'wareki',
      school: '', club: '陸上競技部', advisors: [], to: '保護者各位', title: '{大会名}について', place: '競技場 正門前',
      greeting: '日頃より陸上競技部の活動にご理解とご協力をいただき、ありがとうございます。\n先日の大会では、温かいご声援をありがとうございました。\nさて、下記のとおり{大会名}に出場いたします。お忙しいところ恐縮ですが、ご確認をお願いいたします。',
      points: [{ k: 'date', label: '日にち', on: true }, { k: 'venue', label: '競技場', on: true }, { k: 'station', label: '最寄り駅', on: true }, { k: 'gate', label: '開門', on: false }, { k: 'gather', label: '集合', on: true }, { k: 'dismiss', label: '解散予定', on: true }],
      belongings: { items: ['ユニフォーム', 'ナンバーカード（ゼッケン）', 'スパイク', '安全ピン', '弁当', '水筒・飲み物', 'タオル', '着替え', '雨具', '保険証のコピー'], note: '※ 貴重品は各自で管理してください。' },
      cautions: ['会場までは公共交通機関を利用し、車内では他の利用者の迷惑にならないようにしてください。', '欠席・遅刻の場合は、当日朝 7:00 までに顧問へ連絡してください。', '体調がすぐれない場合は無理をせず、早めに相談してください。', '会場ではごみを各自持ち帰ってください。', '保護者の方の観戦は、スタンドのみとなります。'],
      contact: ['当日の連絡先：顧問 携帯 000-0000-0000'],
      table: { grade: true, split: true },
      call: { base: 'first', h: 2, m: 0 }, dismiss: { on: true, h: 0, m: 30 },
      sections: ['header', 'title', 'greeting', 'points', 'belongings', 'cautions', 'contact', 'athletes', 'schedule'].map(function (t) { return { id: t, type: t, on: true }; })
    };
  }
  // 保存しておいたひな形を、決まった形・長さに作り直す（壊れた・古いデータでも動くように）
  function sanitize(o) {
    var d = defaults(); if (!o || typeof o !== 'object') return d;
    var str = function (v, def, n) { return typeof v === 'string' ? v.slice(0, n || MAX_STR) : def; };
    var list = function (v, def, n) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }).slice(0, n || 40).map(function (x) { return x.slice(0, 400); }) : def; };
    var num = function (v, def, lo, hi) { v = +v; return isFinite(v) && v >= lo && v <= hi ? v : def; };
    var t = {
      v: 1, layout: ['std', 'table', 'clean'].indexOf(o.layout) >= 0 ? o.layout : d.layout, font: o.font === 'gothic' ? 'gothic' : 'mincho', size: num(o.size, d.size, 8, 14), fit: o.fit !== false, era: o.era === 'seireki' ? 'seireki' : 'wareki',
      school: str(o.school, d.school, 60), club: str(o.club, d.club, 40), advisors: list(o.advisors, d.advisors, 6), to: str(o.to, d.to, 60), title: str(o.title, d.title, 100), place: str(o.place, d.place, 60),
      greeting: str(o.greeting, d.greeting),
      points: d.points.map(function (p) { var q = Array.isArray(o.points) ? o.points.filter(function (x) { return x && x.k === p.k; })[0] : null; return { k: p.k, label: q ? str(q.label, p.label, 20) : p.label, on: q ? q.on !== false : p.on }; }),
      belongings: { items: list(o.belongings && o.belongings.items, d.belongings.items), note: str(o.belongings && o.belongings.note, d.belongings.note, 300) },
      cautions: list(o.cautions, d.cautions), contact: list(o.contact, d.contact, 10),
      table: { grade: !(o.table && o.table.grade === false), split: !(o.table && o.table.split === false) },
      call: { base: o.call && ['first', 'start', 'gate'].indexOf(o.call.base) >= 0 ? o.call.base : 'first', h: num(o.call && o.call.h, 2, 0, 6), m: num(o.call && o.call.m, 0, 0, 59) },
      dismiss: { on: !(o.dismiss && o.dismiss.on === false), h: num(o.dismiss && o.dismiss.h, 0, 0, 6), m: num(o.dismiss && o.dismiss.m, 30, 0, 59) },
      sections: []
    };
    var seen = {};
    (Array.isArray(o.sections) ? o.sections : []).slice(0, 40).forEach(function (s) {
      if (!s || typeof s !== 'object') return;
      if (s.type === 'free') { var id = 'f' + String(s.id || '').replace(/\W/g, '').slice(0, 12); if (seen[id]) return; seen[id] = 1; t.sections.push({ id: id, type: 'free', on: s.on !== false, title: str(s.title, '', 60), text: str(s.text, '') }); }
      else if (SEC_LABEL[s.type] && !seen[s.type]) { seen[s.type] = 1; t.sections.push({ id: s.type, type: s.type, on: s.on !== false }); }
    });
    d.sections.forEach(function (s) { if (!seen[s.type]) t.sections.push(s); });   // 新しく増えた欄は最後に
    return t;
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
      venue: [/(?:会\s*場|場\s*所|競\s*技\s*場)\s*[:：]?\s*([^\s:：、。()（）]{2,24}(?:陸上競技場|競技場|スタジアム|フィールド|総合運動場))/, /([一-龯ァ-ヶーA-Za-z0-9・]{2,20}(?:陸上競技場|スタジアム))/],
      station: [/最寄り?駅\s*[:：]?\s*([^\s、。:：]{1,15}駅)/, /([一-龯ァ-ヶーぁ-ん]{1,12}駅)\s*(?:から|より|下車|徒歩|[東西南北]口)/],
      gate: [/開\s*門\s*(?:時\s*刻)?\s*[:：]?\s*(?:は)?\s*(\d{1,2}\s*[:：時]\s*\d{0,2})/],
      reception: [/受\s*付\s*(?:開\s*始)?\s*(?:時\s*刻)?\s*[:：]?\s*(\d{1,2}\s*[:：時]\s*\d{0,2})/],
      start: [/競\s*技\s*開\s*始\s*(?:時\s*刻)?\s*[:：]?\s*(\d{1,2}\s*[:：時]\s*\d{0,2})/]
    };
    Object.keys(pats).forEach(function (k) {
      for (var i = 0; i < order.length && !out[k]; i++) {
        var txt = nk(docs && docs[order[i]] || ''); if (!txt) continue;
        for (var j = 0; j < pats[k].length; j++) {
          var m = txt.match(pats[k][j]); if (!m) continue;
          var v = m[1].replace(/\s+/g, ''); if (/gate|reception|start/.test(k)) { var mm = toMin(v); if (mm == null || mm < 300 || mm > 1200) continue; v = fmtMin(mm); }
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
    return { '大会名': M.name || '', '日付': M.date || '', '競技場': M.venue || '', '最寄り駅': M.station || '', '集合時刻': M.gather || '', '集合場所': M.place || T.place || '', '解散予定': M.dismiss || '', '開門': M.gate || '', '学校名': T.school || '', '部活名': T.club || '' };
  }
  function fill(s, V) { return String(s || '').replace(/\{([^{}]{1,10})\}/g, function (a, k) { return Object.prototype.hasOwnProperty.call(V, k) ? V[k] : a; }); }
  function pointRows(T, M) {
    var val = { date: M.date, venue: M.venue, station: M.station, gate: M.gate, gather: [M.gather, M.place || T.place].filter(Boolean).join('　'), dismiss: M.dismiss ? M.dismiss + ' ごろ（予定）' : '' };
    return T.points.filter(function (p) { return p.on; }).map(function (p) { return { label: p.label, value: val[p.k] || '' }; });
  }
  /* ---------- 文書（HTML）：プレビュー・印刷・PDF ---------- */
  var FONT = { mincho: '"游明朝","Yu Mincho","ＭＳ 明朝","MS Mincho","Hiragino Mincho ProN","Noto Serif CJK JP",serif', gothic: '"游ゴシック","Yu Gothic","ＭＳ ゴシック","MS Gothic","Hiragino Sans","Noto Sans CJK JP",sans-serif' };
  function tableHtml(g, cls) {
    if (!g || !g.body.length) return '<p class="muted">（該当なし）</p>';
    var h = '<table class="nt-t ' + (cls || '') + '"><thead>';
    if (g.caps) h += '<tr>' + g.caps.map(function (c, i) { return '<th colspan="' + g.ncol + '"' + (i ? ' class="dv"' : '') + '>' + esc(c) + '</th>'; }).join('') + '</tr>';
    h += '<tr>' + g.head.map(function (s, i) { return '<th' + (g.split && i === g.ncol ? ' class="dv"' : '') + '>' + esc(s) + '</th>'; }).join('') + '</tr></thead><tbody>';
    h += g.body.map(function (r, ri) { return '<tr' + (g.tent && g.tent[ri] ? ' class="tent"' : '') + '>' + r.map(function (c, i) { return '<td class="' + (g.split && i === g.ncol ? 'dv ' : '') + (/^(時刻|招集|学年|リレー)$/.test(g.head[i]) ? 'c' : '') + '">' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('');
    return h + '</tbody></table>';
  }
  function nl2p(s) { return String(s || '').split(/\n/).map(function (l) { return '<p>' + (esc(l) || '&nbsp;') + '</p>'; }).join(''); }
  function sectionHtml(s, T, M, tables, V) {
    var L = T.layout, head = function (t) { return L === 'std' ? '' : '<h2>' + esc(t) + '</h2>'; };
    switch (s.type) {
      case 'header':
        return '<div class="nt-hd"><div class="to">' + esc(T.to) + '</div><div class="from"><div>' + esc(M.docDate || '') + '</div><div>' + esc([T.school, T.club].filter(Boolean).join('　')) + '</div>' + (T.advisors.length ? '<div>顧問　' + esc(T.advisors.join('・')) + '</div>' : '') + '</div></div>';
      case 'title': return '<h1>' + esc(fill(T.title, V)) + '</h1>';
      case 'greeting': return '<div class="nt-gr">' + nl2p(fill(T.greeting, V)) + '</div>' + (L === 'std' ? '<p class="ki">記</p>' : '');
      case 'points':
        var pr = pointRows(T, M);
        if (L === 'table') return '<table class="nt-pt">' + pr.map(function (r) { return '<tr><th>' + esc(r.label) + '</th><td>' + esc(r.value) + '</td></tr>'; }).join('') + '</table>';
        if (L === 'clean') return head('大会の概要') + '<dl class="nt-dl">' + pr.map(function (r) { return '<dt>' + esc(r.label) + '</dt><dd>' + esc(r.value) + '</dd>'; }).join('') + '</dl>';
        return '<ol class="nt-pl">' + pr.map(function (r, i) { return '<li><span class="n">' + (i + 1) + '</span><span class="l">' + esc(r.label) + '</span><span class="v">' + esc(r.value) + '</span></li>'; }).join('') + '</ol>';
      case 'belongings':
        var it = T.belongings.items.filter(Boolean).map(function (x) { return fill(x, V); });
        if (L === 'clean') return '<div class="nt-bl">' + head('持ち物') + '<ul class="nt-ul">' + it.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' + (T.belongings.note ? '<p class="note">' + esc(fill(T.belongings.note, V)) + '</p>' : '') + '</div>';
        return (L === 'std' ? '<p class="lb">【持ち物】</p>' : head('持ち物')) + '<p class="nt-items">' + esc(it.join('・')) + '</p>' + (T.belongings.note ? '<p class="note">' + esc(fill(T.belongings.note, V)) + '</p>' : '');
      case 'cautions':
        var cs = T.cautions.filter(Boolean);
        var ol = '<ol class="nt-ol">' + cs.map(function (x) { return '<li>' + esc(fill(x, V)) + '</li>'; }).join('') + '</ol>';
        return L === 'clean' ? '<div class="nt-cl">' + head('注意事項') + ol + '</div>' : (L === 'std' ? '<p class="lb">【その他注意事項】</p>' : head('注意事項')) + ol;
      case 'contact': return (L === 'std' ? '<p class="lb">【連絡先】</p>' : head('連絡先')) + '<div class="nt-ct">' + T.contact.filter(Boolean).map(function (x) { return '<p>' + esc(fill(x, V)) + '</p>'; }).join('') + '</div>';
      case 'athletes': return (L === 'std' ? '<p class="lb">【出場選手】</p>' : head('出場選手')) + tableHtml(tables.ath, 'ath');
      case 'schedule': return (L === 'std' ? '<p class="lb">【時間順の予定】</p>' : head('時間順の予定')) + tableHtml(tables.time, 'time') + '<p class="note">※ 時刻は予定です。当日の進行により前後します。</p>';
      case 'free': return (s.title ? (L === 'std' ? '<p class="lb">【' + esc(fill(s.title, V)) + '】</p>' : head(fill(s.title, V))) : '') + '<div class="nt-fr">' + nl2p(fill(s.text, V)) + '</div>';
    }
    return '';
  }
  function css(T) {
    return '@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}html{background:#fff}' +
      'body{margin:0 auto;width:186mm;color:#000;background:#fff;font-family:' + FONT[T.font] + ';font-size:var(--fs,' + T.size + 'pt);line-height:calc(1.45 * var(--lh,1));--sp:1}' +
      'p{margin:0}.sec{margin:0 0 calc(3.2mm * var(--sp))}h1{font-size:1.45em;text-align:center;margin:calc(4mm * var(--sp)) 0 calc(4mm * var(--sp));font-weight:bold;letter-spacing:.05em}' +
      'h2{font-size:1.08em;margin:0 0 1.2mm;font-weight:bold}.nt-hd{display:flex;justify-content:space-between;align-items:flex-start;gap:6mm}.nt-hd .from{text-align:right}.ki{text-align:center;margin:calc(2.5mm * var(--sp)) 0 0}' +
      '.nt-pl{list-style:none;margin:0;padding:0 0 0 4mm}.nt-pl li{display:flex;gap:3mm}.nt-pl .n{width:1.2em}.nt-pl .l{width:5.5em;flex:none}.nt-pl .v{flex:1}' +
      '.lb{font-weight:bold;margin-top:1mm}.nt-items{padding-left:4mm}.note{font-size:.9em;padding-left:4mm}.nt-ol{margin:0;padding-left:8mm}.nt-ul{margin:0;padding-left:6mm}.nt-ct p,.nt-fr p,.nt-gr p{padding-left:0}.nt-gr p{text-indent:1em}' +
      '.nt-t{width:100%;border-collapse:collapse;font-size:.92em;line-height:calc(1.25 * var(--lh,1))}.nt-t th,.nt-t td{border:1px solid #000;padding:calc(.5mm * var(--sp) + .2mm) 1.2mm;vertical-align:top}.nt-t th{background:#eee;font-weight:bold;text-align:center}.nt-t .c{text-align:center;white-space:nowrap}.nt-t .dv{border-left:3px double #000}.nt-t tr.tent td{font-style:italic}' +
      '.nt-pt{width:100%;border-collapse:collapse;margin-bottom:1mm}.nt-pt th,.nt-pt td{border:1px solid #000;padding:.8mm 2mm;text-align:left}.nt-pt th{width:22%;background:#eee}' +
      '.nt-dl{display:grid;grid-template-columns:6em 1fr;gap:.6mm 3mm;margin:0}.nt-dl dt{font-weight:bold}.nt-dl dd{margin:0}' +
      // レイアウト別
      '.L-table .ath{font-size:1em}.L-table h1{border:2px solid #000;padding:2mm}' +
      '.L-clean h1{text-align:left;border-bottom:2px solid #000;padding-bottom:1.5mm}.L-clean h2{border-left:4px solid #000;padding-left:2mm}.L-clean .duo{display:grid;grid-template-columns:1fr 1.4fr;gap:5mm}.L-clean .duo>.sec{margin:0}.L-clean .nt-ul{columns:2;column-gap:4mm}' +
      '.muted{color:#555}@media screen{html{background:#d9dde3}body{padding:12mm;width:210mm;min-height:297mm;box-shadow:0 1px 6px rgba(0,0,0,.3);margin:8px auto}}@media print{body{padding:0}}';
  }
  function bodyHtml(T, M, tables) {
    var V = vars(T, M), secs = T.sections.filter(function (s) { return s.on; }), out = [];
    for (var i = 0; i < secs.length; i++) {
      var s = secs[i], h = '<div class="sec s-' + s.type + '" data-sec="' + esc(s.id) + '">' + sectionHtml(s, T, M, tables, V) + '</div>';
      // すっきり：持ち物と注意事項が並んでいれば2列
      if (T.layout === 'clean' && s.type === 'belongings' && secs[i + 1] && secs[i + 1].type === 'cautions') { h = '<div class="duo">' + h + '<div class="sec s-cautions" data-sec="cautions">' + sectionHtml(secs[i + 1], T, M, tables, V) + '</div></div>'; i++; }
      out.push(h);
    }
    if (T.layout === 'std') out.push('<p style="text-align:right">以上</p>');
    return out.join('');
  }
  function docHtml(T, M, tables, fit) {
    var st = fit ? ' style="--fs:' + fit.fs + 'pt;--sp:' + fit.sp + ';--lh:' + fit.lh + '"' : '';
    return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(fill(T.title, vars(T, M))) + '</title><style>' + css(T) + '</style></head><body class="L-' + T.layout + '"' + st + '>' + bodyHtml(T, M, tables) + '</body></html>';
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
    var V = vars(T, M), hp = Math.round(fs * 2), font = T.font === 'gothic' ? 'ＭＳ ゴシック' : 'ＭＳ 明朝', sp = function (a, sz) { return '<w:spacing w:before="0" w:after="' + (a == null ? 40 : a) + '" w:line="' + Math.round((sz || hp) * 10 * 1.35) + '" w:lineRule="exact"/>'; };
    var run = function (t, o) { o = o || {}; return '<w:r><w:rPr>' + (o.b ? '<w:b/>' : '') + (o.i ? '<w:i/>' : '') + (o.sz ? '<w:sz w:val="' + o.sz + '"/><w:szCs w:val="' + o.sz + '"/>' : '') + '</w:rPr><w:t xml:space="preserve">' + x(t) + '</w:t></w:r>'; };
    var p = function (runs, o) { o = o || {}; return '<w:p><w:pPr>' + (o.style ? '<w:pStyle w:val="' + o.style + '"/>' : '') + (o.num ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : '') + (o.border ? '<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="000000"/></w:pBdr>' : '') + (o.left ? '<w:pBdr><w:left w:val="single" w:sz="24" w:space="4" w:color="000000"/></w:pBdr>' : '') + sp(o.after, o.sz) + (o.ind ? '<w:ind w:left="' + o.ind + '"/>' : '') + (o.first ? '<w:ind w:firstLine="' + o.first + '"/>' : '') + (o.align ? '<w:jc w:val="' + o.align + '"/>' : '') + '</w:pPr>' + (typeof runs === 'string' ? run(runs, o) : runs.join('')) + '</w:p>'; };
    var W = 10520;   // 本文の幅（A4 210mm − 余白 12mm×2 ≒ 186mm → twip）
    var tbl = function (rows, o) {
      o = o || {}; var n = Math.max.apply(null, rows.map(function (r) { return r.cells.reduce(function (a, c) { return a + (c.span || 1); }, 0); }));
      var widths = o.widths || Array(n).fill(Math.floor(W / n)), bd = o.noBorder ? 'nil' : 'single';
      var b = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (k) { return '<w:' + k + ' w:val="' + bd + '" w:sz="4" w:space="0" w:color="000000"/>'; }).join('') + '</w:tblBorders>';
      var h = '<w:tbl><w:tblPr><w:tblW w:w="' + W + '" w:type="dxa"/>' + b + '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="10" w:type="dxa"/><w:left w:w="50" w:type="dxa"/><w:bottom w:w="10" w:type="dxa"/><w:right w:w="50" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' + widths.map(function (w) { return '<w:gridCol w:w="' + w + '"/>'; }).join('') + '</w:tblGrid>';
      rows.forEach(function (r) {
        var ci = 0;
        h += '<w:tr>' + (r.head ? '<w:trPr><w:tblHeader/></w:trPr>' : '') + r.cells.map(function (c) {
          var w = 0; for (var k = 0; k < (c.span || 1); k++) w += widths[ci++] || 0;
          var paras = (Array.isArray(c.t) ? c.t : [c.t]).map(function (t) { return p([run(t, { b: r.head || c.b, sz: o.sz })], { after: 0, sz: o.sz ? Math.round(o.sz * .9) : null, align: r.head || c.center ? 'center' : c.right ? 'right' : null }); }).join('');
          return '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (c.span > 1 ? '<w:gridSpan w:val="' + c.span + '"/>' : '') + (r.head || c.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="EEEEEE"/>' : '') + (c.dv ? '<w:tcBorders><w:left w:val="double" w:sz="6" w:space="0" w:color="000000"/></w:tcBorders>' : '') + '</w:tcPr>' + paras + '</w:tc>';
        }).join('') + '</w:tr>';
      });
      return h + '</w:tbl>' + p('', { after: 0, sz: 8 });
    };
    var gridRows = function (g) {
      if (!g || !g.body.length) return null;
      var colW = g.head.map(function (hd) { return /出場種目|種目/.test(hd) ? 3 : /出る人/.test(hd) ? 6 : /名前/.test(hd) ? 2.2 : /招集/.test(hd) ? 1.7 : /所属/.test(hd) ? 1.8 : 1; });
      var tot = colW.reduce(function (a, b) { return a + b; }, 0), widths = colW.map(function (w) { return Math.floor(W * w / tot); });
      var rows = [];
      if (g.caps) rows.push({ head: true, cells: g.caps.map(function (c, i) { return { t: c, span: g.ncol, dv: i > 0 }; }) });
      rows.push({ head: true, cells: g.head.map(function (hd, i) { return { t: hd, dv: g.split && i === g.ncol }; }) });
      g.body.forEach(function (r) { rows.push({ cells: r.map(function (c, i) { return { t: c, dv: g.split && i === g.ncol, center: /^(時刻|招集|学年|リレー)$/.test(g.head[i]) }; }) }); });
      return { rows: rows, widths: widths };
    };
    var L = T.layout, out = [], lab = function (t) { out.push(L === 'std' ? p('【' + t + '】', { b: true, after: 20 }) : p(t, { b: true, sz: Math.round(hp * 1.08), border: L === 'table', left: L === 'clean', after: 40 })); };
    var secs = T.sections.filter(function (s) { return s.on; });
    secs.forEach(function (s) {
      switch (s.type) {
        case 'header':
          out.push(tbl([{ cells: [{ t: T.to }, { right: true, t: [M.docDate || '', [T.school, T.club].filter(Boolean).join('　')].concat(T.advisors.length ? ['顧問　' + T.advisors.join('・')] : []) }] }], { noBorder: true, widths: [W / 2, W / 2] }));
          break;
        case 'title': out.push(p(fill(T.title, V), { b: true, sz: Math.round(hp * 1.45), align: L === 'clean' ? 'left' : 'center', after: 160, border: L !== 'std' })); break;
        case 'greeting': fill(T.greeting, V).split('\n').forEach(function (l) { out.push(p(l, { first: hp * 10, after: 0 })); }); if (L === 'std') out.push(p('記', { align: 'center', after: 80 })); else out.push(p('', { after: 0, sz: 10 })); break;
        case 'points':
          var pr = pointRows(T, M);
          if (L === 'table') out.push(tbl(pr.map(function (r) { return { cells: [{ t: r.label, shade: true, b: true }, { t: r.value }] }; }), { widths: [2300, W - 2300] }));
          else out.push(tbl(pr.map(function (r, i) { return { cells: [{ t: L === 'std' ? (i + 1) + '　' + r.label : r.label, b: L === 'clean' }, { t: r.value }] }; }), { noBorder: true, widths: [2000, W - 2000] }));
          break;
        case 'belongings': lab('持ち物'); out.push(p(T.belongings.items.filter(Boolean).map(function (q) { return fill(q, V); }).join('・'), { ind: 240, after: 20 })); if (T.belongings.note) out.push(p(fill(T.belongings.note, V), { ind: 240, sz: Math.round(hp * .9), after: 60 })); break;
        case 'cautions': lab(L === 'std' ? 'その他注意事項' : '注意事項'); T.cautions.filter(Boolean).forEach(function (c) { out.push(p(fill(c, V), { num: true, after: 0 })); }); out.push(p('', { after: 0, sz: 10 })); break;
        case 'contact': lab('連絡先'); T.contact.filter(Boolean).forEach(function (c) { out.push(p(fill(c, V), { ind: 240, after: 0 })); }); out.push(p('', { after: 0, sz: 10 })); break;
        case 'athletes': lab('出場選手'); var a = gridRows(tables.ath); out.push(a ? tbl(a.rows, { widths: a.widths, sz: Math.round(hp * .92) }) : p('（該当なし）')); break;
        case 'schedule': lab('時間順の予定'); var t = gridRows(tables.time); out.push(t ? tbl(t.rows, { widths: t.widths, sz: Math.round(hp * .92) }) : p('（該当なし）')); out.push(p('※ 時刻は予定です。当日の進行により前後します。', { sz: Math.round(hp * .9), after: 40 })); break;
        case 'free': if (s.title) lab(fill(s.title, V)); fill(s.text, V).split('\n').forEach(function (l) { out.push(p(l, { after: 0 })); }); out.push(p('', { after: 0, sz: 10 })); break;
      }
    });
    if (L === 'std') out.push(p('以上', { align: 'right' }));
    var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>' + out.join('') +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="680" w:right="680" w:bottom="680" w:left="680" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>';
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="' + font + '" w:hAnsi="' + font + '" w:eastAsia="' + font + '" w:cs="' + font + '"/><w:sz w:val="' + hp + '"/><w:szCs w:val="' + hp + '"/><w:lang w:val="en-US" w:eastAsia="ja-JP"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:left w:w="50" w:type="dxa"/><w:right w:w="50" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>';
    var numbering = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="480" w:hanging="300"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>';
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
    std: '<svg viewBox="0 0 42 59" aria-hidden="true"><rect x=".5" y=".5" width="41" height="58" fill="#fff" stroke="#000"/><rect x="4" y="4" width="10" height="2"/><rect x="28" y="4" width="10" height="2"/><rect x="11" y="10" width="20" height="3"/><g fill="#888"><rect x="4" y="16" width="34" height="1.2"/><rect x="4" y="19" width="30" height="1.2"/><rect x="6" y="24" width="28" height="1.2"/><rect x="6" y="27" width="28" height="1.2"/><rect x="6" y="30" width="28" height="1.2"/></g><rect x="4" y="38" width="34" height="16" fill="none" stroke="#000" stroke-width=".7"/><line x1="21" y1="38" x2="21" y2="54" stroke="#000" stroke-width=".7"/></svg>',
    table: '<svg viewBox="0 0 42 59" aria-hidden="true"><rect x=".5" y=".5" width="41" height="58" fill="#fff" stroke="#000"/><rect x="8" y="4" width="26" height="5" fill="none" stroke="#000"/><rect x="4" y="12" width="34" height="12" fill="none" stroke="#000" stroke-width=".7"/><rect x="4" y="12" width="9" height="12" fill="#ccc"/><rect x="4" y="27" width="34" height="27" fill="none" stroke="#000" stroke-width=".9"/><g stroke="#000" stroke-width=".4"><line x1="4" y1="31" x2="38" y2="31"/><line x1="4" y1="35" x2="38" y2="35"/><line x1="4" y1="39" x2="38" y2="39"/><line x1="21" y1="27" x2="21" y2="54"/></g></svg>',
    clean: '<svg viewBox="0 0 42 59" aria-hidden="true"><rect x=".5" y=".5" width="41" height="58" fill="#fff" stroke="#000"/><rect x="4" y="5" width="22" height="3"/><rect x="4" y="9.5" width="34" height=".8"/><rect x="4" y="14" width="1.5" height="4"/><g fill="#888"><rect x="7" y="15" width="26" height="1.2"/><rect x="4" y="22" width="15" height="1.2"/><rect x="4" y="25" width="15" height="1.2"/><rect x="22" y="22" width="16" height="1.2"/><rect x="22" y="25" width="16" height="1.2"/><rect x="22" y="28" width="16" height="1.2"/></g><rect x="4" y="34" width="34" height="20" fill="none" stroke="#000" stroke-width=".7"/></svg>'
  };
  return { defaults: defaults, sanitize: sanitize, parseDate: parseDate, fmtDate: fmtDate, toMin: toMin, fmtMin: fmtMin, extract: extract, gatherTime: gatherTime, dismissTime: dismissTime, vars: vars, fill: fill, pointRows: pointRows, docHtml: docHtml, fitDoc: fitDoc, docxXml: docxXml, toDocx: toDocx, SEC_LABEL: SEC_LABEL, THUMB: THUMB, MIN_FS: MIN_FS };
})();
if (typeof module !== 'undefined') module.exports = LaneNotice;
