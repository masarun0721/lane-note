// v0.31.1：記録帳の保存先が「チーム」のとき、大会準備の記録用紙の PB・前回はチームの記録から（架空データのみ・本番には接続しない）
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8');
let pass = 0, fail = 0; const delay = (ms = 30) => new Promise(r => setTimeout(r, ms));
async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
const R = require('../src/results.js');
const mk = (mark, wind, date, meet) => { const r = { name: '架空 太郎', team: '架空中', event: '男子100m', mark, wind, date, meet, grade: '2' }; r.id = R.recId(meet, date, r); return r; };
const teamRecs = [mk('12.20', '+0.5', '2026-05-10', '架空春季大会'), mk('11.95', '+1.0', '2026-07-05', '架空夏季大会'), mk('12.30', '+0.3', '2026-10-04', '架空秋季大会')];
const stale = [mk('12.20', '+0.5', '2026-05-10', '架空春季大会')];   // 個人の古い控え（1大会だけ）
const sl = () => ({ format: 'startlist', hasTimes: false, warnings: [], diag: [], relays: [], entries: [
  { team: '架空中', event: '男子 中学 100m', round: '予選', heat: 1, pos: 4, posKind: 'レーン', bib: '101', name: '架空 太郎', grade: '2', page: 1 }] });
const html = src('template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const d = new JSDOM(html, { url: 'http://127.0.0.1:9090/index.html', runScripts: 'outside-only' }); const w = d.window; await delay();
w.confirm = () => true; w.alert = () => {}; w.print = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
Object.assign(w, { TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response, Blob });
w.fetch = () => Promise.reject(new Error('network prohibited in tests')); w.indexedDB = new IDBFactory(); w.requestAnimationFrame = f => setTimeout(f, 0);
async function seed(name, rs) { await new Promise((ok, ng) => { const q = w.indexedDB.open(name, 1); q.onupgradeneeded = () => q.result.createObjectStore('records', { keyPath: 'id' }); q.onsuccess = () => { const t = q.result.transaction('records', 'readwrite'); rs.forEach(r => t.objectStore('records').put(r)); t.oncomplete = () => { q.result.close(); ok(); }; t.onerror = ng; }; q.onerror = ng; }); }
await seed('lanenote-cache-U1', stale); await seed('lanenote-records', stale);
w.eval(src('results.js')); w.eval(src('parser.js')); w.eval(src('logic.js')); w.eval(src('player.js')); w.eval(src('personal.js')); w.eval(src('auth_common.js'));
w.eval(src('app.js').replace('window.__meetApp = {', 'window.__pb={loadPBs:loadPBs,pbOf:pbOf,buildRecSheet:buildRecSheet};\n  window.__meetApp = {'));
w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await delay();
const app = w.__meetApp, $ = id => w.document.getElementById(id);
Object.assign(app.state, { sl: sl(), tt: [], teams: ['架空中'], slName: '架空.pdf' }); app.render(); await delay();
let teamFail = false, asked = [];
const user = { uid: 'U1' };
const F = { collection: (fs, ...p) => p.join('/'), getDocsFromServer: async p => { asked.push(p); if (teamFail) throw Object.assign(new Error('perm'), { code: 'permission-denied' }); const docs = teamRecs.concat([Object.assign({}, mk('10.00', '+0.0', '2026-10-20', '消した記録'), { _del: true })]); return { forEach: f => docs.forEach(x => f({ data: () => x })) }; } };
app.setFB({ auth: { currentUser: user }, F, fs: {} });
const row = () => app.state.rows.find(r => r.name === '架空 太郎');
await check('保存先がチーム：チームの記録（3大会）から PB 11.95・前回 12.30 秋季（PB と前回は別）・消した記録は使わない・注意は出ない', async () => {
  w.localStorage.setItem('lanenote.team.v1.U1', 'T_FAKE'); await w.__pb.loadPBs();
  assert.deepEqual(asked, ['teams/T_FAKE/records']);
  const p = w.__pb.pbOf(row()); assert.equal(p.best.mark, '11.95'); assert.equal(p.last.mark, '12.30'); assert.notEqual(p.best.mark, p.last.mark);
  w.__pb.buildRecSheet(); const t = $('recSheet').textContent; assert.match(t, /PB 11\.95/); assert.match(t, /前回 12\.30/); assert(!t.includes('⚠'));
});
await check('チームの記録が読めない：端末の控えで出し、用紙に「⚠ チームの記録を読めなかった」と出す', async () => {
  teamFail = true; await w.__pb.loadPBs(); const p = w.__pb.pbOf(row()); assert.equal(p.best.mark, '12.20');
  w.__pb.buildRecSheet(); assert.match($('recSheet').textContent, /⚠ チームの記録を読めなかったため、この端末の控え/); teamFail = false;
});
await check('保存先が自分だけ：今までどおり端末の控え（チームは読まない・注意なし）', async () => {
  w.localStorage.removeItem('lanenote.team.v1.U1'); asked = []; await w.__pb.loadPBs();
  assert.equal(asked.length, 0); assert.equal(w.__pb.pbOf(row()).best.mark, '12.20'); w.__pb.buildRecSheet(); assert(!$('recSheet').textContent.includes('⚠'));
});
await check('ログインしていない（この端末にチームの保存先あり）：控えで出し、ログインしていない注意', async () => {
  w.localStorage.setItem('lanenote.team.v1.U1', 'T_FAKE'); app.setFB({ auth: { currentUser: null }, F, fs: {} }); asked = []; await w.__pb.loadPBs();
  assert.equal(asked.length, 0); w.__pb.buildRecSheet(); assert.match($('recSheet').textContent, /⚠ ログインしていないため/);
});
console.log(`\n${pass} ok / ${fail} NG`); if (fail) process.exit(1);
