// v0.26.23 東京私学陸上情報（PC 用の速報）：中身は UTF-8 なのに <meta charset=Shift_JIS> のページ・表の形・リレー・NGR（架空データのみ）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src'), FX = path.join(here, 'fixtures');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.23] 東京私学陸上情報（PC 用）');
const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const d = new JSDOM(html, { url: 'https://masarun0721.github.io/lane-note/records.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await delay();
const w = d.window; w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {};
Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.fetch = () => Promise.reject(new Error('no network')); w.indexedDB = new IDBFactory();
for (const s of ['auth_common.js', 'results.js', 'roster.js', 'team.js']) w.eval(src(s));
const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
w.eval(src('records_app.js').replace(tail, 'window.__t={readHtml:readHtml};renderAuth();reload();')); await delay(150);
const R = w.ResultParser, rd = async (f, out) => w.__t.readHtml(new w.File([fs.readFileSync(path.join(FX, f))], f, { type: 'text/html' }), out);
await check('UTF-8 なのに charset=Shift_JIS と書かれたページも文字化けせずに読む（個人の表・NGR は備考・[10.571] は記録にしない）', async () => {
  const st = await rd('sgk_pc_individual.html'); const r = R.parseCells(st, {});
  assert.deepEqual(JSON.parse(JSON.stringify(r.recs.map(x => [x.event, x.name, x.team, x.mark, x.comment]).slice(0, 2))), [['男子高校 100m', '架空 一郎', '架空学園高', '10.58', 'NGR'], ['男子高校 100m', '見本 二郎', '見本大附高', '11.62', 'q']]);
  assert(R.matchSchool(r.recs[1].team, '見本大学附属高等学校'));
});
await check('Shift_JIS のページ（gold.jaic.org）は今までどおり Shift_JIS で読む', async () => {
  const out = []; const st = await rd('relay_gold_heat.html', out); assert.equal(out.length, 4); assert(/4×100m/.test(st[1].v));
});
await check('PC 用のリレーの表（チーム／メンバー・(1)〜(4)・カナ）：順位・レーン・チーム・記録・NGR・DQ と走者', async () => {
  const out = []; const st = await rd('sgk_pc_relay.html', out);
  assert.equal(st[0].v, '2026年8月19日');
  assert.deepEqual(out.map(c => [c.event, c.round, c.heat, c.rank, c.lane, c.team, c.mark, c.comment, c.runners.length]),
    [['男子4×100mR', 'タイムレース', 1, 1, 4, '架空学園高', '41.25', 'NGR', 4], ['男子4×100mR', 'タイムレース', 1, 2, 5, '見本高', '42.10', '', 4], ['男子4×100mR', 'タイムレース', 1, '', 3, '試験高', 'DQ', 'R1', 0]]);
  assert.deepEqual([out[0].runners[0].name, out[0].runners[0].kana, out[0].runners[0].grade], ['架空 一郎', 'ｶｸｳ ｲﾁﾛｳ'.normalize('NFKC'), '2']);
});
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
