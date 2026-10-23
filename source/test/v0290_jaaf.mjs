// v0.29.0 JAAF入力の手伝い：登録番号・JAAF用にコピー・ブックマークレット（架空の見本の画面だけで確かめる）
import assert from 'node:assert/strict'; import { createRequire } from 'node:module'; import fs from 'node:fs'; import { JSDOM } from 'jsdom';
import { mockHtml, mockData, MOCK_OPTS } from './jaaf_mock.mjs';
const req = createRequire(import.meta.url), B = req('../src/jaafbm.js'), RO = req('../src/roster.js'), E = req('../src/entrydraft.js'), R = req('../src/results.js');
const root = new URL('../../', import.meta.url);
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.29.0] JAAF入力の手伝い');
function page(opts = MOCK_OPTS) {
  const dom = new JSDOM(mockHtml(opts), { url: 'https://example.invalid/user/competition/?mode=entry', runScripts: 'outside-only' });
  const w = dom.window, d = w.document, spy = { clicks: 0, submits: 0, change: 0, net: 0 };
  d.querySelectorAll('button').forEach(b => b.addEventListener('click', () => spy.clicks++));
  d.getElementById('form-1').addEventListener('submit', e => { spy.submits++; e.preventDefault(); });
  w.HTMLFormElement.prototype.submit = () => { spy.submits++; }; w.HTMLFormElement.prototype.requestSubmit = () => { spy.submits++; };
  w.HTMLElement.prototype.click = function () { if (this.tagName === 'BUTTON') spy.clicks++; };
  w.fetch = () => { spy.net++; return Promise.reject(new Error('no')); }; w.XMLHttpRequest = function () { spy.net++; };
  d.addEventListener('change', e => { if (e.target.classList.contains('checkbox_ids')) spy.change++; });
  return { dom, w, d, spy };
}
const checked = d => [...d.querySelectorAll('input.checkbox_ids:checked')].map(c => c.name.match(/^input\[(\d+)\]\[(\d+)_/).slice(1).join(':'));
await check('種目名をそろえる：（規格）・全角半角・×/x・リレー・男/女', () => {
  assert.equal(B.normEv('男子110mH(106.7cm_9.14m)'), B.normEv('男子110mH'));
  assert.equal(B.normEv('男子 ４×１００ｍＲ'), B.normEv('男子4x100mR')); assert.equal(B.normEv('男子4×100mリレー'), B.normEv('男子4×100mR'));
  assert.equal(B.normEv('男100m'), B.normEv('男子100m')); assert.equal(B.normEv('女子砲丸投(4.000kg)'), B.normEv('女子砲丸投'));
  assert.notEqual(B.normEv('男子100m'), B.normEv('女子100m')); assert.notEqual(B.normEv('男子100m'), B.normEv('男子100mH'));
  assert.equal(B.normName('架空　一郎'), B.normName('架空 一郎')); assert.equal(B.num('００９０００００００１'), '900000001');
});
await check('見本の画面：会員ID→登録番号→名前の順に見つけ、名前だけは印をつける', () => {
  const { d, spy } = page(), res = B.apply(d, mockData()), c = checked(d);
  assert.ok(c.includes('91001:00900000001') && c.includes('91002:00900000001'), '架空 一郎 100m・200m');
  assert.ok(c.includes('91004:00900000002'), '110mH（規格つき）を登録番号で'); assert.ok(c.includes('91007:00900000003'), '走幅跳を名前で');
  assert.ok(res.filled.find(f => f.name === '見本 二郎').how === 'reg'); assert.equal(res.filled.find(f => f.event === '男子100m').how, 'id');
  assert.deepEqual(res.nameOnly, ['男子走幅跳：試験 三太']);
  assert.equal(d.querySelector('#tr_checkbox_91007_00900000003_1009999').getAttribute('data-lnjaaf'), 'name');
  assert.equal(d.querySelector('#tr_checkbox_91001_00900000001_1009999').getAttribute('data-lnjaaf'), 'ok');
  assert.ok(spy.change >= res.filled.length, 'change を送る');
});
await check('1人2種目まで（リレーは数えない）・グレー/えらべない行は飛ばす・種目なし・選手なし', () => {
  const { d } = page(), res = B.apply(d, mockData()), c = checked(d);
  assert.ok(!c.includes('91003:00900000001'), '3種目目の400mは入れない'); assert.ok(res.skipped.some(s => /400m：架空 一郎（1人2種目まで）/.test(s)));
  assert.ok(c.includes('91005:00900000001'), 'リレーは2種目のあとでも入れる');
  assert.ok(!c.includes('91001:00900000005') && res.skipped.some(s => /仮名 五月（グレーの行）/.test(s)));
  assert.ok(!c.includes('91008:00900000004') && res.skipped.some(s => /例題 四郎（えらべない/.test(s)));
  assert.deepEqual(res.noEvent, ['男子三段跳：模擬 六太']); assert.deepEqual(res.noAthlete, ['男子200m：不在 太郎']);
  assert.equal(res.filled.length, 4 + 4);
});
await check('すでにチェックが入っている分も2種目に数える', () => {
  const { d } = page(Object.assign({}, MOCK_OPTS, { pre: { '91007_00900000001': 1 } })), res = B.apply(d, mockData());
  assert.ok(!checked(d).includes('91002:00900000001')); assert.ok(res.skipped.some(s => /200m：架空 一郎（1人2種目まで）/.test(s)));
});
await check('ボタンを押さない・送信しない・連絡先と mode にさわらない・通信しない', () => {
  const { d, spy } = page(); B.apply(d, mockData()); B.panel(d, B.apply(d, mockData()), mockData());
  assert.equal(spy.clicks, 0); assert.equal(spy.submits, 0); assert.equal(spy.net, 0);
  ['name', 'tel', 'email'].forEach(k => assert.equal(d.querySelector(`[name="contact[${k}]"]`).value, ''));
  assert.equal(d.getElementById('hidden-mode').value, '');
  const src = fs.readFileSync(new URL('../src/jaafbm.js', import.meta.url), 'utf8').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  for (const bad of ['.click(', '.submit(', 'requestSubmit', 'button-save', 'button-next', 'contact[', 'hidden-mode', '$.ajax', 'fetch(', 'XMLHttpRequest', 'sendBeacon', 'localStorage']) assert.ok(!src.includes(bad), bad);
});
await check('まとめの枠：件数と4つの一覧・送信していない旨', () => {
  const { d } = page(), p = B.panel(d, B.apply(d, mockData()), mockData()), t = p.textContent;
  assert.ok(/8件入れた/.test(t)); for (const k of ['種目なし（1）', '選手なし（1）', '名前だけで一致（1）', '飛ばした（3）', '送信・確認のボタンは押していません']) assert.ok(t.includes(k), k);
  assert.ok(t.includes('架空 秋季競技会(見本)'));
});
await check('形のちがうJSONは止める', () => { assert.throws(() => B.parse('abc')); assert.throws(() => B.parse('{"v":2,"entries":[]}')); assert.equal(B.parse('{"v":1,"entries":[]}').relays.length, 0); });
await check('jaaf.html のボタン（javascript:）を見本の画面で動かす：クリップボード→チェック／読めないときは貼り付け欄', async () => {
  const h = fs.readFileSync(new URL('jaaf.html', root), 'utf8'), m = h.match(/id="jfBm" href="([^"]+)"/); assert.ok(m);
  const href = m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  assert.ok(href.startsWith('javascript:')); const code = decodeURIComponent(href.slice(11));
  const a = page(); Object.defineProperty(a.w.navigator, 'clipboard', { value: { readText: () => Promise.resolve(JSON.stringify(mockData())) }, configurable: true });
  a.w.eval(code); await new Promise(r => setTimeout(r, 20));
  assert.equal(checked(a.d).length, 8); assert.ok(a.d.getElementById('lnJaafPanel').textContent.includes('8件入れた')); assert.equal(a.spy.clicks + a.spy.submits + a.spy.net, 0);
  const b = page(); Object.defineProperty(b.w.navigator, 'clipboard', { value: { readText: () => Promise.reject(new Error('denied')) }, configurable: true });
  b.w.eval(code); await new Promise(r => setTimeout(r, 20));
  const pn = b.d.getElementById('lnJaafPanel'); assert.ok(pn.querySelector('textarea')); pn.querySelector('textarea').value = JSON.stringify(mockData());
  pn.querySelector('[data-lnx="go"]').dispatchEvent(new b.w.MouseEvent('click', { bubbles: true })); assert.equal(checked(b.d).length, 8); assert.equal(b.spy.clicks + b.spy.submits, 0);
});
await check('jaaf.html：阪田さん専用・送信しない・確認ページは自分で・ドラッグの説明・いつもの足元。メニューには出さない', () => {
  const h = fs.readFileSync(new URL('jaaf.html', root), 'utf8');
  for (const k of ['阪田さん専用', '送信は絶対にしない', '確認ページは自分で見る', 'ブックマークバー', 'ドラッグ', 'Presented by Sakata', 'noindex']) assert.ok(h.includes(k), k);
  for (const f of ['records.html', 'index.html', 'check.html', 'guide.html', 'team.html', 'schedule.html', 'try.html']) { const x = fs.readFileSync(new URL(f, root), 'utf8'); assert.ok(!/class="[^"]*(pn-|tb-)[^"]*"[^>]*href="jaaf\.html|href="jaaf\.html"[^>]*class="[^"]*(pn-|tb-)/.test(x), f); }
  const rec = fs.readFileSync(new URL('records.html', root), 'utf8'); assert.ok(rec.includes('href="jaaf.html"') && rec.includes('data-en="jaaf"'));
});
await check('選手台帳：登録番号・会員IDをきれいにして持つ（空なら持たない）・まとめて貼る', () => {
  const c = RO.clean({ aid: 'a1', name: '架空 一郎', regNo: '９０００１', jaafId: '009-0000-0001' }); assert.equal(c.regNo, '90001'); assert.equal(c.jaafId, '00900000001');
  const c2 = RO.clean({ aid: 'a1', name: 'x', regNo: 'abc', jaafId: '123' }); assert.ok(!('regNo' in c2) && !('jaafId' in c2));
  const p = RO.parseNums('架空 一郎 90001\n見本　二郎\t90002 00900000002\n不在 太郎 1\nだめな行', [{ aid: 'a1', name: '架空　一郎' }, { aid: 'a2', name: '見本 二郎' }]);
  assert.deepEqual(p.set.map(x => [x.aid, x.regNo, x.jaafId]), [['a1', '90001', ''], ['a2', '90002', '00900000002']]); assert.deepEqual(p.miss, ['不在 太郎 1']); assert.deepEqual(p.bad, ['だめな行']);
});
await check('JAAF用にコピーのJSON：登録番号・会員ID・種目名（男子100m）・公認ベスト・リレー。番号がない人は知らせる', () => {
  const rec = o => Object.assign({ meet: '架空記録会', date: '2026-09-01', event: '男子100m', round: '決勝', heat: '', name: '架空 一郎', kana: '', grade: '2', team: '架空高', mark: '11.50', wind: '+1.0', bib: '', lane: '', rank: 1, comment: '', aid: 'A1' }, o);
  const rows = [rec({}), rec({ name: '見本 二郎', aid: undefined, mark: '11.80' }), rec({ event: '男子4×100mR', name: '架空高', mark: '44.00', wind: '' })];
  const d = E.data(R, rows), P = E.newPlan(), k1 = d.athletes.find(a => a.name === '架空 一郎').key, k2 = d.athletes.find(a => a.name === '見本 二郎').key;
  P.picks[k1] = ['100m' in d.eventBy ? '100m' : d.athletes.find(a => a.key === k1).events[0].ev]; P.picks[k2] = [d.athletes.find(a => a.key === k2).events[0].ev];
  if (d.relays[0]) P.relays[d.relays[0].ev] = [{ label: 'A', members: [k1, k2] }];
  const j = E.jaafJson(R, d, P, k => k === k1 ? { regNo: '90001', jaafId: '00900000001' } : null, '架空 秋季');
  assert.equal(j.json.v, 1); assert.equal(j.json.meet, '架空 秋季');
  const e1 = j.json.entries.find(e => e.name === '架空 一郎'); assert.equal(e1.regNo, '90001'); assert.equal(e1.jaafId, '00900000001'); assert.equal(e1.event, '男子100m'); assert.equal(e1.record, '11.50'); assert.equal(e1.recMeet, '架空記録会'); assert.equal(e1.recDate, '2026-09-01');
  assert.deepEqual(j.noReg, ['見本 二郎']);
  if (d.relays[0]) { assert.equal(j.json.relays[0].event, '男子4×100mR'); assert.equal(j.json.relays[0].members.length, 2); }
  // ブックマークレットの種目名とそろう
  assert.equal(B.normEv(e1.event), B.normEv('男子100m'));
});
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
