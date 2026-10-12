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
  const ts = () => { const v = 1760000000000 + (t++) * 1000; return { toMillis: () => v }; };
  const fix = o => { const r = {}; for (const k in o) r[k] = o[k] && o[k].__st ? ts() : o[k]; return r; };
  const deny = () => { const e = new Error('denied'); e.code = 'permission-denied'; throw e; };
  const canRead = p => { const tp = p.split('/').slice(0, 2).join('/'), d = store[tp]; if (!d) return true; return (d.active && !d.closed) || who === d.ownerUid; };
  const F = {
    doc: (fs, ...p) => ({ p: p.join('/') }), collection: (fs, ...p) => ({ p: p.join('/') }), query: (c, ...m) => ({ p: c.p, m }), orderBy: (f, dir) => ({ dir }), limit: n => ({ lim: n }), startAfter: x => ({ after: x }),
    serverTimestamp: () => ({ __st: 1 }), Timestamp: { fromMillis: m => ({ toMillis: () => m }) },
    getDoc: async r => { if (!canRead(r.p)) deny(); const d = store[r.p]; return { exists: () => !!d, data: () => d }; },
    getDocs: async c => { if (!canRead(c.p)) deny(); const m = c.m || [], desc = m.some(x => x && x.dir === 'desc'), lim = (m.find(x => x && x.lim) || {}).lim, after = (m.find(x => x && x.after) || {}).after; const pre = c.p + '/'; let out = Object.keys(store).filter(k => k.startsWith(pre) && !k.slice(pre.length).includes('/')).sort((a, b) => (store[a].createdAt?.toMillis?.() || 0) - (store[b].createdAt?.toMillis?.() || 0)).map(k => ({ id: k.slice(pre.length), data: () => store[k] })); if (desc) out.reverse(); if (after) out = out.slice(out.findIndex(x => x.id === after.id) + 1); if (lim) out = out.slice(0, lim); return { size: out.length, forEach: f => out.forEach(f) }; },
    setDoc: async (r, d, o) => { const tp = r.p.split('/').slice(0, 2).join('/'); if (r.p.startsWith('talks/') && r.p.includes('/msgs/') && !(store[tp] && store[tp].active && !store[tp].closed)) deny(); store[r.p] = o && o.merge ? { ...store[r.p], ...fix(d) } : fix(d); },
    updateDoc: async (r, d) => { const o = store[r.p]; if (r.p.split('/').length === 2 && r.p.startsWith('talks/') && o && 'note' in d && d.note !== o.note && !(d.noteAt && d.noteAt.__st)) deny(); store[r.p] = { ...o, ...fix(d) }; }, /* ルールと同じ：ひとことを変えるときは noteAt も更新 */ deleteDoc: async r => { delete store[r.p]; },
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
await check('v0.24.3：体調メモを先生に送る欄は一時停止（送る手段がない）', async () => {
  const w = page('http://127.0.0.1/index.html?t=' + TID); w.LaneTalk.setFirebase(fakeFS(store)); w.LanePersonal.cSet('2026-10-11', { s: 4 });
  w.LaneTalk.initLink(); await delay(60); const box = w.document.getElementById('tvBody');
  assert.equal(box.querySelector('.tk-csend'), null); assert.match(box.textContent, /止めています/); assert.equal(Object.values(store).filter(v => v.cond).length, 0);
});
await check('停止・削除されたら選手の画面にやり取りの欄を出さない（個人ページ・ホーム）', async () => {
  const api = page('http://127.0.0.1/records.html').LaneTalk.teacher(fakeFS(store, 'alice'), { uid: 'alice', epoch: 1 }, () => {});
  await api.setActive(TID, false); assert.equal(store['talks/' + TID].active, false); assert.equal(store['users/alice/talkIndex/' + TID].active, false);
  const w = page('http://127.0.0.1/index.html'); w.LaneTalk.setFirebase(fakeFS(store)); w.LaneTalk.remember(TID, '架空');
  const box = w.document.getElementById('ppTalk'); box.hidden = false; assert.equal(await w.LaneTalk.renderPlayer(box, TID), false); assert.equal(box.hidden, true); assert.equal(box.innerHTML, '');
  assert.equal(w.LaneTalk.saved().length, 0, '使えないIDは忘れる');
  await api.setActive(TID, true); await api.remove(TID);
  assert.equal(Object.keys(store).filter(k => k.includes(TID + '/msgs/')).length, 0, 'メッセージは消える');
  assert.equal(store['talks/' + TID].closed, true, '本体は「閉じた印」として残す（C301）'); assert.equal(store['talks/' + TID].name, ''); assert.equal(store['talks/' + TID].note, '');
  assert.equal(store['users/alice/talkIndex/' + TID].purged, true, '一覧に消し終わった印');
  const w2 = page('http://127.0.0.1/index.html?t=' + TID); w2.LaneTalk.setFirebase(fakeFS(store)); w2.LaneTalk.initLink(); await delay(60);
  assert.match(w2.document.getElementById('tvBody').textContent, /開けません/);
});
await check('個人ページの中身：やり取りのIDは20文字のときだけ通す', () => {
  const w = page('http://127.0.0.1/index.html'), P = w.LanePersonal;
  const o = { v: 1, k: 'pp', g: '', a: { name: '架空', team: '', grade: '' }, e: [] };
  assert.equal(P.sanitize({ ...o, tk: TID }).tk, '', '個人ページの tk は使わない（C302）'); assert.equal(P.sanitize({ ...o, tk: 'x"><img>' }).tk, ''); assert.equal(P.sanitize(o).tk, '');
});
await check('記録ページ：やり取りの画面（はじめはオフ・選手ごとに使う/停止/再開/削除・個人ページに tk を入れない）', () => {
  const r = src('records_app.js'), t = src('records_template.html');
  assert.match(t, /id="rbTalkOn"> <span><b>選手とのやり取りを使う<\/b>/); assert.doesNotMatch(t, /id="rbTalkOn" checked/);
  assert.ok(!r.includes('o.tk = tkx.id'));
  ['data-tknew', 'data-tkact', 'data-tkrm', 'data-tkopen', 'data-tkdel', 'tkAlive(sc, gen)'].forEach(s => assert.ok(r.includes(s), s));
});
await check('C303：新しい順に50件だけ読み、「前のやり取りを見る」で古いものを足す・投稿は msgs/m<n>', async () => {
  const st = {}, X = 'TalkPageing000000001'; st['talks/' + X] = { v: 2, ownerUid: 'alice', name: '架空 二郎', note: '', active: true, closed: false, n: 0, expiresAt: { toMillis: () => Date.now() + 864e5 } };
  const api = page('http://127.0.0.1/records.html').LaneTalk.teacher(fakeFS(st, 'alice'), { uid: 'alice', epoch: 1 }, () => {});
  for (let i = 1; i <= 60; i++) { st['talks/' + X].n = i - 1; await api.reply(X, '架空' + i); }
  assert.ok(st['talks/' + X + '/msgs/m60'], 'ID は m<n>'); assert.equal(st['talks/' + X].n, 60); assert.ok(st['talks/' + X + '/msgs/m60'].purgeAt, 'purgeAt を付ける');
  const w = page('http://127.0.0.1/index.html?t=' + X); w.LaneTalk.setFirebase(fakeFS(st)); w.LaneTalk.initLink(); await delay(60);
  const box = w.document.getElementById('tvBody'), items = [...box.querySelectorAll('.tk-body')].map(x => x.textContent);
  assert.equal(items.length, 50); assert.equal(items[49], '架空60', 'いちばん新しいものが最後に出る'); assert.equal(items[0], '架空11');
  assert.match(box.textContent, /架空 二郎 さん/, 'だれのやり取りかを出す（C306）');
  box.querySelector('.tk-more').click(); await delay(60);
  const all = [...box.querySelectorAll('.tk-body')].map(x => x.textContent); assert.equal(all.length, 60); assert.equal(all[0], '架空1');
});
await check('C305：ほかのアカウントのやり取りは顧問の画面で開かない', async () => {
  const st = { ['talks/TalkOther00000000001']: { v: 2, ownerUid: 'bob', name: '架空', active: true, closed: false, n: 0 } };
  const api = page('http://127.0.0.1/records.html').LaneTalk.teacher(fakeFS(st, 'alice'), { uid: 'alice', epoch: 1 }, () => {});
  await assert.rejects(api.read('TalkOther00000000001'), /このアカウント/);
  const r = src('records_app.js'); assert.ok(!/tkRun\([^;]*\.then\(function \(\) \{/.test(r), '.then は成功したときだけ続ける');
});
await check('C307：期限切れ・削除の途中のものを sweep で片づける', async () => {
  const st = {}, A = 'TalkExpired000000009', B = 'TalkHalfDel000000009';
  st['talks/' + A] = { v: 2, ownerUid: 'alice', name: '架空', note: 'x', active: true, closed: false, n: 1 }; st['talks/' + A + '/msgs/m1'] = { from: 'p', body: 'a' };
  st['talks/' + B] = { v: 2, ownerUid: 'alice', name: '', note: '', active: false, closed: true, n: 1 }; st['talks/' + B + '/msgs/m1'] = { from: 'p', body: 'b' };
  const api = page('http://127.0.0.1/records.html').LaneTalk.teacher(fakeFS(st, 'alice'), { uid: 'alice', epoch: 1 }, () => {});
  const n = await api.sweep([{ id: A, exp: Date.now() - 1000 }, { id: B, closed: true, exp: Date.now() + 864e5 }, { id: 'TalkFine000000000009', exp: Date.now() + 864e5 }]);
  assert.equal(n, 2); assert.equal(Object.keys(st).filter(k => k.includes('/msgs/')).length, 0); assert.equal(st['talks/' + A].closed, true);
});
await check('C306・C312：端末から全部消す・体調メモの中身を確かめて読む（HTMLを入れない）', () => {
  const w = page('http://127.0.0.1/index.html'), P = w.LanePersonal;
  w.localStorage.setItem('lanenote.cond.v1', JSON.stringify({ '2026-10-11': { s: '<img src=x onerror=alert(1)>', sl: '<b>8</b>', m: 'ok' }, 'bad': { s: 3 }, '2026-10-12': { s: 9 } }));
  const L = P.cList(); assert.equal(L.length, 1); assert.equal(L[0].c.s, null); assert.equal(L[0].c.sl, null); assert.equal(L[0].c.m, 'ok');
  assert.doesNotMatch(P.condBadge({ s: '<img>', sl: '<b>' }), /<img|<b>/);
  w.localStorage.setItem('lanenote.talks.v1', '{"TalkAbcdefghij012345":{}}'); w.LaneTalk.clearDevice(); assert.equal(w.localStorage.getItem('lanenote.talks.v1'), null);
  assert.match(src('mode.js'), /phWipe/); assert.match(src('app.js'), /PP = null; \$\('ppTalk'\)\.hidden = true/);
});
await check('R251：ひとことがある会話も削除できる（noteAt も一緒に更新）', async () => {
  const st = {}, X = 'TalkR251note00000001'; st['talks/' + X] = { v: 2, ownerUid: 'alice', name: '架空', note: '架空のひとこと', active: true, closed: false, n: 1 }; st['talks/' + X + '/msgs/m1'] = { from: 'p', body: 'a' };
  const api = page('http://127.0.0.1/records.html').LaneTalk.teacher(fakeFS(st, 'alice'), { uid: 'alice', epoch: 1 }, () => {});
  assert.equal(await api.remove(X), true); assert.equal(st['talks/' + X].closed, true); assert.equal(st['talks/' + X].note, ''); assert.equal(Object.keys(st).filter(k => k.includes('/msgs/')).length, 0); assert.equal(st['users/alice/talkIndex/' + X].purged, true);
});
await check('R251：sweep は1件失敗しても、ほかの片づけを続ける', async () => {
  const st = {}, A = 'TalkSweepBad00000001', B = 'TalkSweepOk000000001';
  st['talks/' + B] = { v: 2, ownerUid: 'alice', name: '', note: '', active: false, closed: true, n: 1 }; st['talks/' + B + '/msgs/m1'] = { from: 'p', body: 'b' };
  const fb = fakeFS(st, 'alice'), up = fb.F.updateDoc; fb.F.updateDoc = async (r, d) => { if (r.p === 'talks/' + A) { const e = new Error('denied'); e.code = 'permission-denied'; throw e; } return up(r, d); };
  const api = page('http://127.0.0.1/records.html').LaneTalk.teacher(fb, { uid: 'alice', epoch: 1 }, () => {});
  st['talks/' + A] = { v: 2, ownerUid: 'alice', name: 'x', note: '', active: true, closed: false, n: 0 };
  const n = await api.sweep([{ id: A, exp: Date.now() - 1 }, { id: B, closed: true }]); assert.equal(n, 1); assert.equal(api.lastSweep.errors, 1); assert.equal(st['users/alice/talkIndex/' + B].purged, true);
});
await check('R254：5001件あっても、空を確かめるまで purged にしない・次の sweep で続きを消す', async () => {
  const st = {}, X = 'TalkR254many00000001'; st['talks/' + X] = { ownerUid: 'alice', name: '', note: '', active: false, closed: true };
  for (let i = 1; i <= 5001; i++) st['talks/' + X + '/msgs/x' + i] = { from: 'p', body: 'a', createdAt: { toMillis: () => i } };
  const api = page('http://127.0.0.1/records.html').LaneTalk.teacher(fakeFS(st, 'alice'), { uid: 'alice', epoch: 1 }, () => {});
  assert.equal(await api.purge(X), false, '上限で止まったら未完了'); assert.notEqual((st['users/alice/talkIndex/' + X] || {}).purged, true); assert.equal(Object.keys(st).filter(k => k.includes('/msgs/')).length, 1);
  assert.equal(await api.sweep([{ id: X, closed: true }]), 1); assert.equal(Object.keys(st).filter(k => k.includes('/msgs/')).length, 0); assert.equal(st['users/alice/talkIndex/' + X].purged, true);
});
await check('R253：「この端末から全部消す」のあとに、読み込み中だった会話リンクが戻らない', async () => {
  const st = {}, X = 'TalkR253wipe00000001'; st['talks/' + X] = { v: 2, ownerUid: 'alice', name: '架空', note: '', active: true, closed: false, n: 0 };
  const fb = fakeFS(st); let release; const hold = new Promise(r => { release = r; }); const g = fb.F.getDoc; fb.F.getDoc = async r => { await hold; return g(r); };
  const w = page('http://127.0.0.1/index.html'); w.LaneTalk.setFirebase(fb); w.LaneTalk.remember(X, '架空');
  const box = w.document.getElementById('ppTalk'); const p = w.LaneTalk.renderHomeCard(box, []); await delay(20);
  w.LaneTalk.clearDevice(); assert.equal(w.localStorage.getItem('lanenote.talks.v1'), null);
  release(); await p; await delay(30);
  assert.equal(w.localStorage.getItem('lanenote.talks.v1'), null, 'リンクが再保存されない'); assert.doesNotMatch(box.innerHTML, /先生とのやり取り/);
  assert.match(src('mode.js'), /if \(window\.LaneTalk\) LaneTalk\.clearDevice\(\)/);
});
await check('R255：アカウント切り替えで、会話本文・招待URL・一覧を DOM から消す', () => {
  const r = src('records_app.js'); assert.match(r, /\$\('rbTalkThread'\)\.innerHTML = ''; \$\('rbTalkList'\)\.innerHTML = ''/);
});
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);
