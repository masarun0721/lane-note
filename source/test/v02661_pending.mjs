// v0.26.61 参加の承認待ちのお知らせ（顧問だけ・記録とチームのページのいちばん上）。偽の Firebase・架空のデータだけ。外には通信しない
//   node v02661_pending.mjs [スクショの保存先（PNG）]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core'; import {install} from './fake_firebase.mjs';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'), SHOT = process.argv[2] || '';
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p)) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.webp') ? 'image/webp' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ok', n); } else { fail++; console.log('  NG', n, d || ''); } };
console.log('[v0.26.61] 参加の承認待ちのお知らせ');
const p = await b.newPage(); await p.setBypassServiceWorker(true); await p.setViewport({ width: 1280, height: 800 }); await p.setRequestInterception(true); install(p, B);
p.on('dialog', d => d.accept()); const errs = []; p.on('pageerror', e => errs.push(e.message));
const U = { alice: { uid: 'alice', displayName: '架空 顧問A', email: 'coach-a@example.invalid' }, bob: { uid: 'bob', displayName: '架空 マネB', email: 'mgr-b@example.invalid' }, dave: { uid: 'dave', displayName: '架空 顧問D', email: 'coach-d@example.invalid' } };
async function as(u, page = 'records.html', mode = 'coach') {
  await p.evaluate((x, m) => { localStorage.setItem('__fakeuser', JSON.stringify(x)); localStorage.setItem('lanenote.mode.v1', m); localStorage.setItem('lanenote.xnews.v1', '1'); }, U[u], mode);
  await p.goto(B + page, { waitUntil: 'load' }); await sleep(2200);
}
const ban = () => p.evaluate(() => { const e = document.getElementById('rbPendBan'); return e && !e.hidden ? e.textContent.trim() : ''; });
const db = f => p.evaluate(f => { const d = JSON.parse(localStorage.getItem('__fakedb')); new Function('d', f)(d); localStorage.setItem('__fakedb', JSON.stringify(d)); }, f);
await p.goto(B + 'guide.html'); await p.evaluate(() => localStorage.clear());
await as('alice', 'team.html'); await p.waitForSelector('#rbTeam:not([hidden])');
await p.evaluate(() => { document.getElementById('rbTeamName').value = '架空高校陸上部'; document.querySelector('[data-tm="create"]').click(); }); await sleep(1800);
const T = await p.evaluate(() => localStorage.getItem('lanenote.team.v1.alice'));
ok('チームを作った', !!T);
await as('alice', 'team.html'); ok('承認待ちが0人：チームのページに出さない', (await ban()) === '');
await as('alice', 'records.html'); ok('承認待ちが0人：記録のページに出さない', (await ban()) === '');
const pend = (uid, name, want) => `d['teams/${T}/members/${uid}'] = { role: 'pending', want: '${want}', name: '${name}', joinedAt: { __ts: Date.now() } }; d['users/${uid}/teams/${T}'] = { name: '', role: 'pending' };`;
const exp = Date.now() + 100 * 864e5;
await db(pend('carol', '架空 申込C', 'manager') + `d['teams/${T}/members/bob'] = { role: 'manager', name: '架空 マネB', joinedAt: { __ts: Date.now() }, expiresAt: { __ts: ${exp} } }; d['users/bob/teams/${T}'] = { name: '架空高校陸上部', role: 'manager' };
  d['teams/${T}/members/dave'] = { role: 'coach', name: '架空 顧問D', joinedAt: { __ts: Date.now() } }; d['users/dave/teams/${T}'] = { name: '架空高校陸上部', role: 'coach' };`);
await p.evaluate(T => { localStorage.setItem('lanenote.team.v1.bob', T); localStorage.setItem('lanenote.team.v1.dave', T); }, T);
await as('alice', 'records.html');
let t = await ban(); ok('顧問（持ち主）：記録のページのいちばん上に「🔔 参加の承認待ちが1人います 確認する」', t === '🔔 参加の承認待ちが1人います確認する', t);
const top = await p.evaluate(() => { const e = document.getElementById('rbPendBan'), r = e.getBoundingClientRect(), sec = e.closest('section'); return { first: sec.firstElementChild === e, y: r.top, href: e.querySelector('a').getAttribute('href') }; });
ok('いちばん上（最初のカードの先頭・画面の中）・リンクは team.html#members', top.first && top.y < 400 && top.href === 'team.html#members', JSON.stringify(top));
if (SHOT) { await p.evaluate(() => window.scrollTo(0, 0)); await sleep(200); await p.screenshot({ path: SHOT }); }
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('#rbPendBan a')]); await sleep(2500);
const mo = await p.evaluate(() => { const d = document.querySelector('#rbTeam details[data-tmd="members"]'); if (!d) return null; const r = d.getBoundingClientRect(); return { url: location.pathname + location.hash, open: d.open, inView: r.top >= -5 && r.top < innerHeight, txt: d.textContent }; });
ok('「確認する」：チームのページで「👥 メンバー」が開いて見えるところに・承認待ちの人と承認ボタン', mo && /team\.html#members$/.test(mo.url) && mo.open && mo.inView && /架空 申込C/.test(mo.txt) && /承認する/.test(mo.txt), JSON.stringify(mo && Object.assign({}, mo, { txt: mo.txt.slice(0, 80) })));
ok('チームのページにも出る', (await ban()) === '🔔 参加の承認待ちが1人います確認する');
await db(pend('erin', '架空 申込E', 'coach')); await as('alice', 'team.html');
ok('2人になると「2人」', (await ban()) === '🔔 参加の承認待ちが2人います確認する', await ban());
await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.evaluate(() => document.querySelector('#rbPendBan a').click()); await sleep(1200);
const mo2 = await p.evaluate(() => { const d = document.querySelector('#rbTeam details[data-tmd="members"]'); const r = d.getBoundingClientRect(); return { url: location.pathname + location.hash, open: d.open, inView: r.top >= -5 && r.top < innerHeight }; });
ok('チームのページで「確認する」：同じページのまま「👥 メンバー」を開いて見えるところへ', mo2.open && mo2.inView && /team\.html/.test(mo2.url), JSON.stringify(mo2));
await as('dave', 'records.html'); ok('ほかの顧問（持ち主でない）にも出る', (await ban()) === '🔔 参加の承認待ちが2人います確認する', await ban());
await as('bob', 'records.html'); ok('マネージャー：記録のページに出さない', (await ban()) === '');
await as('bob', 'team.html'); ok('マネージャー：チームのページにも出さない', (await ban()) === '');
await as('carol', 'team.html'); ok('承認待ちの本人：出さない', (await ban()) === '');
await as("alice", "records.html", "player"); ok("選手モード（この端末）：出さない", (await ban()) === "", await ban());
await p.evaluate(() => localStorage.removeItem('lanenote.team.v1.alice')); await as('alice', 'records.html'); ok('チームを選んでいない（自分だけ）：出さない', (await ban()) === '');
await p.evaluate(T => localStorage.setItem('lanenote.team.v1.alice', T), T); await as('alice', 'schedule.html'); ok('大会予定のページ：出さない', (await ban()) === '');
await as('alice', 'team.html#members'); await sleep(500);
await p.evaluate(() => document.querySelector('[data-tm="approve"][data-id="carol"]').click()); await sleep(1500);
ok('1人承認すると「1人」', (await ban()) === '🔔 参加の承認待ちが1人います確認する', await ban());
await p.evaluate(() => document.querySelector('[data-tm="reject"][data-id="erin"]').click()); await sleep(1500);
ok('0人になると消える', (await ban()) === '', await ban());
// v0.26.61：「チームに入るのは顧問とマネージャーだけ」の一行（いつも見える・小さい文字）
const NOTE = '👤 チームに入るのは顧問とマネージャーだけです。選手には「個人ページ」のリンクを配ってください（ログインなしで自分の記録だけ見られます）。';
const SHOT2 = process.argv[3] || '';
const who = () => p.evaluate(() => { const me = document.querySelector('#rbTeam .tm-me'), n = me && me.nextElementSibling; const c = document.querySelector('#rbInvTmp'); return { under: n && n.classList.contains('tm-who') ? n.textContent : '', vis: !!(n && n.offsetParent), href: n && n.querySelector('a') ? n.querySelector('a').getAttribute('href') : '', muted: n ? n.className : '', inCodes: [...document.querySelectorAll('#rbTeamCodes .tm-who')].map(x => x.textContent), codesFirst: !!document.querySelector('#rbTeamCodes > .tm-who:first-child + .tm-invs') }; });
await as('alice', 'team.html'); await p.evaluate(() => { const d = document.querySelector('details[data-tmd="codes"]'); d.open = true; }); await sleep(1500);
let w = await who();
ok('顧問：「あなたは …」のすぐ下に一行（小さい・薄い字・いつも見える）・「個人ページ」は records.html#pp へ', w.under === NOTE && w.vis && /small/.test(w.muted) && /muted/.test(w.muted) && w.href === 'records.html#pp', JSON.stringify(w));
ok('「🔑 招待する」の中にも同じ一行（顧問・マネージャーを選ぶカードのすぐ上）', w.inCodes.length === 1 && w.inCodes[0] === NOTE && w.codesFirst, JSON.stringify(w));
if (SHOT2) { await p.evaluate(() => { const e = document.querySelector('#rbTeam .tm-me'); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 140); }); await sleep(300); await p.screenshot({ path: SHOT2 }); }
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.evaluate(() => document.querySelector('#rbTeam .tm-who a').click())]); await sleep(2500);
const pp = await p.evaluate(() => { const b = document.getElementById('rbPPBox'), r = b.getBoundingClientRect(); return { url: location.pathname + location.hash, inView: r.top >= 0 && r.bottom <= innerHeight, focus: document.activeElement && document.activeElement.id }; });
ok('「個人ページ」：記録のページの「📱 選手の個人ページを作る」が見えるところに（ボタンに印）', /records\.html#pp$/.test(pp.url) && pp.inView && pp.focus === 'rbPPOpen', JSON.stringify(pp));
await as('bob', 'team.html'); w = await who();
ok('マネージャー：同じ一行が出る（招待するの欄は無い）', w.under === NOTE && w.vis && !w.inCodes.length, JSON.stringify(w));
await p.evaluate(() => { localStorage.removeItem('__fakeuser'); }); await p.goto(B + 'records.html', { waitUntil: 'load' }); await sleep(1500); ok('ログアウト：出さない', (await ban()) === '');
ok('ページのエラーなし', !errs.length, errs.join(' / '));
console.log(`\n${pass} passed, ${fail} failed`); await b.close(); srv.close(); if (fail) process.exit(1);
