// v0.28.0 📮 エントリー調査リンク：中身の関数・顧問の画面（記録→エントリー下書き）・選手の画面（index.html?q=…・ログインなし）
//   Chrome・ローカル・偽の Firebase（fake_firebase.mjs）・架空データだけ。権限のルールは rules_survey_check.mjs（エミュレーター）で確かめる
//   node v0280_survey.mjs [スクショの保存先フォルダ]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module'; import puppeteer from 'puppeteer-core';
import {install} from './fake_firebase.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), SHOT = process.argv[2] || '';
const req = createRequire(import.meta.url), R = req('../src/results.js'), E = req('../src/entrydraft.js'), S = req('../src/survey.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.28.0] エントリー調査リンク');
const rec = o => { const r = Object.assign({ meet: '架空区大会', date: '2026-09-20', event: '男子100m', round: '決勝', heat: '', name: '架空 一郎', kana: '', grade: '2', team: '架空中', mark: '12.40', wind: '+1.0', bib: '', lane: '', rank: 1, comment: '' }, o); r.id = R.recId(r.meet, r.date, r); return r; };
const ROWS = [rec({}), rec({ event: '男子走幅跳', mark: '5.80', wind: '+0.5' }), rec({ event: '男子200m', mark: '24.50', wind: '+1.1' }), rec({ name: '架空 二郎', mark: '12.80', grade: '1' }), rec({ name: '架空 三郎', mark: '12.90' }), rec({ name: '架空 四郎', mark: '13.00', grade: '3' }),
  rec({ event: '男子4×100mR', name: '架空中', mark: '47.50', wind: '' }), rec({ name: '架空 花子', event: '女子100m', mark: '13.50', wind: '+0.2' }), rec({ name: '架空 桃子', event: '女子100m', mark: '13.90', wind: '+0.2', grade: '1' })];
const D = E.data(R, ROWS), K = n => D.athletes.find(a => a.name === n).key;
// ---------- 中身の関数 ----------
await check('作る中身：名簿0人・種目0・締切が今日以前／120日後・大会名なしは作らない。公開の中身に選手のキーは入れない', async () => {
  const o = { meet: '架空 秋季', sexes: 'm', roster: [{ n: '架空 一郎', g: '2', s: 'm', key: 'kk1' }], evs: ['男子100m'], rels: [], deadline: S.jstDay(Date.now() + 5 * 864e5) };
  const d = S.buildDocs(o); assert.equal(d.pub.n, 1); assert(!JSON.stringify(d.pub).includes('kk1')); assert.deepEqual(d.admin.akeys, ['kk1']); assert.equal(d.pub.expireMs - d.pub.deadlineMs, 30 * 864e5);
  for (const x of [{ roster: [] }, { evs: [] }, { deadline: S.jstDay(Date.now() - 864e5) }, { deadline: S.jstDay(Date.now() + 125 * 864e5) }, { meet: '  ' }]) assert.throws(() => S.buildDocs(Object.assign({}, o, x)));
  assert.equal(S.newId().length, 24); assert(S.validId(S.newId())); assert(!S.validId('A'.repeat(20)));
});
await check('既定の締切：大会のエントリー締切（今日より後）／なければ今日から14日', async () => {
  const now = Date.parse('2026-10-20T03:00:00Z'); assert.equal(S.defaultDeadline('2026-10-28', now), '2026-10-28'); assert.equal(S.defaultDeadline('2026-10-01', now), '2026-11-03'); assert.equal(S.defaultDeadline('', now), '2026-11-03');
  assert.equal(new Date(S.dayEnd('2026-10-28')).toISOString(), '2026-10-28T14:59:59.000Z');
});
await check('答えをきれいにする：第2＝第1は不可・第1なしなら第2は空・リレー不可ならどのリレーも空・ひとことは100文字まで・空の答えは不可', async () => {
  const s = { evs: ['男子100m', '男子走幅跳'], rels: ['男子4×100mR'] };
  assert(S.cleanAnswer({ ev1: '男子100m', ev2: '男子100m' }, s).err); assert(S.cleanAnswer({ ev1: '男子200m' }, s).err); assert(S.cleanAnswer({}, s).err);
  assert.equal(S.cleanAnswer({ ev2: '男子100m', relay: 'no' }, s).ok.ev2, ''); assert.equal(S.cleanAnswer({ ev1: '男子100m', relay: 'no', rel: '男子4×100mR' }, s).ok.rel, '');
  assert.equal(S.cleanAnswer({ ev1: '男子100m', cm: 'あ'.repeat(150) }, s).ok.cm.length, 100); assert.equal(S.cleanAnswer({ ev1: '男子100m', relay: 'ok' }, { evs: s.evs, rels: [] }).ok.relay, '');
});
await check('下書きに入れる：第1・第2希望が種目に入る・リレー可はAチーム（6人まで→B）・記録帳に無い種目は入れずに知らせる・下書きのルールの警告はそのまま', async () => {
  const P = E.newPlan(); P.picks[K('架空 一郎')] = [D.byKey[K('架空 一郎')].events.find(e => e.label === '200m').ev];
  const sv = { roster: [{ n: '架空 一郎' }, { n: '架空 二郎' }, { n: '架空 花子' }, { n: '架空 消えた' }], akeys: [K('架空 一郎'), K('架空 二郎'), K('架空 花子'), 'nokey'] };
  const r = S.apply(E, D, P, sv, { 0: { ev1: '男子100m', ev2: '男子走幅跳', relay: 'ok', rel: '' }, 1: { ev1: '男子100m', ev2: '男子110mH', relay: 'ok', rel: '男子4×100mR' }, 2: { ev1: '女子100m', ev2: '', relay: 'no' }, 3: { ev1: '男子100m' } });
  assert.equal(r.picks, 4); assert.equal(r.relay, 2); assert(r.skip.some(x => /110mH/.test(x)) && r.skip.some(x => /架空 消えた/.test(x)), r.skip.join());
  assert.equal(P.picks[K('架空 一郎')].length, 3); const rel = P.relays[D.relays[0].ev]; assert.equal(rel.length, 1); assert.deepEqual(rel[0].members, [K('架空 一郎'), K('架空 二郎')]);
  const w = E.check(D, P).map(x => x.code); assert(w.includes('maxEv') && w.includes('legs'), w.join());
  const P2 = E.newPlan(); const ans = {}; const sv2 = { roster: [], akeys: [] }; ['架空 一郎', '架空 二郎', '架空 三郎', '架空 四郎'].forEach((n, i) => { sv2.akeys.push(K(n)); sv2.roster.push({ n }); ans[i] = { ev1: '', relay: 'ok', rel: '' }; });
  P2.rules.maxLeg = 3; S.apply(E, D, P2, sv2, ans); assert.deepEqual(P2.relays[D.relays[0].ev].map(t => t.label + t.members.length), ['A3', 'B1']);
  S.apply(E, D, P2, sv2, ans); assert.deepEqual(P2.relays[D.relays[0].ev].map(t => t.label + t.members.length), ['A3', 'B1'], '2回押しても二重にしない');
});
// ---------- 画面 ----------
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.webp') ? 'image/webp' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] }); const sl = ms => new Promise(r => setTimeout(r, ms));
const ALICE = { uid: 'alice', displayName: '架空 顧問A', email: 'coach-a@example.invalid' };
async function page(W = 1280, user = ALICE) {
  const p = await b.newPage(); await p.setViewport(W === 390 ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: W, height: 900 }); const errs = [];
  await p.setRequestInterception(true); install(p, B); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.evaluateOnNewDocument(u => { localStorage.setItem('lanenote.mode.v1', 'coach'); localStorage.setItem('lanenote.xnews.v1', '1'); if (u) localStorage.setItem('__fakeuser', JSON.stringify(u)); else localStorage.removeItem('__fakeuser'); }, user);
  return { p, errs };
}
const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('__fakedb') || '{}'));
let SID = '';
try {
  const { p, errs } = await page(1280);
  await p.goto(B + 'guide.html'); await p.evaluate(() => { localStorage.clear(); }); await p.goto(B + 'records.html', { waitUntil: 'load' }); await p.waitForFunction(() => !document.getElementById('rbSignOut').hidden, { timeout: 15000 }); await sl(800);
  await p.evaluate(() => { const s = document.getElementById('rbSchool'); s.value = '架空'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); });
  const f = path.join(fs.mkdtempSync('/tmp/v0280-'), 's.json'); fs.writeFileSync(f, JSON.stringify({ records: ROWS })); await (await p.$('#rbImport')).uploadFile(f); await sl(2500);
  await check('顧問：エントリー下書きの中に「📮 エントリー調査リンク」。説明ははじめ閉じる（?で開く）・押すと一覧と「作る」', async () => {
    await p.click('#rbEntryOpen'); await sl(300);
    await p.evaluate(() => document.querySelector('#rbEntry [data-sv="toggle"]').click()); await sl(800);
    const r = await p.evaluate(() => ({ t: document.querySelector('#rbEntry .sv-box').innerText, help: !!document.querySelector('#rbEntry .sv-box .en-help'), q: !!document.querySelector('#rbEntry [data-sv="help"]'), cur: getComputedStyle(document.querySelector('#rbEntry [data-sv="toggle"]')).cursor }));
    assert(!r.help && r.q && /新しい調査リンクを作る/.test(r.t) && /まだ調査はありません/.test(r.t) && r.cur === 'pointer', JSON.stringify(r));
    await p.evaluate(() => document.querySelector('#rbEntry [data-sv="help"]').click()); await sl(200); assert(/ログインなし/.test(await p.evaluate(() => document.querySelector('#rbEntry .sv-box .en-help').innerText)));
    await p.evaluate(() => document.querySelector('#rbEntry [data-sv="help"]').click()); await sl(200);
  });
  await check('顧問：作る画面の既定＝名簿は全員・種目は記録帳の種目・リレー・締切は14日後。名簿から1人外し、種目を手で足して作る→24文字のリンク・コピー・LINE・QR', async () => {
    await p.evaluate(() => document.querySelector('#rbEntry [data-sv="new"]').click()); await sl(300);
    await p.evaluate(() => { const i = document.querySelector('#rbEntry [data-svf="meet"]'); i.value = '架空区 秋季大会'; i.dispatchEvent(new Event('change', { bubbles: true })); });
    await p.evaluate(() => document.querySelector('#rbEntry [data-svsexes="mf"]').click()); await sl(200);
    const f0 = await p.evaluate(() => ({ ath: [...document.querySelectorAll('#rbEntry [data-svath]')].map(x => x.textContent + ':' + x.getAttribute('aria-pressed')), ev: [...document.querySelectorAll('#rbEntry [data-svev]')].map(x => x.getAttribute('data-svev')), rel: [...document.querySelectorAll('#rbEntry [data-svrel]')].map(x => x.getAttribute('data-svrel')), dl: document.querySelector('#rbEntry [data-svf="deadline"]').value }));
    assert.equal(f0.ath.length, 6); assert(f0.ath.every(x => /true$/.test(x)), f0.ath.join()); assert.deepEqual(f0.ev.sort(), ['女子100m', '男子100m', '男子200m', '男子走幅跳'].sort()); assert.deepEqual(f0.rel, ['男子4×100mR']);
    assert.equal(f0.dl, S.jstDay(Date.now() + 14 * 864e5));
    await p.evaluate(() => [...document.querySelectorAll('#rbEntry [data-svath]')].find(x => /架空 四郎/.test(x.textContent)).click()); await sl(150);
    await p.evaluate(() => [...document.querySelectorAll('#rbEntry [data-svev]')].find(x => x.getAttribute('data-svev') === '男子200m').click()); await sl(150);
    await p.evaluate(() => { const s = document.querySelector('#rbEntry [data-svf="xsex"]'); s.value = 'm'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await sl(150);
    await p.evaluate(() => { document.getElementById('rbSvX').value = '110mH'; document.querySelector('#rbEntry [data-sv="xadd"]').click(); }); await sl(150);
    await p.evaluate(() => document.querySelector('#rbEntry [data-sv="create"]').click()); await sl(1200);
    const r = await p.evaluate(() => ({ link: document.getElementById('rbSvLink').value, line: document.querySelector('#rbEntry a[href^="https://line.me/R/share"]').href, t: document.querySelector('#rbEntry .sv-box').innerText }));
    const m = /\?q=([A-Za-z0-9]{24})$/.exec(r.link); assert(m, r.link); SID = m[1]; assert(decodeURIComponent(r.line).includes(r.link)); assert(/受付中/.test(r.t) && /0\/5人/.test(r.t), r.t);
    await p.evaluate(() => document.querySelector('#rbEntry [data-sv="qr"]').click()); await sl(300); assert(await p.$('#rbEntry .sv-qr svg'), 'QR');
    const d = await db(p), pub = d['surveys/' + SID], adm = d['surveyAdmins/' + SID];
    assert.deepEqual(Object.keys(pub).sort(), ['deadline', 'evs', 'expireAt', 'kind', 'meet', 'n', 'open', 'relayAsk', 'rels', 'roster', 'sexes', 'updatedAt', 'v']); assert.deepEqual([pub.kind, pub.relayAsk], ['official', true]);
    assert.deepEqual(pub.roster.map(x => x.n).sort(), ['架空 一郎', '架空 三郎', '架空 二郎', '架空 桃子', '架空 花子'].sort()); assert(pub.roster.every(x => Object.keys(x).sort().join() === 'g,n,s'), JSON.stringify(pub.roster));
    assert.deepEqual(pub.evs.sort(), ['女子100m', '男子100m', '男子110mH', '男子走幅跳'].sort()); assert(!/12\.40|13\.50|架空中|alice|@/.test(JSON.stringify(pub)), '公開の文書に記録・学校・uid が無い');
    assert.equal(adm.ownerUid, 'alice'); assert.equal(adm.akeys.length, 5);
  });
  await p.evaluate(() => document.querySelector('#rbEntry [data-sv="qr"]').click()); await sl(200);
  // ---------- 選手 ----------
  const { p: s, errs: se } = await page(390, null);
  const stu = () => s.evaluate(() => ({ t: document.getElementById('svBody').innerText, sw: document.documentElement.scrollWidth, vw: innerWidth }));
  await check('選手（390・ログインなし）：名簿の名前と学年・選べる種目だけ（記録・ほかの人の答えは出ない）。試作版・Presented by Sakata・標語・免責は見える・ページの切り替えは出さない', async () => {
    await s.goto(B + '?q=' + SID, { waitUntil: 'load' }); await s.waitForSelector('#svBody .sv-name', { timeout: 15000 }); await sl(400);
    const r = await s.evaluate(() => { const v = e => !!e && !!(e.offsetWidth || e.offsetHeight); return { t: document.body.innerText, badge: v(document.querySelector('.badge')), credit: v(document.querySelector('.credit')), tag: v(document.querySelector('.tagline')), disc: v(document.querySelector('footer .f-disc')), beta: v(document.querySelector('.beta-line')), nav: v(document.querySelector('.pagenav')), pick: v(document.getElementById('modePick')), names: [...document.querySelectorAll('.sv-name')].map(x => x.innerText.replace(/\s+/g, '')), cur: getComputedStyle(document.querySelector('.sv-name')).cursor, sw: document.documentElement.scrollWidth, vw: innerWidth }; });
    assert(r.badge && r.credit && r.tag && r.disc && r.beta && /試作版/.test(r.t) && /Presented by Sakata/.test(r.t), JSON.stringify(r).slice(0, 300));
    assert(!r.nav && !r.pick, 'ナビ・モードの質問は出さない'); assert.deepEqual(r.names, ['架空一郎2年', '架空二郎1年', '架空三郎2年']); assert(!/12\.40|5\.80|架空中|架空 四郎|分け合う/.test(r.t), '記録・学校・外した人を出さない');
    assert.equal(r.cur, 'pointer'); assert(r.sw <= r.vw, 'はみ出し ' + r.sw);
    assert(!(await s.$('.sv-help')), '説明は?の中');
  });
  await check('選手：男子/女子を切り替え・名前→第1希望→第2希望（第1は選べない）→リレー可→ひとこと（100文字まで）→送る', async () => {
    await s.evaluate(() => document.querySelector('[data-svsex="f"]').click()); await sl(150);
    assert.deepEqual(await s.evaluate(() => [...document.querySelectorAll('.sv-name')].map(x => x.firstChild.textContent.trim())), ['架空 花子', '架空 桃子']);
    await s.evaluate(() => document.querySelector('[data-svsex="m"]').click()); await sl(150);
    await s.evaluate(() => [...document.querySelectorAll('.sv-name')].find(x => /架空 二郎/.test(x.innerText)).click()); await sl(150); await s.evaluate(() => document.querySelector('[data-svjoin="1"]').click()); await sl(120);
    const evs = await s.evaluate(() => [...document.querySelectorAll('[data-svev1]')].map(x => x.textContent)); assert.deepEqual(evs.sort(), ['100m', '110mH', '走幅跳'].sort(), '男子の種目だけ');
    await s.evaluate(() => document.querySelector('[data-svev1="男子100m"]').click()); await sl(150);
    assert(await s.evaluate(() => document.querySelector('[data-svev2="男子100m"]').disabled));
    await s.evaluate(() => document.querySelector('[data-svev2="男子走幅跳"]').click()); await sl(150);
    await s.evaluate(() => document.querySelector('[data-svrelay="ok"]').click()); await sl(150);
    await s.type('#svCm', 'あ'.repeat(120)); assert.equal(await s.evaluate(() => document.getElementById('svCm').value.length), 100);
    assert.equal(await s.evaluate(() => document.getElementById('svCnt').textContent), '100');
    if (SHOT) { await s.evaluate(() => window.scrollTo(0, 0)); await s.screenshot({ path: path.join(SHOT, 'fix71_student_390.png'), fullPage: true }); }
    await s.evaluate(() => document.querySelector('[data-sv="send"]').click()); await sl(800);
    const r = await stu(); assert(/送りました/.test(r.t) && /送り直す/.test(r.t), r.t); assert(r.sw <= r.vw);
    const a = (await db(s))['surveys/' + SID + '/answers/r1']; assert.deepEqual(Object.keys(a).sort(), ['at', 'cm', 'd1', 'dv', 'ev1', 'ev2', 'expireAt', 'join', 'rel', 'relay'].sort()); assert.match(a.d1, /^[A-Za-z0-9]{16}$/); assert.equal(a.d1, a.dv);
    assert.equal(a.ev1, '男子100m'); assert.equal(a.ev2, '男子走幅跳'); assert.equal(a.relay, 'ok'); assert.equal(a.cm.length, 100);
    if (SHOT) await s.screenshot({ path: path.join(SHOT, 'fix71_student_sent_390.png') });
  });
  await check('選手：送り直すと新しい答えに置きかわる（開き直しても自分の名前が選ばれている）', async () => {
    await s.reload({ waitUntil: 'load' }); await s.waitForSelector('#svBody .sv-name'); await sl(300);
    assert(await s.evaluate(() => [...document.querySelectorAll('.sv-name')].find(x => /架空 二郎/.test(x.innerText)).getAttribute('aria-pressed') === 'true'));
await s.evaluate(() => document.querySelector('[data-svjoin="1"]').click()); await sl(120);
    await s.evaluate(() => document.querySelector('[data-svev1="男子走幅跳"]').click()); await sl(100); await s.evaluate(() => document.querySelector('[data-svrelay="no"]').click()); await sl(100);
    await s.evaluate(() => document.querySelector('[data-sv="send"]').click()); await sl(800);
    const a = (await db(s))['surveys/' + SID + '/answers/r1']; assert.equal(a.ev1, '男子走幅跳'); assert.equal(a.ev2, ''); assert.equal(a.relay, 'no');
    assert.equal(Object.keys(await db(s)).filter(k => k.startsWith('surveys/' + SID + '/answers/')).length, 1);
    await s.evaluate(() => [...document.querySelectorAll('.sv-name')].find(x => /架空 一郎/.test(x.innerText)).click()); await sl(100); await s.evaluate(() => document.querySelector('[data-svjoin="1"]').click()); await sl(120);
    await s.evaluate(() => document.querySelector('[data-svev1="男子100m"]').click()); await s.evaluate(() => document.querySelector('[data-svev2="男子110mH"]').click()); await s.evaluate(() => document.querySelector('[data-svrelay="ok"]').click()); await sl(100);
    await s.evaluate(() => document.querySelector('[data-sv="send"]').click()); await sl(800);
    assert(!se.length, se.join(' / '));
  });
  await check('顧問：答えた人・まだの人・答えの表。「📥 希望を下書きに入れる」で下書きに入り、警告も出る。記録帳に無い種目は知らせる', async () => {
    await p.evaluate(() => document.querySelector('#rbEntry [data-sv="reans"]').click()); await sl(800);
    const r = await p.evaluate(() => ({ t: document.querySelector('#rbEntry .sv-box').innerText, rows: [...document.querySelectorAll('#rbEntry .sv-ans tbody tr')].map(t => [...t.cells].map(c => c.innerText.trim()).slice(0, 4).join('|')) }));
    assert(/2\/5人/.test(r.t) && /まだの人（3人）：架空 三郎・架空 花子・架空 桃子/.test(r.t), r.t); assert.deepEqual(r.rows, ['架空 一郎 2年|100m|110mH|可', '架空 二郎 1年|走幅跳||不可']);
    await p.evaluate(() => document.querySelector('#rbEntry [data-sv="apply"]').click()); await sl(400);
    const q = await p.evaluate(() => ({ st: document.querySelector('#rbEntry .sv-box .status').innerText, rows: [...document.querySelectorAll('#rbEntry .en-t:not(.sv-ans) tbody tr')].map(t => t.innerText.replace(/\s+/g, ' ')), warn: (document.querySelector('#rbEntry .en-warn') || {}).innerText || '' }));
    assert(/種目2件・リレー1人/.test(q.st) && /110mH/.test(q.st), q.st); assert(q.rows.some(x => /架空 一郎.*100m.*12\.40/.test(x)) && q.rows.some(x => /架空 二郎.*走幅跳.*公認記録なし/.test(x)), q.rows.join('\n'));
    assert(/1人です（4〜6人）/.test(q.warn), q.warn);
    if (SHOT) { await p.bringToFront(); const el = await p.$('#rbEntry .sv-box'); await el.evaluate(e => e.scrollIntoView({ block: 'start' })); await sl(200); await el.screenshot({ path: path.join(SHOT, 'fix71_coach_1280.png') }); }
  });
  await check('顧問：受付を止める→選手は答えられない（開くと「受け付けていません」）→再開→締切を変える', async () => {
    await p.evaluate(() => document.querySelector('#rbEntry [data-sv="stop"]').click()); await sl(600);
    assert.equal((await db(p))['surveys/' + SID].open, false); assert(/止めています/.test(await p.evaluate(() => document.querySelector('#rbEntry .sv-box').innerText)));
    await s.reload({ waitUntil: 'load' }); await sl(1500); assert(/受け付けていません/.test((await stu()).t)); assert(!(await s.$('.sv-name')));
    await p.evaluate(() => document.querySelector('#rbEntry [data-sv="stop"]').click()); await sl(600); assert.equal((await db(p))['surveys/' + SID].open, true);
    const nd = S.jstDay(Date.now() + 20 * 864e5); await p.evaluate(v => { document.getElementById('rbSvDl').value = v; document.querySelector('#rbEntry [data-sv="dl"]').click(); }, nd); await sl(600);
    const d = await db(p); assert.equal(d['surveys/' + SID].deadline.__ts, S.dayEnd(nd)); assert.equal(d['surveyAdmins/' + SID].expireAt.__ts, S.dayEnd(nd) + 30 * 864e5);
  });
  await check('顧問：締切を過ぎた調査は、選手が開いても答えられない', async () => {
    await s.evaluate(sid => { const d = JSON.parse(localStorage.getItem('__fakedb')); d['surveys/' + sid].deadline = { __ts: Date.now() - 1000 }; localStorage.setItem('__fakedb', JSON.stringify(d)); }, SID);
    await s.reload({ waitUntil: 'load' }); await sl(1500); assert(/受け付けていません/.test((await stu()).t));
    await s.evaluate(sid => { const d = JSON.parse(localStorage.getItem('__fakedb')); d['surveys/' + sid].deadline = { __ts: Date.now() + 5 * 864e5 }; localStorage.setItem('__fakedb', JSON.stringify(d)); }, SID);
  });
  await check('顧問：削除すると調査・管理・答えがすべて消え、リンクは使えない', async () => {
    await p.evaluate(() => document.querySelector('#rbEntry [data-sv="del"]').click()); await sl(900);
    const d = await db(p); assert(!Object.keys(d).some(k => k.includes(SID)), Object.keys(d).filter(k => k.includes(SID)).join());
    assert(/削除しました/.test(await p.evaluate(() => document.querySelector('#rbEntry .sv-box').innerText)));
    await s.reload({ waitUntil: 'load' }); await sl(1500); assert(/受け付けていません/.test((await stu()).t));
    assert(!errs.length, errs.join(' / '));
  });
  await check('ログインしていないと、エントリー調査はログインのボタンだけ（下書きはそのまま使える）', async () => {
    const { p: q, errs: qe } = await page(1280, null); await q.goto(B + 'records.html', { waitUntil: 'load' }); await sl(1200);
    await q.evaluate(() => { const s = document.getElementById('rbSchool'); s.value = '架空'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    const f2 = path.join(fs.mkdtempSync('/tmp/v0280b-'), 's.json'); fs.writeFileSync(f2, JSON.stringify({ records: ROWS })); await (await q.$('#rbImport')).uploadFile(f2); await sl(2000);
    await q.click('#rbEntryOpen'); await sl(300); await q.evaluate(() => document.querySelector('#rbEntry [data-sv="toggle"]').click()); await sl(300);
    const t = await q.evaluate(() => document.querySelector('#rbEntry .sv-box').innerText); assert(/Googleでログインすると使えます/.test(t) && !/新しい調査/.test(t), t);
    assert(!qe.length, qe.join(' / ')); await q.close();
  });
  await check('ソース：調査のIDは24文字・crypto で作る・答えは名簿の番号（r＋数字）・名前は答えに入れない・新しい文言に「分け合う」を使わない', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'source/src/survey.js'), 'utf8'); assert(/crypto\.getRandomValues/.test(src) && /out\.length < 24/.test(src) && /'answers', 'r' \+ idx/.test(src));
    assert(!/Math\.random/.test(src)); for (const f of ['source/src/survey.js', 'source/src/template.html', 'source/src/guide_template.html', 'source/src/records_template.html']) assert(!/分け合う/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), f);
    const cl = JSON.parse(fs.readFileSync(path.join(ROOT, 'source/src/changelog.json'), 'utf8')).filter(e => e.ver === 'v0.28.0'); assert.equal(cl.length, 1); assert(/エントリー調査/.test(cl[0].text) && !/分け合う/.test(cl[0].text));
  });
} finally { await b.close(); srv.close(); }
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
