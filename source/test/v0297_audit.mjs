// v0.29.7 監査（Astra 再監査 v0.29.6）R296-01〜07 の回帰テスト。架空データだけ・Firebase と通信はすべて差し替え（本番にはつながない）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), wait = (ms = 40) => new Promise(r => setTimeout(r, ms));
const req = createRequire(import.meta.url), R = req('../src/results.js'), E = req('../src/entrydraft.js'), S = req('../src/survey.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.29.7] 監査 R296-01〜07');

/* ---------- R296-01・02：顧問が読む答え ---------- */
const fakeDocs = rows => ({ F: { collection: (...a) => a.slice(1).join('/'), getDocs: async () => ({ forEach: f => rows.forEach(r => f({ id: r.id, data: () => r.v })) }) }, fs: {} });
await check('R296-01 印（d1・dv）がそろわない古い答えは nocmp（端末を比べられない）。同じ印なら警告なし、ちがえば moved', async () => {
  const a = await S.coach(fakeDocs([{ id: 'r0', v: { ev1: '男子100m' } }, { id: 'r1', v: { ev1: '男子100m', d1: 'A'.repeat(16), dv: 'A'.repeat(16) } }, { id: 'r2', v: { ev1: '男子100m', d1: 'A'.repeat(16), dv: 'B'.repeat(16) } }, { id: 'r3', v: { ev1: '男子100m', dv: 'B'.repeat(16) } }]), 'u').answers('X');
  assert.deepEqual([a[0].nocmp, a[0].moved, a[1].nocmp, a[1].moved, a[2].nocmp, a[2].moved, a[3].nocmp, a[3].moved], [true, false, false, false, false, true, true, false]);
});
await check('R296-02 r00・r01・r000 は顧問の表に入れない（本人の r0 の答えを隠さない）。別名の数を bad で知らせる', async () => {
  for (const order of [['r0', 'r00'], ['r00', 'r0']]) {
    const rows = order.map(id => ({ id, v: { ev1: id === 'r0' ? '男子100m' : '男子200m', d1: 'A'.repeat(16), dv: 'A'.repeat(16) } })).concat([{ id: 'r01', v: { ev1: '男子200m' } }, { id: 'r000', v: { ev1: '男子200m' } }, { id: 'r10', v: { ev1: '男子200m' } }]);
    const a = await S.coach(fakeDocs(rows), 'u').answers('X');
    assert.equal(a[0].ev1, '男子100m'); assert.equal(a[10].ev1, '男子200m'); assert.equal(a.bad, 3); assert.deepEqual(Object.keys(a).sort(), ['0', '10']);
  }
});
await check('R296-01 印なしで送り直さない（ルールに断られたらエラーのまま）', async () => {
  assert.ok(!/delete w\.d1; delete w\.dv/.test(src('survey.js')));
});
await check('R296-01・02 顧問の画面：「端末は比べられません」と、番号の書き方がちがう答えの知らせ', () => {
  const s = src('records_app.js'); assert.ok(s.includes('（端末は比べられません）')); assert.ok(s.includes('番号の書き方がちがう答えが'));
});

/* ---------- R296-03：答えの取り込みは置きかえ ---------- */
const rec = o => Object.assign({ name: '架空 一郎', kana: '', team: '架空中', grade: '2', event: '男子100m', mark: '12.40', wind: '+1.0', meet: '架空区大会', date: '2026-09-20', round: '決勝', heat: 1 }, o);
const ROWS = [rec({}), rec({ event: '男子200m', mark: '25.10' }), rec({ event: '男子走幅跳', mark: '5.80', wind: '+0.5' }), rec({ name: '架空 二郎', mark: '12.80' }), rec({ name: '架空 二郎', event: '男子200m', mark: '26.10' })];
const D = E.data(R, ROWS), K = n => D.athletes.find(a => a.name === n).key, EV = (n, l) => D.athletes.find(a => a.name === n).events.find(e => e.label === l).ev;
const SV = { roster: [{ n: '架空 一郎' }, { n: '架空 二郎' }], akeys: [K('架空 一郎'), K('架空 二郎')] };
const fee = P => E.fees ? null : null;
await check('R296-03 100m → 200m に変えた答えを入れ直すと、100m は外れて 200m だけ（参加料の数も1種目）', () => {
  const P = E.newPlan(); S.apply(E, D, P, SV, { 0: { ev1: '男子100m', ev2: '', relay: '' } });
  assert.deepEqual(P.picks[K('架空 一郎')], [EV('架空 一郎', '100m')]);
  const r = S.apply(E, D, P, SV, { 0: { ev1: '男子200m', ev2: '', relay: '' } });
  assert.deepEqual(P.picks[K('架空 一郎')], [EV('架空 一郎', '200m')]); assert.equal(r.picks, 1); assert.deepEqual(P.svAns[K('架空 一郎')], [EV('架空 一郎', '200m')]);
});
await check('R296-03 第2希望を取り消すと外れる。同じ答えをくり返しても増えない', () => {
  const P = E.newPlan(); S.apply(E, D, P, SV, { 0: { ev1: '男子100m', ev2: '男子走幅跳', relay: '' } });
  let r = S.apply(E, D, P, SV, { 0: { ev1: '男子100m', ev2: '男子走幅跳', relay: '' } }); assert.equal(r.picks, 0); assert.equal(P.picks[K('架空 一郎')].length, 2);
  S.apply(E, D, P, SV, { 0: { ev1: '男子100m', ev2: '', relay: '' } }); assert.deepEqual(P.picks[K('架空 一郎')], [EV('架空 一郎', '100m')]);
});
await check('R296-03 参加 → 出場しない：種目もリレーも下書きから外れ、out に名前', () => {
  const P = E.newPlan(); S.apply(E, D, P, SV, { 0: { ev1: '男子100m', ev2: '', relay: 'ok', rel: '' } });
  const relN = () => Object.values(P.relays).flat().reduce((m, t) => m + (t.members || []).filter(k => k === K('架空 一郎')).length, 0);
  const r = S.apply(E, D, P, SV, { 0: { ev1: '', ev2: '', relay: '', rel: '', join: false } });
  assert.equal(P.picks[K('架空 一郎')], undefined); assert.equal(relN(), 0); assert.deepEqual(r.out, ['架空 一郎']); assert.deepEqual(P.svAns[K('架空 一郎')], []);
});
await check('R296-03 手直し済の人は残す（欠場との矛盾は知らせる）。手直しを外すと最新の答え（欠場）に戻る＝種目なし', () => {
  const P = E.newPlan(); S.apply(E, D, P, SV, { 1: { ev1: '男子100m', ev2: '', relay: '' } });
  P.picks[K('架空 二郎')] = [EV('架空 二郎', '200m')]; P.hand = { [K('架空 二郎')]: 1 };
  const r = S.apply(E, D, P, SV, { 1: { ev1: '', ev2: '', relay: '', join: false } });
  assert.deepEqual(P.picks[K('架空 二郎')], [EV('架空 二郎', '200m')]); assert.deepEqual(r.kept, ['架空 二郎']); assert.ok(r.skip.some(x => /出場しない/.test(x)));
  assert.deepEqual(P.svAns[K('架空 二郎')], [], '最新の答え（欠場）を覚える');
});
await check('R296-03 手で入れた種目（調査にない）は、手直し済でなくても答えの入れ直しで消さない。手で組んだリレーも消さない', () => {
  const P = E.newPlan(); S.apply(E, D, P, SV, { 0: { ev1: '男子100m', ev2: '', relay: '' } });
  P.picks[K('架空 一郎')].push(EV('架空 一郎', '走幅跳'));
  const rl = D.relays[0]; if (rl) P.relays[rl.ev] = [{ label: 'A', members: [K('架空 一郎')] }];
  S.apply(E, D, P, SV, { 0: { ev1: '男子200m', ev2: '', relay: 'no' } });
  assert.deepEqual(P.picks[K('架空 一郎')].sort(), [EV('架空 一郎', '走幅跳'), EV('架空 一郎', '200m')].sort());
  if (rl) assert.deepEqual(P.relays[rl.ev][0].members, [K('架空 一郎')]);
});

/* ---------- R296-04・05・06：記録のページ（jsdom・Firebase は差し替え） ---------- */
function fakeFirebase({ read = async () => [], commit = async () => { } } = {}) {
  const auth = { currentUser: null, authStateReady: async () => { } };
  return { fs: {}, auth, A: { signOut: async () => { auth.currentUser = null; } }, F: {
    collection: (_, ...parts) => parts.join('/'), doc: (...a) => typeof a[0] === 'string' ? a.join('/') : a.slice(1).join('/'),
    getDocs: async p => { const rows = await read(p); return { metadata: { fromCache: false }, forEach: f => rows.forEach((r, i) => f({ id: r.id || String(i), data: () => r })) }; },
    getDoc: async () => ({ exists: () => false }), setDoc: async (p, d) => commit([{ op: 'set', path: p, data: d }]),
    writeBatch: () => { const ops = []; return { set: (p, d) => ops.push({ op: 'set', path: p, data: d }), delete: p => ops.push({ op: 'delete', path: p }), commit: () => commit(ops) }; } } };
}
async function harness(fb) {
  const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
  const dom = new JSDOM(html, { url: 'https://lane-note.web.app/records.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await wait();
  const w = dom.window; w.confirm = () => true; w.alert = () => { }; w.scrollTo = () => { }; w.HTMLElement.prototype.scrollIntoView = function () { };
  Object.assign(w, { TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response, Blob, File }); w.indexedDB = new IDBFactory();
  w.fetch = async u => { const t = new URL(String(u)).searchParams.get('url'); if (!t) throw Error('通信は禁止'); return new Response('<html><body>架空の空の結果一覧</body></html>', { headers: { 'X-Lane-Type': 'text/html', 'X-Lane-Url': t, 'Content-Type': 'text/html' } }); };
  for (const s of ['auth_common.js', 'results.js', 'urlload.js', 'plans.js', 'yearbuild.js']) w.eval(src(s));
  const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }'; assert.ok(src('records_app.js').includes(tail));
  w.eval(src('records_app.js').replace(tail, 'window.__t={onAuth,scope,ltx,lgetAll,migrateGuest,ybFind,getYB:()=>YB,getMets:()=>METS,setFB:(f)=>{FB=f;CLOUD_READY=true;}};renderAuth();'));
  w.__t.setFB(fb); return w;
}
await check('R296-05 1年分のまとめ：別のアカウント・ログアウトで、前の人の大会名・会場が残らない', async () => {
  const plan = { key: '2026-10-01|架空非公開予定A', date: '2026-10-01', meet: '架空非公開予定A', venue: '架空の非公開施設A', plan: true };
  const fb = fakeFirebase({ read: async p => p === 'users/alice/meets' ? [plan] : [] }), w = await harness(fb), t = w.__t;
  try {
    fb.auth.currentUser = { uid: 'alice' }; await t.onAuth(fb.auth.currentUser);
    w.document.getElementById('rbSchool').value = '架空高'; w.document.getElementById('rbYear').open = true;
    Object.assign(t.getYB(), { from: '2026-04-01', to: '2026-10-24', lim: 60000 });
    await t.ybFind(); assert.equal(t.getYB().rows.length, 1); assert.match(w.document.getElementById('ybBody').textContent, /架空非公開予定A/);
    fb.auth.currentUser = { uid: 'bob' }; await t.onAuth(fb.auth.currentUser); await wait();
    assert.doesNotMatch(w.document.getElementById('ybBody').textContent, /架空非公開予定A|架空の非公開施設A/); assert.equal(t.getYB().rows, null);
    fb.auth.currentUser = { uid: 'alice' }; await t.onAuth(fb.auth.currentUser); await t.ybFind();
    fb.auth.currentUser = null; await t.onAuth(null); await wait();
    assert.doesNotMatch(w.document.getElementById('ybBody').textContent, /架空非公開予定A|架空の非公開施設A/); assert.equal(t.getYB().rows, null);
  } finally { w.close(); }
});
await check('R296-06 移すとき：旧IDがぶつかった別の記録（所属ちがい）は新しいIDで移し、どちらも残す。本当に同じ記録だけ重ねない', async () => {
  const base = { name: '架空 太郎', event: '男子100m', mark: '12.00', wind: '+0.0', date: '2026-10-10', meet: '架空大会', round: '決勝', heat: 1, grade: '1' };
  const cloud = { ...base, team: '架空高' }, local = { ...base, team: '架空中' }, same = { ...base, team: '架空高', event: '男子200m', mark: '24.00' };
  cloud.id = R.recIdLegacy(cloud.meet, cloud.date, cloud); local.id = R.recIdLegacy(local.meet, local.date, local); same.id = R.recIdLegacy(same.meet, same.date, same);
  assert.equal(cloud.id, local.id); assert.notEqual(R.fullIdentity(cloud), R.fullIdentity(local));
  const writes = [], fb = fakeFirebase({ read: async p => p === 'users/alice/records' ? [cloud, same] : [], commit: async ops => writes.push(...ops) }), w = await harness(fb), t = w.__t;
  try {
    await t.ltx('readwrite', s => { s.put(local); s.put(Object.assign({}, same)); }, 'lanenote-records');
    fb.auth.currentUser = { uid: 'alice' }; await t.onAuth(fb.auth.currentUser);
    const o = await t.migrateGuest('move', t.scope()), rest = await t.lgetAll('lanenote-records');
    assert.equal(o.moved, 1); assert.equal(o.dup, 1); assert.equal(o.kept, 0); assert.equal(rest.length, 0);
    const put = writes.filter(x => x.op === 'set' && /records/.test(String(x.path)));
    assert.equal(put.length, 1); assert.equal(put[0].data.team, '架空中'); assert.notEqual(put[0].data.id, cloud.id); assert.equal(put[0].data.id, R.recId(local.meet, local.date, local));
  } finally { w.close(); }
});
await check('R296-04 大会の印に文字でない日付（entryAt・payAt が地図）があっても、記録のページは止まらず描きかえる。md は文字の日付だけ', async () => {
  const bad = { key: '2026-11-01|架空テスト大会', date: '2026-11-01', meet: '架空テスト大会', plan: true, entryAt: { unexpected: 'object' }, payAt: ['x'], payDue: { a: 1 } };
  const ok = { key: '2026-11-08|架空テスト大会2', date: '2026-11-08', meet: '架空テスト大会2', plan: true };
  const fb = fakeFirebase({ read: async p => p === 'users/alice/meets' ? [bad, ok] : [] }), w = await harness(fb), t = w.__t, errs = [];
  w.addEventListener('error', e => errs.push(e.message));
  try {
    fb.auth.currentUser = { uid: 'alice' }; await t.onAuth(fb.auth.currentUser); await wait(120);
    const M = t.getMets(); assert.equal(typeof M[bad.key].entryAt, 'undefined'); assert.equal(typeof M[bad.key].payAt, 'undefined'); assert.equal(M[bad.key].meet, '架空テスト大会');
    const lp = w.document.getElementById('lpHome'); assert.ok(lp && /架空テスト大会2/.test(lp.textContent), 'lpHome'); assert.deepEqual(errs, []);
    assert.equal(w.LanePlans.md({ unexpected: 1 }), ''); assert.equal(w.LanePlans.md(['x']), ''); assert.match(w.LanePlans.md('2026-11-01'), /^11\/1（/);
  } finally { w.close(); }
});

/* ---------- R296-07：CSP・service worker ---------- */
await check('R296-07 CSP：遮断する Content-Security-Policy（object-src none・base-uri self・frame-ancestors self）を足し、Report-Only（media-src self）も続ける', () => {
  const FJ = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8')), h = Object.fromEntries(FJ.hosting.headers.find(x => x.source === '**').headers.map(x => [x.key, x.value]));
  assert.equal(h['Content-Security-Policy'], "object-src 'none'; base-uri 'self'; frame-ancestors 'self'"); assert.match(h['Content-Security-Policy-Report-Only'], /media-src 'self'/);
});
await check('service worker：ページ（/・.html）だけ保存。mp4・PDF を直接開いても保存しない', async () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), L = {}, put = [];
  const self = { location: new URL('https://lane-note.web.app/sw.js'), addEventListener: (k, f) => { L[k] = f; }, skipWaiting() { }, clients: { claim() { } } };
  const caches = { open: async () => ({ put: async (k) => put.push(k), match: async () => null }), keys: async () => [], match: async () => null };
  const fetch = async () => ({ ok: true, clone() { return this; } });
  new Function('self', 'caches', 'fetch', 'Request', 'URL', sw)(self, caches, fetch, class { constructor(u) { this.url = u; } }, URL);
  for (const u of ['https://lane-note.web.app/img/manual/video/team.mp4', 'https://lane-note.web.app/x.pdf', 'https://lane-note.web.app/manual.html', 'https://lane-note.web.app/']) {
    let resp = null; const waits = []; L.fetch({ request: { url: u, method: 'GET', mode: 'navigate' }, respondWith: p => { resp = p; }, waitUntil: p => waits.push(p) });
    if (resp) await resp; await Promise.all(waits);
  }
  assert.deepEqual(put.sort(), ['https://lane-note.web.app/', 'https://lane-note.web.app/manual.html']);
});
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
