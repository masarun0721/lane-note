// v0.15：選手グラフに DNS・失格など（記録なし）を × で出す・「DNS・失格なども表示」の切り替え（jsdom・実際のソース）
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8');
let pass = 0, fail = 0; const delay = (ms = 30) => new Promise(r => setTimeout(r, ms));
async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const d = new JSDOM(html, { url: 'http://127.0.0.1:9090/records.html', runScripts: 'outside-only' }); const w = d.window;
w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {}; w.indexedDB = new IDBFactory(); w.fetch = () => Promise.reject(new Error('no network'));
w.eval(src('auth_common.js')); w.eval(src('results.js'));
w.eval(src('records_app.js').replace('if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }', 'window.__t={putMany,scope,reload};renderAuth();'));
const R = w.ResultParser, t = w.__t;
const mk = (date, mark, meet) => { const r = { name: '架空 一郎', team: '架空高', event: '男子100m', mark, wind: /^\d/.test(mark) ? '+0.5' : '', date, meet, grade: '1' }; r.id = R.recId(r.meet, r.date, r); return r; };
try {
  await t.putMany([mk('2026-04-01', '12.10', '春の大会'), mk('2026-05-01', 'DNS', '5月記録会'), mk('2026-06-01', '11.95', '県大会'), mk('2026-07-01', 'DQ', '夏の大会')], t.scope());
  await t.reload(t.scope());
  const key = R.athleteKey(mk('2026-04-01', '12.10', 'x'));
  await check('athleteProfile が記録なし（DNS・DQ）を noMarks に入れ、記録の点には入れない', () => {
    const e = R.athleteProfile([mk('2026-04-01', '12.10', 'a'), mk('2026-05-01', 'DNS', 'b'), mk('2026-06-01', 'DQ', 'c')], key).events[0];
    assert.equal(JSON.stringify(e.noMarks.map(x => x.mark)), '["DNS","DQ"]'); assert.equal(e.allPoints.length, 1);
  });
  w.location.hash = '#athlete=' + encodeURIComponent(key); await delay(60);
  const view = () => w.document.getElementById('rbView');
  await check('グラフの下に × が2つ（大会名・日付の説明つき）、チェックボックスは最初から入っている', () => {
    const xs = view().querySelectorAll('svg.spark g.nmx'); assert.equal(xs.length, 2);
    assert.match(xs[0].querySelector('title').textContent, /2026-05-01 5月記録会：DNS/);
    const cb = view().querySelector('input[data-shownm]'); assert(cb && cb.checked); assert.match(cb.parentNode.textContent, /DNS・失格なども表示/);
    assert.match(view().textContent, /× 2026-07-01 夏の大会：DQ/);
  });
  await check('チェックを外すと × が消え、「公認だけ」とは別に動く', () => {
    const cb = view().querySelector('input[data-shownm]'); cb.checked = false; cb.dispatchEvent(new w.Event('change', { bubbles: true }));
    assert.equal(view().querySelectorAll('svg.spark g.nmx').length, 0); assert.equal(view().querySelectorAll('svg.spark circle').length, 2);
    const cb2 = view().querySelector('input[data-shownm]'); assert(cb2 && !cb2.checked);
    cb2.checked = true; cb2.dispatchEvent(new w.Event('change', { bubbles: true })); assert.equal(view().querySelectorAll('svg.spark g.nmx').length, 2);
  });
} finally { w.close(); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
