// v0.29.0 JAAF入力の手伝い（ブックマークレット）。本郷 陸上競技部の先生用。
// JAAFの大会エントリーの画面で、LANE NOTE の「JAAF用にコピー」のJSONを読み、種目ごとの「登録」にチェックを入れるだけ。
// ボタンは押さない・送信しない・一時保存しない・連絡先の欄にはさわらない。最後は必ず自分で確かめて、自分で進む。
var LaneJaafBM = (function () {
  var LIMIT = 2;
  function nf(s) { return String(s == null ? '' : s).normalize('NFKC'); }
  // 種目名をそろえる：（規格）を外す・全角半角・×/x・男子/女子・空白・「リレー」→R
  function normEv(s) {
    var t = nf(s).replace(/\([^)]*\)/g, '').replace(/[\s\u3000]+/g, '').replace(/[×✕xX*]/g, 'x');
    t = t.replace(/^(男子|男|M)(?=\d|[^\d子])/i, '男子').replace(/^(女子|女|W)(?=\d|[^\d子])/i, '女子');
    t = t.replace(/^(男子|女子)(高校|中学|一般|U\d+)/, '$1').replace(/リレー$/, 'R').replace(/メートル/g, 'm');
    return t.toUpperCase();
  }
  function normName(s) { return nf(s).replace(/[\s\u3000・]+/g, ''); }
  function num(s) { var d = nf(s).replace(/\D/g, ''); return d.replace(/^0+(?=\d)/, ''); }
  function isRelayEv(s) { return /R$/.test(normEv(s)) || /リレー/.test(nf(s)); }
  function grey(tr, cb) {
    if (cb.disabled) return 'えらべない（グレー）';
    if (/gray|grey|disabled|muted/i.test(tr.className || '')) return 'グレーの行';
    var st = tr.getAttribute('style') || '', m = st.match(/background(?:-color)?\s*:\s*([^;]*)/i);
    if (m && m[1].trim() && !/^(transparent|#fff(fff)?|white|inherit|initial)$/i.test(m[1].trim())) return 'グレーの行';
    return '';
  }
  // 表の列：見出しの文字から「登録番号」「会員名」の位置を探す
  function cols(table) {
    var ths = table ? table.querySelectorAll('thead th') : [], c = { reg: -1, name: -1 };
    Array.prototype.forEach.call(ths, function (th, i) { var t = nf(th.textContent).trim(); if (t === '登録番号') c.reg = i; else if (t === '会員名') c.name = i; });
    return c;
  }
  function sections(doc) {
    var out = [];
    Array.prototype.forEach.call(doc.querySelectorAll('h3[id^="h3_"]'), function (h) {
      var id = h.id.slice(3); if (!/^\d+$/.test(id)) return;
      var cbs = doc.querySelectorAll('input[type="checkbox"].checkbox_ids[name^="input[' + id + ']["]'); if (!cbs.length) return;
      var rows = [], c = null;
      Array.prototype.forEach.call(cbs, function (cb) {
        var tr = cb.closest('tr'), tb = cb.closest('table'); if (!tr) return; if (!c) c = cols(tb);
        var td = tr.children;
        rows.push({ cb: cb, tr: tr, jid: num(cb.value), reg: c.reg >= 0 && td[c.reg] ? num(td[c.reg].textContent) : '', name: normName(c.name >= 0 && td[c.name] ? td[c.name].textContent : cb.getAttribute('title')) });
      });
      var relay = isRelayEv(h.textContent) || !cbs[0].classList.contains('checkbox_member_check');
      out.push({ id: id, label: nf(h.textContent).trim(), key: normEv(h.textContent), relay: relay, rows: rows });
    });
    return out;
  }
  function find(sec, p) {
    var j = num(p.jaafId), r = num(p.regNo), n = normName(p.name), hit;
    if (j) { hit = sec.rows.filter(function (x) { return x.jid && x.jid === j; }); if (hit.length === 1) return { row: hit[0], how: 'id' }; }
    if (r) { hit = sec.rows.filter(function (x) { return x.reg && x.reg === r; }); if (hit.length === 1) return { row: hit[0], how: 'reg' }; }
    if (n) { hit = sec.rows.filter(function (x) { return x.name === n; }); if (hit.length === 1) return { row: hit[0], how: 'name' }; if (hit.length > 1) return { many: hit.length }; }
    return null;
  }
  function parse(text) {
    var o; try { o = JSON.parse(String(text || '').trim()); } catch (e) { throw new Error('LANE NOTE の「JAAF用にコピー」の中身ではありません'); }
    if (!o || o.v !== 1 || !Array.isArray(o.entries)) throw new Error('LANE NOTE の「JAAF用にコピー」の中身ではありません（形がちがいます）');
    if (!Array.isArray(o.relays)) o.relays = [];
    return o;
  }
  function tick(row, res, ev, p, how) {
    var cb = row.cb, Ev = (cb.ownerDocument.defaultView || {}).Event || Event;
    if (!cb.checked) {
      cb.checked = true;
      cb.dispatchEvent(new Ev('input', { bubbles: true }));
      cb.dispatchEvent(new Ev('change', { bubbles: true }));
    }
    row.tr.setAttribute('data-lnjaaf', how === 'name' ? 'name' : 'ok');
    row.tr.style.outline = how === 'name' ? '3px solid #e4572e' : '3px solid #2e7d32';
    row.tr.style.backgroundColor = how === 'name' ? '#ffe3d6' : '#e3f4e1';
    res.filled.push({ event: ev, name: p.name, how: how });
    if (how === 'name') res.nameOnly.push(ev + '：' + p.name);
  }
  // 本体：doc（JAAFの画面）に data を入れる。ボタン・送信・連絡先・一時保存にはさわらない
  function apply(doc, data) {
    var secs = sections(doc), by = {}, res = { filled: [], noEvent: [], noAthlete: [], nameOnly: [], skipped: [], pageEvents: secs.length };
    secs.forEach(function (s) { (by[s.key] = by[s.key] || []).push(s); });
    var count = {};   // 個人種目の数（会員IDごと・すでにチェックが入っている分も数える）
    secs.forEach(function (s) { if (!s.relay) s.rows.forEach(function (r) { if (r.cb.checked) count[r.jid] = (count[r.jid] || 0) + 1; }); });
    var pick = function (ev) { var l = by[normEv(ev)] || []; return l.length === 1 ? l[0] : null; };
    (data.entries || []).forEach(function (p) {
      var ev = String(p.event || ''), s = pick(ev);
      if (!s) { res.noEvent.push(ev + '：' + (p.name || '')); return; }
      var f = find(s, p);
      if (!f || !f.row) { res.noAthlete.push(s.label + '：' + (p.name || '') + (f && f.many ? '（同じ名前が' + f.many + '人）' : '')); return; }
      var g = grey(f.row.tr, f.row.cb); if (g) { res.skipped.push(s.label + '：' + p.name + '（' + g + '）'); return; }
      if (!s.relay && !f.row.cb.checked) {
        if ((count[f.row.jid] || 0) >= LIMIT) { res.skipped.push(s.label + '：' + p.name + '（1人' + LIMIT + '種目まで）'); return; }
        count[f.row.jid] = (count[f.row.jid] || 0) + 1;
      }
      tick(f.row, res, s.label, p, f.how);
    });
    (data.relays || []).forEach(function (t) {
      var ev = String(t.event || ''), s = pick(ev);
      if (!s) { res.noEvent.push(ev + (t.team ? ' ' + t.team + 'チーム' : '')); return; }
      (t.members || []).forEach(function (p) {
        var f = find(s, p);
        if (!f || !f.row) { res.noAthlete.push(s.label + '：' + (p.name || '') + (f && f.many ? '（同じ名前が' + f.many + '人）' : '')); return; }
        var g = grey(f.row.tr, f.row.cb); if (g) { res.skipped.push(s.label + '：' + p.name + '（' + g + '）'); return; }
        tick(f.row, res, s.label, p, f.how);
      });
    });
    return res;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function box(doc) {
    var old = doc.getElementById('lnJaafPanel'); if (old) old.remove();
    var d = doc.createElement('div'); d.id = 'lnJaafPanel';
    d.setAttribute('style', 'position:fixed;top:12px;right:12px;z-index:2147483647;width:360px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto;background:#fff;color:#14213d;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.35);font:14px/1.55 "Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif;border:1px solid #c9d2e3');
    doc.body.appendChild(d); return d;
  }
  var HEAD = '<div style="background:#1f3a68;color:#fff;padding:10px 14px;border-radius:14px 14px 0 0;display:flex;align-items:center;gap:8px"><b style="flex:1">🟦 LANE NOTE → JAAF</b><span data-lnx="close" role="button" tabindex="0" style="cursor:pointer;font-size:18px" title="閉じる">✕</span></div>';
  function list(t, l, c) { return l.length ? '<div style="margin-top:8px"><b style="color:' + c + '">' + t + '（' + l.length + '）</b><ul style="margin:2px 0;padding-left:1.2em">' + l.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' : ''; }
  function panel(doc, res, data) {
    var d = box(doc), title = doc.querySelector('.card-title:not([id])'), pm = title ? nf(title.textContent).trim() : '';
    d.innerHTML = HEAD + '<div style="padding:10px 14px">' +
      (data.meet ? '<div style="font-size:12px;color:#5a6475">LANE NOTE：' + esc(data.meet) + (pm ? '<br>この画面：' + esc(pm) : '') + '</div>' : '') +
      '<div style="font-size:22px;font-weight:800;margin:4px 0">✔ ' + res.filled.length + '件入れた</div>' +
      '<div style="font-size:12px;color:#5a6475">緑の線＝番号で一致　<span style="color:#c8452b">赤の線＝名前だけで一致（要確認）</span></div>' +
      list('種目なし', res.noEvent, '#7a4b00') + list('選手なし', res.noAthlete, '#7a4b00') + list('名前だけで一致', res.nameOnly, '#c8452b') + list('飛ばした', res.skipped, '#5a6475') +
      '<p style="margin:10px 0 0;padding:8px 10px;background:#fff6e5;border-radius:8px;font-size:13px"><b>送信・確認のボタンは押していません。</b>チェックを目で確かめてから、自分で「出場選手の記録入力に進む」を押してください。確認ページも必ず自分で見てください。</p></div>';
    hook(d); return d;
  }
  function hook(d) { d.querySelector('[data-lnx="close"]').addEventListener('click', function () { d.remove(); }); }
  function askPaste(doc, run, why) {
    var d = box(doc);
    d.innerHTML = HEAD + '<div style="padding:10px 14px"><p style="margin:0 0 6px">' + esc(why || 'クリップボードを読めませんでした。') + '<br>LANE NOTE の「JAAF用にコピー」の中身を、下に貼り付けてください（Ctrl+V）。</p><textarea data-lnx="ta" rows="6" style="width:100%;box-sizing:border-box;font-size:12px"></textarea><div data-lnx="go" role="button" tabindex="0" style="display:inline-block;margin-top:6px;background:#1f3a68;color:#fff;border-radius:999px;padding:6px 16px;cursor:pointer;font-weight:700">チェックを入れる</div><div data-lnx="err" style="color:#c8452b;margin-top:6px"></div></div>';
    hook(d);
    d.querySelector('[data-lnx="go"]').addEventListener('click', function () { try { run(parse(d.querySelector('[data-lnx="ta"]').value)); } catch (e) { d.querySelector('[data-lnx="err"]').textContent = e.message; } });
    return d;
  }
  function main(doc, win) {
    doc = doc || document; win = win || window;
    if (!doc.querySelector('input.checkbox_ids')) { win.alert('JAAFの大会エントリーの画面（種目ごとに選手の一覧がある画面）で押してください。'); return; }
    var run = function (data) { panel(doc, apply(doc, data), data); };
    var cl = win.navigator && win.navigator.clipboard;
    if (cl && cl.readText) cl.readText().then(function (t) { try { run(parse(t)); } catch (e) { askPaste(doc, run, e.message); } }, function () { askPaste(doc, run); });
    else askPaste(doc, run);
  }
  return { normEv: normEv, normName: normName, num: num, sections: sections, apply: apply, parse: parse, panel: panel, askPaste: askPaste, main: main, LIMIT: LIMIT };
})();
if (typeof module !== 'undefined') module.exports = LaneJaafBM;
