// v0.26.9 安全面（画面側）：コードの制限の表示・見える人とリンク・機能の一時停止の表示。架空データのみ
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src'), ROOT = path.join(here, '../..');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 40) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
async function recW() {
  const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
  const d = new JSDOM(html, { url: 'https://masarun0721.github.io/lane-note/records.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await delay();
  const w = d.window; w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
  Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File });
  w.fetch = () => Promise.reject(new Error('network prohibited in tests')); w.indexedDB = new IDBFactory();
  for (const s of ['auth_common.js', 'results.js', 'urlload.js']) w.eval(src(s));
  let js = src('records_app.js'); const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }'; assert(js.includes(tail));
  w.eval(js.replace(tail, 'window.__t={codeLimits:codeLimits,safeHtml:safeHtml,adminHtml:adminHtml,applyFlags:applyFlags,FLAGS:FLAGS,SAFE:function(v){SAFE.data=v;},roleLabel:roleLabel};renderAuth();')); await delay(80); return w;
}
console.log('[v0.26.9] 安全面（画面）');
const w = await recW(), t = w.__t;
await check('コードの制限：制限なしは警告・期限／人数／承認を表示・使い切りと期限切れが分かる', () => {
  assert.match(t.codeLimits({}), /制限なし/);
  const s = t.codeLimits({ exp: Date.now() + 864e5, max: 3, used: 1, approve: true }); assert.match(s, /コードの期限/); assert.match(s, /1／3人/); assert.match(s, /承認/);
  assert.match(t.codeLimits({ max: 2, used: 2 }), /使い切り/); assert.match(t.codeLimits({ exp: Date.now() - 864e5 }), /期限切れ/);
});
await check('承認待ちの役割名', () => assert.match(t.roleLabel('pending'), /承認待ち/));
await check('見える人とリンク：チームの人数（承認待ちは数えない）・リンクとやり取りに「止める」', () => {
  t.SAFE({ members: [{ uid: 'a', name: '架空顧問', role: 'coach' }, { uid: 'b', name: '架空マネ', role: 'manager', expiresAt: Date.now() + 864e5 }, { uid: 'c', name: '架空待ち', role: 'pending' }], shares: [{ id: 'Abcdefghij', label: '架空の記録', exp: Date.now() + 864e5 }], talks: [{ id: 'T1', name: '架空選手', exp: Date.now() + 864e5 }] });
  const h = t.safeHtml(); assert.match(h, /（2人）/); assert.match(h, /data-safe="share" data-id="Abcdefghij"/); assert.match(h, /data-safe="talk" data-id="T1"/);
  t.SAFE({ members: null, shares: [], talks: [] }); assert.match(t.safeHtml(), /自分だけ/);
});
await check('管理者の画面：4つの機能のチェックと保存ボタン', () => { const h = t.adminHtml(); for (const k of ['talk', 'relay', 'counter', 'share']) assert.match(h, new RegExp('data-flag="' + k + '"')); assert.match(h, /data-safe="flags"/); });
await check('relay を止めると URL読み込みは通信せずにお知らせを出す（記録は見られる）', async () => {
  t.FLAGS.relay = false; t.FLAGS.note = '点検中'; t.applyFlags();
  let called = 0; w.fetch = () => { called++; return Promise.reject(new Error('x')); };
  const go = w.document.querySelector('[id$="UrlGo"]'); if (go) { const inp = w.document.querySelector('[id$="Url"]'); if (inp) inp.value = 'https://example.com/a.pdf'; go.click(); await delay(); assert.equal(called, 0); assert.match(w.document.body.textContent, /一時停止/); }
  t.FLAGS.relay = true; t.applyFlags();
});
await check('Worker：環境変数 RELAY_OFF=1 で 503 paused を返す・アプリは専用の案内を出す', () => {
  const wk = fs.readFileSync(path.join(ROOT, 'worker/worker.js'), 'utf8'); assert.match(wk, /env\.RELAY_OFF === "1"\) return txt\("paused", 503/);
  const ul = src('urlload.js'); assert.match(ul, /paused: 'いまは管理者が/); assert.match(ul, /setPaused: setPaused/);
});
await check('バックアップ・復元の手順書がある（Blaze が要ること・TTL の設定）', () => { const m = fs.readFileSync(path.join(ROOT, 'docs/backup_restore.md'), 'utf8'); assert.match(m, /Blaze/); assert.match(m, /purgeAt/); assert.match(m, /TTL/); });
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
