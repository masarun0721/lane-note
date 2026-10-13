// v0.26.20 招待リンク（team.html#join=）：作る・開く・アドレス欄から消す・ログイン後に参加・選手モード・形のおかしいリンク（偽の Firebase・架空のデータだけ）
//   node v02620_invite_link.mjs [スクショの頭（例 /workspace/lane_note_shots/v02620）]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {install} from './fake_firebase.mjs';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'), SHOT = process.argv[2] || '';
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p)) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.webp') ? 'image/webp' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ok', n); } else { fail++; console.log('  NG', n, d || ''); } };
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 900 }); await p.setRequestInterception(true); install(p, B);
p.on('dialog', d => d.accept()); const errs = []; p.on('pageerror', e => errs.push(e.message));
const USERS = { alice: { uid: 'alice', displayName: '架空 顧問A', email: 'coach-a@example.invalid' }, bob: { uid: 'bob', displayName: '架空 マネB', email: 'mgr-b@example.invalid' }, carol: { uid: 'carol', displayName: '架空 顧問C', email: 'coach-c@example.invalid' } };
const setUser = (u, mode = 'coach') => p.evaluate((x, m) => { if (x) localStorage.setItem('__fakeuser', JSON.stringify(x)); else localStorage.removeItem('__fakeuser'); localStorage.setItem('lanenote.mode.v1', m); }, u ? USERS[u] : null, mode);
const J = () => p.evaluate(() => { const j = document.getElementById('tpJoin'); return { shown: !!j && !j.hidden, text: j ? j.innerText : '', hash: location.hash, ss: sessionStorage.getItem('lanenote.join.v1'), login: !!document.querySelector('[data-join="login"]'), go: !!document.querySelector('[data-join="go"]'), coach: !!document.querySelector('[data-join="coach"]'), pick: !!document.getElementById('modePick') && !document.getElementById('modePick').hidden }; });
async function shot(name, mob) { if (!SHOT) return; await p.setViewport(mob ? { width: 390, height: 844, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true } : { width: 1280, height: 900 }); await sleep(1500); await p.evaluate(() => { const d = document.querySelector('details[data-tmd="codes"]'); if (d) d.open = true; }); await sleep(1200); if (process.env.DBG) console.log('DBG', JSON.stringify(await J())); const el = await p.$(name.startsWith('card') ? '#rbTeam .tm-invs' : '#tpJoin'); await el.evaluate(e => e.scrollIntoView({ block: 'start' })); await sleep(300); await el.screenshot({ path: SHOT + '_' + name + '.png' }); await p.setViewport({ width: 1280, height: 900 }); }
await p.goto(B + 'guide.html'); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
await setUser('alice'); await p.goto(B + 'team.html', { waitUntil: 'load' }); await p.waitForSelector('#rbTeam:not([hidden])', { timeout: 8000 }).catch(() => {}); await sleep(900);
await p.evaluate(() => { document.getElementById('rbTeamName').value = '架空高校陸上部'; document.querySelector('[data-tm="create"]').click(); }); await sleep(1500);
await p.evaluate(() => { document.querySelector('details[data-tmd="codes"]').open = true; }); await sleep(900);
const inv = await p.evaluate(() => [...document.querySelectorAll('#rbTeam .tm-inv')].map(c => ({ big: c.querySelector('.tm-big').textContent, url: c.querySelector('.tm-big').getAttribute('data-code'), code: c.querySelector('.tm-raw code').textContent, line: decodeURIComponent(c.querySelector('a[href^="https://line.me/R/share?text="]').href.split('text=')[1]), mail: decodeURIComponent(c.querySelector('a[href^="mailto:"]').href.split('body=')[1]), codeOnly: !!c.querySelector('.tm-raw [data-tm="copy"]') })));
const pre = B + 'team.html#join=';
ok('招待カード：主ボタンは「招待リンクをコピー」で、location.origin＋パスから作った team.html#join=<コード>', inv.length === 2 && inv.every(c => /招待リンクをコピー/.test(c.big) && c.url === pre + encodeURIComponent(c.code)), JSON.stringify(inv.map(c => [c.big, c.url])));
ok('LINE・メールはリンクと短い使い方（コードを貼る説明ではない）・コードだけのコピーも残す', inv.every(c => c.line.includes(c.url) && /ログイン/.test(c.line) && /参加する/.test(c.line) && c.mail.includes(c.url) && c.codeOnly && !/参加コードで入る」に貼って/.test(c.line)), inv[0].line);
await shot('card_mobile', true);
const mgrUrl = inv[1].url, coachUrl = inv[0].url;
// ログインしていない人がリンクを開く
await setUser(null, ''); await p.goto(B + 'guide.html'); await p.goto(mgrUrl, { waitUntil: 'load' }); await sleep(1200);
let j = await J(); ok('開くとすぐアドレス欄から # が消える・「チームに参加」が出る・モードの質問は出さない', j.hash === '' && j.shown && /チームに参加/.test(j.text) && !j.pick, JSON.stringify(j));
ok('マネージャー用：役割と期限を出す・ログインしていなければ「Googleでログインして参加」', /マネージャー/.test(j.text) && /まで/.test(j.text) && j.login && !j.go, j.text);
ok('コードはこのタブの sessionStorage にだけ（まだだれにも結びつけない）', !!j.ss && JSON.parse(j.ss).code === inv[1].code && JSON.parse(j.ss).uid === null && !(await p.evaluate(() => Object.keys(localStorage).some(k => /join/.test(k)))), j.ss);
await shot('join_login_mobile', true);
// ログインした（同じタブで続き）
await setUser('bob'); await p.reload({ waitUntil: 'load' }); await sleep(1500);
j = await J(); ok('ログインのあと：同じ画面で「参加する」・その人（uid）に結びつく', j.shown && j.go && /mgr-b@example\.invalid/.test(j.text) && JSON.parse(j.ss).uid === 'bob', JSON.stringify(j));
await shot('join_go_mobile', true);
await p.evaluate(() => document.querySelector('[data-join="go"]').click()); await sleep(2000);
j = await J(); const tx = await p.evaluate(() => document.getElementById('rbTeam').innerText);
ok('「参加する」で今までの参加の流れ（マネージャーとして入る）・使ったコードは消える', !j.shown && j.ss === null && /架空高校陸上部/.test(tx) && /マネージャー/.test(tx), tx.slice(0, 300));
// 別の人に結びついた続きは使わない
await p.evaluate(u => { sessionStorage.setItem('lanenote.join.v1', JSON.stringify({ code: u, at: Date.now(), uid: 'bob' })); }, inv[0].code); await setUser('carol'); await p.reload({ waitUntil: 'load' }); await sleep(1500);
j = await J(); ok('A01：別のアカウント（uid）に結びついた招待は捨てる', !j.shown && j.ss === null, JSON.stringify(j));
// 選手モード
await setUser('carol', 'player'); await p.goto(B + 'guide.html'); await p.goto(coachUrl, { waitUntil: 'load' }); await sleep(1500);
j = await J(); ok('選手モードの端末：参加は出さず、顧問モードへの切りかえを案内', j.shown && j.coach && !j.go && /選手モード/.test(j.text) && j.hash === '', JSON.stringify(j));
await shot('join_player_mobile', true);
await p.evaluate(() => document.querySelector('[data-join="coach"]').click()); await sleep(600);
j = await J(); ok('顧問モードに切りかえると「参加する」（顧問用：顧問として）', j.go && /顧問/.test(j.text), j.text);
await p.evaluate(() => document.querySelector('[data-join="cancel"]').click()); await sleep(300);
j = await J(); ok('「参加しない」で消える', !j.shown && j.ss === null, JSON.stringify(j));
// 形がおかしいリンク
await p.goto(B + 'guide.html'); await p.goto(B + 'team.html#join=abc', { waitUntil: 'load' }); await sleep(1200);
j = await J(); ok('形がおかしいリンク：アドレス欄から消し、送り直してもらうよう案内', j.shown && j.hash === '' && /形が正しくありません/.test(j.text), JSON.stringify(j));
// 手で入れる方法は残る
await p.evaluate(() => document.querySelector('[data-join="cancel"]').click()); await sleep(300);
ok('参加コードを手で入れる欄も残る', await p.evaluate(() => !!document.getElementById('rbTeamCode')));
ok('ページのエラーなし', errs.length === 0, errs.join(' / '));
await b.close(); srv.close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
