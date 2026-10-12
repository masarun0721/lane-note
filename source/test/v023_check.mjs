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
Object.assign(w, { CompressionStream: globalThis.CompressionStream, DecompressionStream: globalThis.DecompressionStream, Response: globalThis.Response, Blob: globalThis.Blob, TextEncoder: globalThis.TextEncoder, TextDecoder: globalThis.TextDecoder });
w.eval(src('overlay.js')); w.eval(src('auth_common.js')); w.eval(src('results.js')); w.eval(src('print.js'));
w.eval(src('records_app.js').replace('if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }', 'window.__t={putMany,scope,reload,setTab:v=>{setTab(v);render();}};renderAuth();'));
const R = w.ResultParser, t = w.__t, $ = id => w.document.getElementById(id);
const mk = (name, ev, date, mark, meet, grade) => { const r = { name, team: '架空中', event: ev, mark, wind: /^\d/.test(mark) ? '+0.5' : '', date, meet, grade }; r.id = R.recId(r.meet, r.date, r); return r; };
const A = w.__recApp;
const Y = String(new Date().getFullYear());
console.log('[記録 v0.10.2 ホームから移動]');
$('rbSchool').value = '架空中';
await t.putMany([mk('山田 太郎', '男子100m', Y + '-04-01', '12.40', '春の大会', '2'), mk('山田 太郎', '男子100m', Y + '-06-01', '12.10', '県大会', '2'), mk('佐藤 花子', '女子200m', Y + '-06-01', '28.00', '県大会', '2')], t.scope()); await t.reload(t.scope()); await delay();
t.setTab('home'); await delay();
await check('最新の大会カード：押すと大会別でその大会・キーボードでも・PB の名前は選手ページへのリンクのまま', async () => {
  const cards = w.document.querySelectorAll('.meetcard'); assert.equal(cards.length, 2); assert.equal(cards[0].getAttribute('tabindex'), '0'); assert.match(cards[0].textContent, /この大会を見る →/);
  assert.ok(cards[0].querySelector('a.ath[href^="#athlete="]'));
  cards[1].querySelector('.card-h b').click(); await delay();
  assert.equal(A.getView().view, 'meet'); assert.equal(w.document.querySelector('[data-meetsel]').value, Y + '-04-01|春の大会');
  assert.equal(w.history.state.rbTab, 'meet');
  w.history.replaceState({ rbTab: 'home' }, ''); w.dispatchEvent(new w.PopStateEvent('popstate', { state: { rbTab: 'home' } })); await delay();
  assert.equal(A.getView().view, 'home', '戻るでホーム');
  const c0 = w.document.querySelector('.meetcard'); c0.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await delay();
  assert.equal(w.document.querySelector('[data-meetsel]').value, Y + '-06-01|県大会');
});
await check('上の数字：自己ベスト更新→全記録（今シーズンの更新だけ・解除できる）／選手→選手別／記録→全記録／大会→大会別', async () => {
  for (const [k, v] of [['ath', 'ath'], ['all', 'all'], ['meet', 'meet']]) { A.goView('home'); await delay(); w.document.querySelector(`[data-gokpi="${k}"]`).click(); await delay(); assert.equal(A.getView().view, v, k); }
  A.goView('home'); await delay(); w.document.querySelector('[data-gokpi="pb"]').click(); await delay();
  assert.equal(A.getView().view, 'all'); assert.equal(A.getView().allPB, true); assert.match($('rbView').textContent, /自己ベスト更新だけ表示中（1件）/);
  assert.match($('rbView').textContent, /12\.10/); assert.doesNotMatch($("rbView").textContent, /12\.40/);
  w.document.querySelector('[data-allpb-off]').click(); await delay();
});

console.log('[v0.23 大会まとめをリンクで共有]');
const store = {}; let confirmMsg = '';
const ts = ms => ({ toMillis: () => ms });
const FBm = { fs: {}, F: {
  doc: (fs, ...p) => p.join('/'), collection: (fs, ...p) => p.join('/'), serverTimestamp: () => 'ST', Timestamp: { fromMillis: ts },
  writeBatch: () => { const ops = []; return { set: (r, d) => ops.push([r, d]), delete: r => ops.push([r, null]), commit: async () => { ops.forEach(([r, d]) => { store[r] = d; }); } }; },
  getDoc: async r => { const x = store[r]; return { exists: () => !!x, data: () => x && Object.assign({}, x, { createdAt: ts(Date.now()), expiresAt: x.expiresAt }) }; },
  getDocs: async () => ({ forEach() {} }) } };
A.goView('meet'); await delay();
await check('ログインしていないときは「🔗 リンクで共有」を出さない', () => {
  assert.equal(w.document.querySelector('[data-msshare]'), null);
});
await check('ログイン中：大会まとめのボタンの隣に出る・注意書き（title・ⓘで開く）', async () => {
  A._cloud(FBm, { uid: 'u1', email: 'a@example.com' }); await delay();
  const b = w.document.querySelector('[data-msshare]'); assert.ok(b);
  assert.ok(b.closest('.rb-row').querySelector('[data-print="meet"]'), '大会まとめと同じ行');
  const tip = A.ms.tip(); assert.match(tip, /リンクを知っている人は誰でもログインなしで見られます。チーム全員の名前と記録が入るので、部員の中だけで共有してください。119日で見られなくなります。大会準備ページの「作った短いリンク」からいつでも止められます。/);
  assert.equal(b.title, tip);
  const i = b.parentNode.querySelector('.sh-i'), t2 = b.parentNode.querySelector('.sh-tip'); assert.ok(i && t2); assert.equal(t2.hidden, true); assert.equal(t2.textContent, tip);
  i.click(); assert.equal(t2.hidden, false); assert.equal(i.getAttribute('aria-expanded'), 'true'); i.click(); assert.equal(t2.hidden, true);
});
await check('作る前に同じ文の確認・やめたら何も書かない', async () => {
  w.confirm = m => { confirmMsg = m; return false; };
  w.document.querySelector('[data-msshare]').click(); await delay(100);
  assert.ok(confirmMsg.includes(A.ms.tip())); assert.equal(Object.keys(store).length, 0);
});
let url = '';
await check('作る：shares/{id}（4項目・1.形式・190000未満・119日）と shareIndex（ラベル「大会まとめ：…」）・records.html?s= のリンク・コピー/LINE/メール', async () => {
  w.confirm = () => true;
  w.document.querySelector('[data-msshare]').click(); await delay(400);
  const sk = Object.keys(store).filter(k => /^shares\//.test(k)), ik = Object.keys(store).filter(k => /^users\/u1\/shareIndex\//.test(k));
  assert.equal(sk.length, 1); assert.equal(ik.length, 1); assert.equal(sk[0].split('/')[1], ik[0].split('/')[3]);
  const sh = store[sk[0]]; assert.deepEqual(Object.keys(sh).sort(), ['createdAt', 'data', 'expiresAt', 'ownerUid']);
  assert.equal(sh.ownerUid, 'u1'); assert.match(sh.data, /^1\.[A-Za-z0-9_-]+$/); assert.ok(sh.data.length < 190000);
  const days = (sh.expiresAt.toMillis() - Date.now()) / 864e5; assert.ok(days > 118.9 && days <= 119.01, String(days));
  assert.match(store[ik[0]].label, /^大会まとめ：/);
  url = A.ms.state().url; assert.match(url, /records\.html\?s=[A-Za-z0-9]{10}$/);
  const box = w.document.querySelector('.ms-done'); assert.ok(box); assert.equal(box.querySelector('input').value, url);
  assert.ok(box.querySelector('[data-mscopy="url"]') && box.querySelector('[data-mscopy="line"]'));
  const mail = box.querySelector('a[href^="mailto:"]').getAttribute('href'); assert.ok(decodeURIComponent(mail).includes(url)); assert.match(decodeURIComponent(mail), /subject=.*大会まとめ/);
  const o = await A.ms.inflate(sh.data); assert.equal(o.k, 'ms'); assert.equal(o.v, 1); assert.ok(o.r.V.length >= 1);
});
await check('見る側：records.html?s=… をログインなしで開くと、同じデザインの大会まとめ＋「時点のコピー」の注意（読み取り専用）', async () => {
  A._cloud(FBm, null); await delay();
  w.history.replaceState(null, '', '/records.html?s=' + url.split('?s=')[1]);
  assert.equal(await A.ms.open(), true); await delay(200);
  assert.equal($('rbPrint').hidden, false); assert.ok($('rbPrintBody').querySelector('.ms-note'));
  assert.match($('rbPrintBody').querySelector('.ms-note').textContent, /時点のコピー.*読み取り専用/);
  assert.ok($('rbPrintBody').querySelector('.lp-page .lp-sum'), '大会まとめと同じ部品'); assert.match($('rbPrintBody').textContent, /山田 太郎/);
  w.history.replaceState(null, '', '/records.html'); w.document.body.classList.remove('ms-view');
});
await check('見る側：中身の文字は文字として出す（XSSなし）・期限切れ/止めたリンクは開かない', async () => {
  const o = { v: 1, k: 'ms', n: '<img src=x onerror=alert(1)>', d: '2026-10-11', sc: '<b>x</b>', g: new Date().toISOString(),
    r: { K: ['name', 'event', 'mark', 'date', 'meet', 'team', 'id'], V: [['<script>alert(1)</script>', '男子100m', '12.00', '2026-10-11', 'm', 't', 'a1']] }, h: { K: [], V: [] } };
  const h = A.ms.sheet(o, Date.now(), null); assert.doesNotMatch(h, /<script>|<img src=x/); assert.match(h, /&lt;script&gt;/);
  assert.throws(() => A.ms.sheet({ v: 1, k: 'ms', r: { K: ['__proto__'], V: [[1]] }, h: {} }), /記録がありません/);
  w.history.replaceState(null, '', '/records.html?s=ZZZZZZZZZZ'); await A.ms.open(); await delay(100);
  assert.match($('rbPrintBody').textContent, /開けません/); w.history.replaceState(null, '', '/records.html'); w.document.body.classList.remove('ms-view');
});
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
