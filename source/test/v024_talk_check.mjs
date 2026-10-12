// v0.24：選手とのやり取り（jsdom・実際のソース・架空データ・メモリ上の偽 Firestore。本番にはつながない）
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8');
let pass = 0, fail = 0; const delay = (ms = 30) => new Promise(r => setTimeout(r, ms));
async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
// 偽 Firestore：パス→データ。active でない・ないものは permission-denied（ルールと同じふるまいの一部だけ）
function fakeFS(store, who = 'anon') {
  let t = 1;
  const ts = () => ({ toMillis: () => 1760000000000 + (t++) * 1000 });
  const fix = o => { const r = {}; for (const k in o) r[k] = o[k] && o[k].__st ? ts() : o[k]; return r; };
  const deny = () => { const e = new Error('denied'); e.code = 'permission-denied'; throw e; };
  const canRead = p => { const tp = p.split('/').slice(0, 2).join('/'), d = store[tp]; if (!d) return true; return d.active || who === d.ownerUid; };
  const F = {
    doc: (fs, ...p) => ({ p: p.join('/') }), collection: (fs, ...p) => ({ p: p.join('/') }), query: c => c, orderBy: () => 0, limit: () => 0,
    serverTimestamp: () => ({ __st: 1 }), Timestamp: { fromMillis: m => ({ toMillis: () => m }) },
    getDoc: async r => { if (!canRead(r.p)) deny(); const d = store[r.p]; return { exists: () => !!d, data: () => d }; },
    getDocs: async c => { if (!canRead(c.p)) deny(); const pre = c.p + '/', out = Object.keys(store).filter(k => k.startsWith(pre) && !k.slice(pre.length).includes('/')).sort((a, b) => (store[a].createdAt?.toMillis?.() || 0) - (store[b].createdAt?.toMillis?.() || 0)).map(k => ({ id: k.slice(pre.length), data: () => store[k] })); return { forEach: f => out.forEach(f) }; },
    setDoc: async (r, d, o) => { const tp = r.p.split('/').slice(0, 2).join('/'); if (r.p.startsWith('talks/') && r.p.includes('/msgs/') && !(store[tp] && store[tp].active)) deny(); store[r.p] = o && o.merge ? { ...store[r.p], ...fix(d) } : fix(d); },
    updateDoc: async (r, d) => { store[r.p] = { ...store[r.p], ...fix(d) }; }, deleteDoc: async r => { delete store[r.p]; },
    writeBatch: () => { const ops = []; return { set: (r, d, o) => ops.push(() => F.setDoc(r, d, o)), update: (r, d) => ops.push(() => F.updateDoc(r, d)), delete: r => ops.push(() => F.deleteDoc(r)), commit: async () => { for (const f of ops) await f(); } }; },
  };
  F.getDocFromServer = F.getDoc; return { F, fs: {} };
}
const tpl = src('template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_0-9]+__/g, '');
function page(url) {
  const d = new JSDOM(tpl, { url, runScripts: 'outside-only' }), w = d.window; w.confirm = () => true; w.scrollTo = () => {};
  w.crypto.getRandomValues = a => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 248); return a; };
  w.eval(src('personal.js')); w.eval(src('talk.js')); return w;
}
console.log('[v0.24 選手とのやり取り]');
const store = {}, TID = 'TalkAbcdefghij012345';
await check('顧問：作る（20文字ID・119日・talkIndex）・ひとこと・停止/再開・返信', async () => {
  const w = page('http://127.0.0.1/records.html'), fb = fakeFS(store, 'alice'), sc = { uid: 'alice', epoch: 1 };
  const api = w.LaneTalk.teacher(fb, sc, () => {});
  assert.equal(JSON.stringify(await api.settings()), '{"enabled":false}', 'はじめはオフ');
  await api.setEnabled(true); assert.equal(store['users/alice/settings/talk'].enabled, true);
  const id = await api.create('架空中|架空 一郎', '架空 一郎'); assert.match(id, /^[A-Za-z0-9]{20}$/);
  const t = store['talks/' + id]; assert.equal(t.ownerUid, 'alice'); assert.equal(t.active, true); const days = (t.expiresAt.toMillis() - Date.now()) / 864e5; assert.ok(days > 118.9 && days <= 119, String(days));
  assert.equal(store['users/alice/talkIndex/' + id].akey, '架空中|架空 一郎');
  store['talks/' + TID] = { ...t }; Object.assign(store, { ['users/alice/talkIndex/' + TID]: { ...store['users/alice/talkIndex/' + id] } });
  await api.setNote(TID, '次はスタートを意識'); assert.equal(store['talks/' + TID].note, '次はスタートを意識');
  await api.reply(TID, 'がんばろう'); assert.equal(Object.keys(store).filter(k => k.startsWith('talks/' + TID + '/msgs/')).length, 1);
});
await check('顧問：途中でアカウントが変わったら止める（A01：開始時の uid と世代）', async () => {
  const w = page('http://127.0.0.1/records.html'); let ep = 1; const sc = { uid: 'alice', epoch: 1 };
  const chk = s => { if (s.epoch !== ep) { const e = new Error('changed'); e.code = 'auth-context-changed'; throw e; } };
  const api = w.LaneTalk.teacher(fakeFS(store, 'alice'), sc, chk); ep = 2;
  await assert.rejects(api.setNote(TID, '別の人'), /changed/); assert.equal(store['talks/' + TID].note, '次はスタートを意識');
  assert.throws(() => w.LaneTalk.teacher(fakeFS(store), { uid: null, epoch: 1 }, () => {}), /ログイン/);
});
await check('選手：?t= のリンクでひとこと・やり取り・返信・注意書き（なりすまし）', async () => {
  const w = page('http://127.0.0.1/index.html?t=' + TID); w.LaneTalk.setFirebase(fakeFS(store)); w.LaneTalk.initLink(); await delay(60);
  const d = w.document, box = d.getElementById('tvBody');
  assert.ok(d.body.classList.contains('talk-mode')); assert.match(box.textContent, /次はスタートを意識/); assert.match(box.textContent, /がんばろう/); assert.match(box.textContent, /あなたとして書きこめます/);
  box.querySelector('.tk-in').value = '<b>はい</b>'; box.querySelector('.tk-send').click(); await delay(80);
  const m = Object.values(store).filter(v => v.from === 'p'); assert.equal(m.length, 1); assert.equal(m[0].body, '<b>はい</b>');
  assert.ok(!box.querySelector('.tk-body b'), '文字として出す（XSSなし）'); assert.match(box.textContent, /<b>はい<\/b>/);
  assert.ok(JSON.parse(w.localStorage.getItem('lanenote.talks.v1'))[TID], 'スマホに覚える');
});
await check('選手：体調メモは「先生に送る」を押した日の分だけ送る', async () => {
  const w = page('http://127.0.0.1/index.html?t=' + TID); w.LaneTalk.setFirebase(fakeFS(store));
  w.LanePersonal.cSet('2026-10-11', { s: 4, sl: 7.5, m: '足が軽い' }); w.LanePersonal.cSet('2026-10-12', { s: 2, sl: 5, m: '内緒のメモ' });
  w.LaneTalk.initLink(); await delay(60);
  const box = w.document.getElementById('tvBody'), before = Object.keys(store).length;
  assert.equal(Object.values(store).filter(v => v.cond).length, 0, '開いただけでは送らない');
  box.querySelector('.tk-cday').value = '2026-10-11'; box.querySelector('.tk-csend').click(); await delay(80);
  const c = Object.values(store).filter(v => v.cond); assert.equal(c.length, 1); assert.equal(JSON.stringify(c[0].cond), JSON.stringify({ d: '2026-10-11', s: 4, sl: 7.5, m: '足が軽い' }));
  assert.ok(!JSON.stringify(store).includes('内緒のメモ')); assert.equal(Object.keys(store).length, before + 1);
  assert.match(w.document.getElementById('tvBody').textContent, /10月11日の体調/); assert.match(w.document.getElementById('tvBody').innerHTML, /送信済み/);
});
await check('停止・削除されたら選手の画面にやり取りの欄を出さない（個人ページ・ホーム）', async () => {
  const api = page('http://127.0.0.1/records.html').LaneTalk.teacher(fakeFS(store, 'alice'), { uid: 'alice', epoch: 1 }, () => {});
  await api.setActive(TID, false); assert.equal(store['talks/' + TID].active, false); assert.equal(store['users/alice/talkIndex/' + TID].active, false);
  const w = page('http://127.0.0.1/index.html'); w.LaneTalk.setFirebase(fakeFS(store)); w.LaneTalk.remember(TID, '架空');
  const box = w.document.getElementById('ppTalk'); box.hidden = false; assert.equal(await w.LaneTalk.renderPlayer(box, TID), false); assert.equal(box.hidden, true); assert.equal(box.innerHTML, '');
  assert.equal(w.LaneTalk.saved().length, 0, '使えないIDは忘れる');
  await api.setActive(TID, true); await api.remove(TID); assert.equal(Object.keys(store).filter(k => k.includes(TID)).length, 0, 'メッセージも一覧も消える');
  const w2 = page('http://127.0.0.1/index.html?t=' + TID); w2.LaneTalk.setFirebase(fakeFS(store)); w2.LaneTalk.initLink(); await delay(60);
  assert.match(w2.document.getElementById('tvBody').textContent, /開けません/);
});
await check('個人ページの中身：やり取りのIDは20文字のときだけ通す', () => {
  const w = page('http://127.0.0.1/index.html'), P = w.LanePersonal;
  const o = { v: 1, k: 'pp', g: '', a: { name: '架空', team: '', grade: '' }, e: [] };
  assert.equal(P.sanitize({ ...o, tk: TID }).tk, TID); assert.equal(P.sanitize({ ...o, tk: 'x"><img>' }).tk, ''); assert.equal(P.sanitize(o).tk, '');
});
await check('記録ページ：やり取りの画面（はじめはオフ・選手ごとに使う/停止/再開/削除・個人ページに tk を入れる）', () => {
  const r = src('records_app.js'), t = src('records_template.html');
  assert.match(t, /id="rbTalkOn"> <span><b>選手とのやり取りを使う<\/b>/); assert.doesNotMatch(t, /id="rbTalkOn" checked/);
  ['data-tknew', 'data-tkact', 'data-tkrm', 'data-tkopen', 'data-tkdel', 'o.tk = tkx.id', 'tkAlive(sc, gen)'].forEach(s => assert.ok(r.includes(s), s));
});
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);
