// v0.26.64 管理ページ（admin.html）：UIDを出す・管理者だけチーム名の一覧（名前の順・件数）・名前以外は出さない。偽の Firebase・架空のデータだけ。外には通信しない
//   node v02664_admin.mjs [スクショの保存先（PNG）]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
import puppeteer from 'puppeteer-core'; import {install} from './fake_firebase.mjs';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'), SHOT = process.argv[2] || '';
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ok', n); } else { fail++; console.log('  NG', n, d || ''); } };
console.log('[v0.26.64] 管理ページ（チーム名だけ）');
// ① 部品（node）
const LaneAdmin = createRequire(import.meta.url)('../src/admin_app.js');
ok('teamNames：名前の順（日本語）・空は「（名前なし）」・名前以外は使わない', JSON.stringify(LaneAdmin.teamNames([{ name: 'わ架空' }, { name: ' あ架空 ' }, { name: '' }, { name: 3 }, { name: 'か架空' }]))
  === JSON.stringify(['あ架空', 'か架空', 'わ架空', '（名前なし）', '（名前なし）'].sort((a, b) => a.localeCompare(b, 'ja'))));
ok('listHtml：件数と名前（HTML はエスケープ）', /登録チーム 2件/.test(LaneAdmin.listHtml(['<b>x</b>', 'y'])) && !/<b>x/.test(LaneAdmin.listHtml(['<b>x</b>', 'y'])));
ok('listHtml：0件', /登録チーム 0件/.test(LaneAdmin.listHtml([])) && /まだチームはありません/.test(LaneAdmin.listHtml([])));
// ② ビルド結果（公開しない印・どこからもリンクしない・メールアドレスを書かない）
const html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
ok('admin.html：noindex', /<meta name="robots" content="noindex,nofollow">/.test(html));
ok('admin.html：試作版・Presented by Sakata・標語・注意書き', /試作版/.test(html) && /Presented by Sakata/.test(html) && /class="tagline"/.test(html) && /class="f-disc"/.test(html));
const pages = ['index.html', 'records.html', 'guide.html', 'check.html', 'try.html', 'team.html', 'intro.html', 'schedule.html', 'sw.js'];
ok('どのページ・sw.js からも admin.html にリンクしない', pages.every(f => !/admin\.html/.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))));
const appSrc = fs.readFileSync(path.join(ROOT, 'source/src/admin_app.js'), 'utf8');
ok('admin_app.js・ルールにメールアドレス・UID の決め打ちがない', !/@[a-z0-9-]+\.[a-z]/i.test(appSrc) && !/ADMIN_UID/.test(appSrc) && !/@gmail|hongo/i.test(fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8')));
const guide = fs.readFileSync(path.join(ROOT, 'guide.html'), 'utf8');
ok('はじめての人（データの取り扱い）：作成者はチーム名だけを見ることがある', guide.includes('作成者は、登録されたチームの名前（チーム名だけ）を見ることがあります。記録・メンバー・選手名は見ません。'));
// ③ 画面（偽の Firebase）
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p)) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const sleep = ms => new Promise(r => setTimeout(r, ms));
const p = await b.newPage(); await p.setBypassServiceWorker(true); await p.setViewport({ width: 1280, height: 800 }); await p.setRequestInterception(true); install(p, B);
const errs = []; p.on('pageerror', e => errs.push(e.message));
const ts = { __ts: Date.UTC(2026, 3, 1) };
const DB = { 'teams/TaaaaaaaaaaaaaaaaaaA': { v: 1, name: 'わかば架空高校陸上部', ownerUid: 'owner-zzz-1', createdAt: ts }, 'teams/TbbbbbbbbbbbbbbbbbbB': { v: 1, name: 'あおば架空中学校', ownerUid: 'owner-zzz-2', createdAt: ts },
  'teams/TcccccccccccccccccC': { v: 1, name: 'かえで架空高校', ownerUid: 'owner-zzz-3', createdAt: ts }, 'teams/TaaaaaaaaaaaaaaaaaaA/members/owner-zzz-1': { role: 'coach', name: '架空 顧問ひみつ' },
  'teams/TaaaaaaaaaaaaaaaaaaA/records/r1': { name: '架空 選手ひみつ', ev: '100m', mark: '12.34' }, 'teams/TaaaaaaaaaaaaaaaaaaA/codes/c1': { role: 'manager' } };
async function as(u, extra) {
  await p.goto(B + 'guide.html'); await p.evaluate((u, d) => { localStorage.clear(); if (u) localStorage.setItem('__fakeuser', JSON.stringify(u)); localStorage.setItem('__fakedb', JSON.stringify(d)); }, u, Object.assign({}, DB, extra || {}));
  await p.goto(B + 'admin.html', { waitUntil: 'load' }); await sleep(1500);
  return p.evaluate(() => ({ txt: document.getElementById('adOut').innerText, html: document.body.innerHTML, inBtn: !document.getElementById('adIn').hidden, outBtn: !document.getElementById('adOut2').hidden,
    list: [...document.querySelectorAll('#adList li')].map(e => e.textContent), count: (document.getElementById('adCount') || {}).textContent || '', uid: (document.getElementById('adUid') || {}).textContent || '' }));
}
let r = await as(null);
ok('ログインしていない：ログインボタンだけ・一覧は出ない', r.inBtn && !r.outBtn && !r.list.length && !r.uid, r.txt);
r = await as({ uid: 'fake-coach-uid-1', displayName: '架空 顧問', email: 'coach@example.invalid', providerData: [{ providerId: 'google.com' }] });
ok('管理者でない：「あなたのUID：…」を出す', /あなたのUID：/.test(r.txt) && r.uid === 'fake-coach-uid-1', r.txt);
ok('管理者でない：チームの一覧・件数・チーム名は出ない', !r.list.length && !r.count && !/架空高校|架空中学校/.test(r.html) && /管理者ではない/.test(r.txt), r.txt);
ok('管理者でない：ログアウトボタン', r.outBtn && !r.inBtn);
r = await as({ uid: 'fake-admin-uid-9', displayName: '架空 作成者', email: 'admin@example.invalid', providerData: [{ providerId: 'google.com' }] }, { 'admins/fake-admin-uid-9': {} });
ok('管理者：UID を出す', r.uid === 'fake-admin-uid-9');
ok('管理者：チーム名の一覧が名前の順', JSON.stringify(r.list) === JSON.stringify(['あおば架空中学校', 'かえで架空高校', 'わかば架空高校陸上部']), JSON.stringify(r.list));
ok('管理者：件数「登録チーム 3件」', r.count === '登録チーム 3件', r.count);
ok('管理者：名前以外（持ち主のUID・作成日・メンバー・選手名・コード）は画面に出ない', !/owner-zzz|2026|ひみつ|TaaaaaaaaaaaaaaaaaaA|manager/.test(r.html), r.txt);
if (SHOT) await p.screenshot({ path: SHOT, fullPage: true });
await p.click('#adOut2'); await sleep(500);
r = await p.evaluate(() => ({ list: document.querySelectorAll('#adList li').length, uid: !!document.getElementById('adUid'), u: localStorage.getItem('__fakeuser') }));
ok('ログアウト：一覧と UID を消す', !r.list && !r.uid && !r.u, JSON.stringify(r));
await p.setViewport({ width: 390, height: 800 });
r = await as({ uid: 'fake-admin-uid-9', providerData: [{ providerId: 'google.com' }] }, { 'admins/fake-admin-uid-9': {} });
const ov = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
ok('スマホ幅（390）：横にはみ出さない', ov && r.list.length === 3);
ok('ページのエラーなし', !errs.length, errs.join(' / '));
await b.close(); srv.close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
