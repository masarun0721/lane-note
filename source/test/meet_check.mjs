// v0.9.0（記録）：PDFにまとめる（印刷レイアウト）・選手を選ぶ画面（jsdom・実際のソース）
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8');
let pass = 0, fail = 0; const delay = (ms = 40) => new Promise(r => setTimeout(r, ms));
async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
const tpl = src('records_template.html');
const html = tpl.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const d = new JSDOM(html, { url: 'http://127.0.0.1:9090/records.html', runScripts: 'outside-only' }); const w = d.window;
let printed = 0, alerted = 0;
w.confirm = () => true; w.alert = () => { alerted++; }; w.print = () => { printed++; }; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {}; w.indexedDB = new IDBFactory(); w.fetch = () => Promise.reject(new Error('no net'));
w.eval(src('auth_common.js')); w.eval(src('results.js')); w.eval(src('print.js'));
w.eval(src('records_app.js').replace('if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }', 'window.__t={putMany,scope,reload,setTab:v=>{setTab(v);render();}};renderAuth();'));
const R = w.ResultParser, t = w.__t, $ = id => w.document.getElementById(id);
const mk = (name, ev, date, mark, meet, grade) => { const r = { name, team: '架空中', event: ev, mark, wind: /^\d/.test(mark) ? '+0.5' : '', date, meet, grade }; r.id = R.recId(r.meet, r.date, r); return r; };
console.log('[大会まとめ v0.9.2]');
try {
  w.document.getElementById('rbSchool').value = '架空中';
  const recs = [mk('山田 太郎', '男子100m', '2026-04-01', '12.40', '春の大会', '2'), mk('山田 太郎', '男子100m', '2026-06-01', '12.10', '県大会', '2'), mk('山田 太郎', '男子走幅跳', '2026-06-01', '5.10', '県大会', '2'), mk('見本 次郎', '男子100m', '2026-06-01', '12.80', '県大会', '1'), mk('例題 三郎', '男子100m', '2026-06-01', 'DNS', '県大会', '3'), mk('女子 花子', '女子100m', '2026-06-01', '13.50', '県大会', '2')];
  await t.putMany(recs, t.scope()); await t.reload(t.scope()); await delay();
  const ken = recs.filter(r => r.meet === '県大会');
  await check('meetSheet：見出し・集計（出場4人・記録5・PB1・初記録3）・PB更新の伸び・前回との差', () => {
    const s = w.LanePrint.meetSheet(R, ken, recs, { meet: '県大会', meetDate: '2026-06-01', school: '架空中', date: '2026-10-11', weather: '☀️ 晴れ 25℃' });
    assert.match(s, /MEET REPORT/); assert.match(s, /県大会/); assert.match(s, /2026\.06\.01/); assert.match(s, /晴れ 25℃/); assert.match(s, /出力日 2026-10-11/);
    assert.match(s, /<b>4<\/b><span>出場人数/); assert.match(s, /<b>5<\/b><span>記録数/); assert.match(s, /<b>1<\/b><span>PB更新/); assert.match(s, /<b>3<\/b><span>初記録/);
    assert.match(s, /−0\.30秒/); assert.match(s, /前のPB 12\.40/); assert.match(s, /lp-bpb">PB/); assert.match(s, /lp-bfs">初記録/);
    assert.match(s, /<tr class="lp-nm"><td class="lp-nmn">例題 三郎/); assert.doesNotMatch(s, /<button/);
    assert.ok(s.indexOf('12.10') < s.indexOf('12.80') && s.indexOf('12.80') < s.indexOf('DNS'), '記録の良い順・DNSは最後');
  });
  await check('大会別タブに3つのボタン、押すと大会まとめ・絞り込み（男子）を守る・印刷', async () => {
    t.setTab('meet'); await delay();
    const sel = w.document.querySelector('[data-meetsel]'); sel.value = '2026-06-01|県大会'; sel.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
    const bs = w.document.querySelectorAll('[data-print="meet"]'); assert.equal(bs.length, 3);
    bs[0].click(); await delay(); let b = $('rbPrintBody').innerHTML; assert.match(b, /MEET REPORT/); assert.match(b, /山田 太郎/); assert.equal(printed, 0);
    $('rbPrintClose').click();
    const p0 = printed; w.document.querySelector('[data-print="meet"][data-act="print"]').click(); await delay(); assert.equal(printed, p0 + 1);
  });
} catch (e) { fail++; console.log('  NG setup', e && e.stack || e); }
console.log(`meet_check: ${pass} passed, ${fail} failed`); if (fail) process.exit(1);
