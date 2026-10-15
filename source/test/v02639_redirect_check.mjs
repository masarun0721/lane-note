// v0.26.39 第5回外部監査 C509 の再現例を「安全な結果」を期待する回帰テストにしたもの（実際の worker/worker.js と urlload.js をつなぎ、上流の応答だけを模擬。外には出ない）
//   ・公式ホストの架空URL → 302 で別サイトの架空PDF：LaneUrl は実際に読んだ先（X-Lane-Url）を url に入れ、頼んだURLは from に残す
//   ・https から http への転送は受け取らない ・みんなの要項は自動では読み込まない（pickAuto はいつも null・画面の自動読み込みもなし）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, '../..'), require = createRequire(import.meta.url);
const {default: worker, _resetRate} = await import('data:text/javascript;base64,' + fs.readFileSync(path.join(root, 'worker/worker.js')).toString('base64'));
const LaneUrl = require('../src/urlload.js'), LanePub = require('../src/pubmeets.js');
const PDF = new TextEncoder().encode('%PDF-1.4\n% fictional audit pdf\n%%EOF\n');
let upstream = () => new Response('x');
globalThis.fetch = async (u, o) => upstream(u, o);
// ブラウザ → 中継（実物の worker.fetch）。Origin は公開ページ
const viaWorker = async (u) => { _resetRate(); const q = new URL(u); return worker.fetch(new Request(q.href, { headers: { Origin: 'https://masarun0721.github.io' } })); };
let pass = 0, fail = 0; async function test(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, e && e.message); } }
console.log('[v0.26.39 C509 転送と出典]');
await test('公式ホスト → 302 → 別サイトのPDF：noRedirect:true でも、url は実際に読んだ先（audit.example）・from は頼んだURL・redirected', async () => {
  upstream = (u) => u.startsWith('https://www.jaaf.or.jp/') ? new Response(null, { status: 302, headers: { Location: 'https://audit.example/other_meet.pdf' } }) : new Response(PDF, { headers: { 'Content-Type': 'application/pdf' } });
  const r = await LaneUrl.fetchUrl('https://www.jaaf.or.jp/kaku/yoko.pdf', { noRedirect: true, fetch: (u) => viaWorker(u) });
  assert.equal(r.kind, 'pdf'); assert.equal(r.url, 'https://audit.example/other_meet.pdf'); assert.equal(r.from, 'https://www.jaaf.or.jp/kaku/yoko.pdf'); assert.equal(r.redirected, true);
  assert.equal(LanePub.hostOf(r.url), 'audit.example'); assert.equal(LaneUrl.toFile(r).srcUrl, 'https://audit.example/other_meet.pdf');
});
await test('https → 302 → http（ダウングレード）は受け取らない（blocked）', async () => {
  upstream = (u) => u.startsWith('https://') ? new Response(null, { status: 302, headers: { Location: 'http://audit.example/plain.pdf' } }) : new Response(PDF, { headers: { 'Content-Type': 'application/pdf' } });
  let code = ''; try { await LaneUrl.fetchUrl('https://www.jaaf.or.jp/kaku/yoko2.pdf', { noRedirect: true, fetch: (u) => viaWorker(u) }); } catch (e) { code = e.code || e.message; }
  assert.ok(code === 'blocked' || /読み込めません/.test(code), '通ってしまった/' + code);
});
await test('中継が http の最終URLを返しても、アプリ側でも受け取らない（X-Lane-Url が http）', async () => {
  const fake = async () => new Response(PDF, { headers: { 'X-Lane-Type': 'application/pdf', 'X-Lane-Url': 'http://audit.example/plain.pdf' } });
  let code = ''; try { await LaneUrl.fetchUrl('https://www.jaaf.or.jp/kaku/yoko5.pdf', { noRedirect: true, fetch: fake }); } catch (e) { code = e.code || e.message; } assert.ok(code === 'blocked' || /読み込めません/.test(code), '通ってしまった/' + code);
});
await test('転送なし：url は頼んだURLのまま（redirected=false）', async () => {
  upstream = () => new Response(PDF, { headers: { 'Content-Type': 'application/pdf' } });
  const r = await LaneUrl.fetchUrl('https://www.jaaf.or.jp/kaku/yoko3.pdf', { noRedirect: true, fetch: (u) => viaWorker(u) });
  assert.equal(r.url, 'https://www.jaaf.or.jp/kaku/yoko3.pdf'); assert.equal(r.redirected, false);
});
await test('X-Lane-Url が壊れているときは受け取らない', async () => {
  const fake = async () => new Response(PDF, { headers: { 'X-Lane-Type': 'application/pdf', 'X-Lane-Url': 'javascript:alert(1)' } });
  let code = ''; try { await LaneUrl.fetchUrl('https://www.jaaf.or.jp/kaku/yoko4.pdf', { fetch: fake }); } catch (e) { code = e.code || 'err'; } assert.ok(code, '通ってしまった');
});
await test('自動では読み込まない：公式・報告0件・候補1つ・完全一致でも pickAuto は null', async () => {
  const e = { id: '2026-11-03_00000000', name: '架空大会', date: '2026-11-03', url: 'https://www.jaaf.or.jp/kaku/yoko.pdf', host: 'www.jaaf.or.jp', rep: 0, score: 1 };
  assert.equal(LanePub.pickAuto([e]), null);
});
await test('画面：候補は一覧だけ（自動の読み込みなし）・読み込んだら実際に読んだ先を出し、転送されたら ⚠', async () => {
  const app = fs.readFileSync(path.join(here, '../src/app.js'), 'utf8');
  const sug = app.slice(app.indexOf('async function pubSuggest'), app.indexOf("document.addEventListener('click'", app.indexOf('async function pubSuggest')));
  assert.doesNotMatch(sug, /pubLoad|pickAuto/); assert.match(sug, /pubShow\(p, ms\)/);
  const ld = app.slice(app.indexOf('async function pubLoad'), app.indexOf('function pubShow'));
  assert.match(ld, /実際に読んだ先/); assert.match(ld, /r\.url/); assert.match(ld, /ちがうサイトへ転送/); assert.doesNotMatch(app, /から要項を自動で読み込みました/);
});
console.log(`v02639_redirect_check: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
