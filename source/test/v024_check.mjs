// v0.24：顧問モード／選手モード（jsdom・実際のソース・架空データ）
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8');
let pass = 0, fail = 0; const delay = (ms = 30) => new Promise(r => setTimeout(r, ms));
async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
const [MB, MP] = (() => { const t = src('mode_pick.html'), i = t.indexOf('\n'); return [t.slice(0, i), t.slice(i + 1)]; })();
const tpl = src('template.html').replace('__TOPBAR__', MB).replace('__MODEBTN__', MB).replace('__MODEPICK__', MP).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_0-9]+__/g, '');
function page(url, ls = {}) {
  const d = new JSDOM(tpl, { url, runScripts: 'outside-only' }), w = d.window;
  for (const k in ls) w.localStorage.setItem(k, ls[k]);
  w.confirm = () => true; w.scrollTo = () => {}; w.__playerNow = '2026-10-12T08:00:00';
  w.__meetApp = { decodePayload: async s => JSON.parse(decodeURIComponent(s)) };
  w.eval(src('player.js')); w.eval(src('personal.js')); w.eval(src('mode.js'));
  w.LaneMode.init(); return w;
}
const P = o => encodeURIComponent(JSON.stringify(o));
const meet = { v: 1, k: 'p', n: '架空記録会', d: '2026年10月18日', pl: '架空競技場', cp: '招集所', a: { name: '架空 一郎', grade: '2', team: '架空中', bib: '12' }, e: [['10:30', '10:00', '10:10', '男子100m', '予選', '2', 'レーン', '4', 0, '', 0]] };
const pp = { v: 1, k: 'pp', g: '2026-10-01T00:00:00Z', a: { name: '架空 一郎', team: '架空中', grade: '2' }, e: [{ l: '100m', lw: 1, n: 2, b: ['12.10', '+0.5', '2026-06-01', '県大会'], rf: null, p: [], x: [], r: [] }] };
const LS = { 'lanenote.player.v1.Meet000001': JSON.stringify({ p: P(meet), at: '2026-10-10T00:00:00Z', exp: Date.now() + 864e5 }), 'lanenote.player.v1.Pers000001': JSON.stringify({ kind: 'pp', p: P(pp), at: '2026-10-11T00:00:00Z', exp: Date.now() + 864e5 }) };
console.log('[v0.24 顧問モード／選手モード]');
await check('はじめての端末：どちらで使うかを聞く（顧問・コーチの方／選手・保護者の方）', async () => {
  const w = page('http://127.0.0.1/index.html'), d = w.document;
  assert.equal(d.getElementById('modePick').hidden, false); assert.match(d.getElementById('modePick').textContent, /顧問・コーチの方/); assert.match(d.getElementById('modePick').textContent, /選手・保護者の方/);
  d.querySelector('[data-mode="coach"]').click(); await delay();
  assert.equal(w.localStorage.getItem('lanenote.mode.v1'), 'coach'); assert.equal(d.getElementById('modePick').hidden, true); assert.ok(!d.body.classList.contains('ln-player')); assert.equal(d.getElementById('phome').hidden, true);
  assert.match(d.getElementById('modeSw').textContent, /顧問モード/);
});
await check('選手モード：簡単な画面（次の大会と招集・自己ベスト・体調メモ・自分の記録・もらったリンク）', async () => {
  const w = page('http://127.0.0.1/index.html', { ...LS, 'lanenote.mode.v1': 'player' }), d = w.document; await delay(80);
  assert.equal(d.getElementById('modePick').hidden, true, '2回目からは聞かない'); assert.ok(d.body.classList.contains('ln-player')); assert.equal(d.getElementById('phome').hidden, false);
  const t = d.getElementById('phBody').textContent;
  assert.match(t, /架空記録会/); assert.match(t, /最初の招集10:00/); assert.match(t, /最初の競技10:30/); assert.match(t, /12\.10/); assert.match(t, /体調/); assert.match(t, /自分の記録をつける/);
  assert.ok(d.querySelector('a[href="records.html?me=1"]')); assert.equal(d.querySelectorAll('.ph-links li').length, 2);
  assert.ok(d.querySelector('a.ph-next[href="http://127.0.0.1/?s=Meet000001"]'));
});
await check('選手モード：切りかえボタンで顧問モードに戻せる', async () => {
  const w = page('http://127.0.0.1/index.html', { 'lanenote.mode.v1': 'player' }), d = w.document; await delay();
  d.getElementById('modeSw').click(); assert.equal(d.getElementById('modePick').hidden, false); assert.equal(d.getElementById('mpClose').hidden, false);
  d.querySelector('[data-mode="coach"]').click(); assert.ok(!d.body.classList.contains('ln-player'));
});
await check('共有リンク（#p= ?s= ?t=）を開いたときはモードを聞かず、選手ホームも出さない', async () => {
  for (const u of ['http://127.0.0.1/index.html#p=1.abc', 'http://127.0.0.1/index.html?s=Abcdef1234', 'http://127.0.0.1/index.html?t=Abcdefghij0123456789']) {
    const w = page(u, { 'lanenote.mode.v1': 'player' }), w2 = page(u); await delay();
    assert.ok(!w.document.body.classList.contains('ln-player'), u); assert.equal(w2.document.getElementById('modePick').hidden, true, u);
  }
});
await check('選手モード：期限切れのリンクは出さない・削除できる', async () => {
  const w = page('http://127.0.0.1/index.html', { ...LS, 'lanenote.player.v1.Old0000001': JSON.stringify({ p: P(meet), at: 'x', exp: Date.now() - 1 }), 'lanenote.mode.v1': 'player' }), d = w.document; await delay(80);
  assert.equal(d.querySelectorAll('.ph-links li').length, 2);
  d.querySelector('[data-phforget="Meet000001"]').click(); await delay(80);
  assert.equal(w.localStorage.getItem('lanenote.player.v1.Meet000001'), null); assert.equal(d.querySelectorAll('.ph-links li').length, 1);
});
await check('記録ページ：records.html?me=1 で「個人で使う」になる', () => { assert.match(src('records_app.js'), /\[\?&\]me=1/); });
await check('v0.24.1：記録・照合・はじめての人のページにも同じ「モード」ボタンと選ぶ画面', () => {
  const B = f => fs.readFileSync(path.join(here, '../../' + f), 'utf8');
  for (const f of ['index.html', 'records.html', 'check.html', 'guide.html']) { const h = B(f); assert.equal((h.match(/id="modeSw"/g) || []).length, 1, f); assert.ok(h.includes('id="modePick"'), f); assert.ok(h.includes('var LaneMode'), f); assert.ok(!h.includes('__MODE'), f); }
});
await check('v0.24.1：ほかのページで選手モードを選ぶと大会準備（index.html・選手ホーム）へ・はじめての質問は出さない・記録ページは隠さない', async () => {
  const h = '<body><button id="modeSw"></button>' + src('mode_pick.html').split('\n').slice(1).join('\n') + '<main><p id="x">記録</p></main></body>';
  const d = new JSDOM(h, { url: 'http://127.0.0.1/lane-note/records.html', runScripts: 'outside-only' }), w = d.window; let went = '';
  w.scrollTo = () => {}; w.eval(src('mode.js').replace("location.href = 'index.html'", "window.__go = 'index.html'")); w.LaneMode.init();
  assert.equal(w.document.getElementById('modePick').hidden, true, '最初に聞かない');
  w.document.getElementById('modeSw').click(); assert.equal(w.document.getElementById('modePick').hidden, false);
  w.document.querySelector('[data-mode="player"]').click(); assert.equal(w.__go, 'index.html'); assert.equal(w.localStorage.getItem('lanenote.mode.v1'), 'player');
  w.LaneMode.apply(); assert.ok(!w.document.body.classList.contains('ln-player')); assert.match(w.document.getElementById('modeSw').textContent, /選手モード/);
});
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);
