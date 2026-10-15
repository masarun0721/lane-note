// v0.26.33 大会予定：大会準備の進み具合のバッジ・期限（大会終了の1か月後）が過ぎたPDFと、消した大会のPDFを消す（架空データのみ）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom'; import {IDBFactory} from 'fake-indexeddb';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8'), delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.33] 大会予定：大会準備のバッジ・PDFの片づけ');
const html = src('records_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
const K1 = '2026-10-24|架空新人大会', K2 = '2026-09-01|架空夏季記録会';
const d = new JSDOM(html, { url: 'https://masarun0721.github.io/lane-note/schedule.html', runScripts: 'outside-only', virtualConsole: new VirtualConsole() }); await delay();
const w = d.window; w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.fetch = () => Promise.reject(new Error('no network')); w.indexedDB = new IDBFactory();
w.eval('Date.now = (function () { return function () { return Date.parse("2026-10-14T03:00:00Z"); }; })();');
w.localStorage.setItem('lanenote-rec-meets', JSON.stringify({ [K1]: { key: K1, date: '2026-10-24', meet: '架空新人大会', plan: true }, [K2]: { key: K2, date: '2026-09-01', meet: '架空夏季記録会', plan: true } }));
w.localStorage.setItem('lanenote.prep.idx.v1', JSON.stringify({ '|': { [K1]: { kinds: { yoko: 1 } } }, 'uX|': { [K1]: { kinds: { yoko: 1, sl: 1, tt: 1 } } } }));
for (const s of ['auth_common.js', 'results.js', 'roster.js', 'team.js', 'plans.js', 'urlload.js']) w.eval(src(s));
w.eval(src('records_app.js').replace(tail, 'window.__t={planList:planList,mets:function(){return METS;},prepPurge:prepPurge,planDelete:planDelete,scope:scope,login:function(f,u,t){FB=f;USER={uid:u};TEAM=t;authEpoch++;}};AUTH_SEEN=true;renderAuth();reload();')); await delay(300);
const li = k => w.document.querySelector('#lpHome li[data-lpk="' + k + '"]');
await check('バッジ：この端末の印（同じアカウントのものだけ）→ 要項 ✓・スタートリスト 待ち・タイムテーブル 待ち（何もない大会は出さない）', () => {
  const t = li(K1).querySelector('.lp-prep').textContent; assert(/要項 ✓/.test(t) && /スタートリスト 待ち/.test(t) && /タイムテーブル 待ち/.test(t) && !/注意事項/.test(t), t);
});
await check('バッジ：クラウドの印（ほかのPCで入れたもの）も合わせる', () => {
  w.__t.mets()[K1].prep = { docs: { sl: { url: 'https://kaku.example/sl.pdf', at: 'x' } } }; w.__t.planList();
  assert(/スタートリスト ✓/.test(li(K1).querySelector('.lp-prep').textContent));
});
const store = new Map(), F = { doc: (fs_, ...a) => ({ path: a.join('/') }), deleteDoc: async r => { store.delete(r.path); }, setDoc: async (r, v) => { store.set(r.path, v); } };
await check('期限（大会終了の1か月後）が過ぎたPDFだけ消す（チーム）', async () => {
  w.__t.login({ F, fs: {} }, 'uA', { id: 'T1', role: 'manager' });
  for (const c of ['yoko_0', 'yoko_1', 'sl_0']) store.set('teams/T1/meets/' + K2 + '/pdf/' + c, {});
  const m = { prep: { docs: { yoko: { n: 2, exp: Date.parse('2026-10-02T00:00:00+09:00') }, sl: { n: 1, exp: Date.parse('2026-11-30T00:00:00+09:00') } } } };
  assert.equal(await w.__t.prepPurge(K2, m, w.__t.scope(), true), true);
  assert.deepEqual([...store.keys()], ['teams/T1/meets/' + K2 + '/pdf/sl_0']); assert.deepEqual(Object.keys(m.prep.docs), ['sl']);
});
await check('v0.26.40 版ごとのIDのかけら（種類_版ID_番号）も、期限が過ぎたら消す', async () => {
  for (const c of ['yoko_abcd1234_0', 'yoko_abcd1234_1', 'sl_0']) store.set('teams/T1/meets/' + K2 + '/pdf/' + c, {});
  const m = { prep: { docs: { yoko: { n: 2, v: 'abcd1234', exp: Date.parse('2026-10-02T00:00:00+09:00') }, sl: { n: 1, exp: Date.parse('2026-11-30T00:00:00+09:00') } } } };
  assert.equal(await w.__t.prepPurge(K2, m, w.__t.scope(), true), true);
  assert.deepEqual([...store.keys()], ['teams/T1/meets/' + K2 + '/pdf/sl_0']);
  store.clear();
});
await check('大会予定を消すと、その大会のPDFも消す（マネージャーも）', async () => {
  store.set('users/uB/meets/' + K1 + '/pdf/tt_0', {}); w.__t.login({ F, fs: {} }, 'uB', null);
  w.__t.mets()[K1].prep = { docs: { tt: { n: 1, exp: Date.now() + 1e9 } } };
  await w.__t.planDelete(K1); assert(!store.has('users/uB/meets/' + K1 + '/pdf/tt_0')); assert(!w.__t.mets()[K1] || !w.__t.mets()[K1].prep);
});
await check('大会の印の欄（PF）に prep：天気を直しても準備の保存は残る', () => { assert.match(src('records_app.js'), /'importedN', 'prep'\]/); assert.match(src('records_app.js'), /prep: m\.prep \|\| ''/); });
console.log(`v02633_prep_sched: ${pass} ok / ${fail} NG`); process.exit(fail ? 1 : 0);
