// v0.26.12 リレーの記録（手入力：タイム・走順・メンバー）。架空データのみ（ログインなしの端末保存）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
const R = createRequire(import.meta.url)('../src/results.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.12] リレー');
const LEGS = ['架空 一郎', '見本 太郎', '空想 健', '架空 次郎'];
await check('relayRecord：チーム名＋リレー・走順の文字・手入力の印', () => {
  const r = R.relayRecord({ team: '架空高', event: '男子4×100mR', mark: '43.21', date: '2026-09-13', meet: '架空記録会', legs: LEGS });
  assert.deepEqual(r.errors, []); assert.equal(r.rec.name, '架空高 リレー'); assert.equal(r.rec.legs, '1走 架空 一郎／2走 見本 太郎／3走 空想 健／4走 架空 次郎'); assert.equal(r.rec.manual, true); assert.equal(r.rec.wind, '');
  assert.deepEqual(R.parseLegs(r.rec.legs), LEGS);
});
await check('relayRecord：走順なしでも保存できる・3人だけ・リレーでない種目・チームなしはエラー', () => {
  assert.equal(R.relayRecord({ team: '架空高', event: '女子4×400mR', mark: '4:05.10', date: '2026-09-13', meet: 'x', legs: ['', '', '', ''] }).rec.legs, undefined);
  assert.match(R.relayRecord({ team: '架空高', event: '男子4×100mR', mark: '43.21', date: '2026-09-13', legs: LEGS.slice(0, 3) }).errors.join(), /4人とも/);
  assert.match(R.relayRecord({ team: '架空高', event: '男子100m', mark: '11.21', date: '2026-09-13' }).errors.join(), /リレーの種目/);
  assert.match(R.relayRecord({ team: '', event: '男子4×100mR', mark: '43.21', date: '2026-09-13' }).errors.join(), /チーム名/);
  assert(R.isRelay('女子4x400mR')); assert(R.isRelay('男子4×100mリレー')); assert(!R.isRelay('男子400mH'));
});
const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const d = new JSDOM(html, { url: 'https://masarun0721.github.io/lane-note/records.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await delay();
const w = d.window; w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.fetch = () => Promise.reject(new Error('no network')); w.indexedDB = new IDBFactory();
for (const s of ['auth_common.js', 'results.js', 'roster.js', 'team.js']) w.eval(src(s));
let js = src('records_app.js'); const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
w.eval(js.replace(tail, 'window.__t={putMany:putMany,reload:reload,scope:scope,all:function(){return ALL;}};renderAuth();reload();')); await delay(150);
const T = w.__t, doc = w.document;
await T.putMany(LEGS.map((n, i) => ({ id: 'p' + i, name: n, team: '架空高', date: '2026-06-01', event: '男子100m', mark: (11.5 + i / 10).toFixed(2), wind: '+0.5', meet: '架空記録会' })), T.scope()); await T.reload(T.scope()); await delay();
const fill = (o) => { for (const [k, v] of Object.entries(o)) { const e = doc.querySelector('[data-rl="' + k + '"]'); e.value = v; } };
await check('ホームの「🏃 リレーの記録」から入れる：走順の名前の候補は記録の選手', async () => {
  const box = doc.querySelector('.rl-home'); assert(box); assert.equal(doc.querySelectorAll('#rlNames option').length, 4);
  fill({ date: '2026-09-13', meet: '架空記録会', event: '男子4×100mR', team: '架空高', mark: '43.21', round: '決勝', rank: '2' }); LEGS.forEach((n, i) => { doc.querySelector('[data-rl-leg="' + i + '"]').value = n; });
  doc.querySelector('[data-relay="save"]').click(); await delay(250);
  const r = T.all().find(x => x.event === '男子4×100mR'); assert(r, '保存されていない'); assert.equal(r.legs.split('／').length, 4); assert.equal(r.rank, 2);
});
await check('2本目（遅い）を入れると、種目ごとに速い順・チーム最高の印', async () => {
  fill({ date: '2026-10-04', meet: '架空新人戦', event: '男子4×100mR', team: '架空高', mark: '43.80', round: '', rank: '' }); [0, 1, 2, 3].forEach(i => { doc.querySelector('[data-rl-leg="' + i + '"]').value = LEGS[3 - i]; });
  doc.querySelector('[data-relay="save"]').click(); await delay(250);
  const li = doc.querySelectorAll('.rl-list li'); assert.equal(li.length, 2); assert.match(li[0].textContent, /43\.21.*チーム最高/); assert.match(li[1].textContent, /1走 架空 次郎/);
});
await check('走順を直す：同じ記録のまま走順だけ変わる', async () => {
  const id = T.all().find(x => x.mark === '43.80').id; [...doc.querySelectorAll('[data-relay="edit"]')].find(b => b.getAttribute('data-id') === id).click(); await delay();
  ['空想 健', '見本 太郎', '架空 次郎', '架空 一郎'].forEach((n, i) => { doc.querySelector('[data-rl-leg="' + i + '"]').value = n; }); assert.equal(doc.querySelector('[data-rl="mark"]').value, '43.80'); doc.querySelector('[data-relay="save"]').click(); await delay(250);
  const r = T.all().find(x => x.mark === '43.80'); assert.match(r.legs, /^1走 空想 健／2走 見本 太郎／3走 架空 次郎/); assert.equal(T.all().filter(x => R.isRelay(x.event)).length, 2);
  if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, doc.querySelector('.rl-home').outerHTML);
});
await check('入力のまちがいはお知らせ（保存しない）', async () => { fill({ team: '', mark: '43.00' }); doc.querySelector('[data-relay="save"]').click(); await delay(150); assert.match(doc.getElementById('rlStatus').textContent, /チーム名/); assert.equal(T.all().filter(x => R.isRelay(x.event)).length, 2); });
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
