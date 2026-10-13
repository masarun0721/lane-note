// v0.26.25 中継：許可リストをやめ、公開サイトならどこでも取る（非公開の宛先・転送先・種類・回数を検査）。上流は模擬（外には出ない）。架空データのみ
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const {default: worker, _resetRate, blockedHost} = await import('data:text/javascript;base64,' + fs.readFileSync(path.join(root, 'worker/worker.js')).toString('base64'));
const R = createRequire(import.meta.url)('../src/results.js');
const OK = 'https://masarun0721.github.io'; let seen = [], reply;
globalThis.fetch = async (u, o) => { seen.push({ u, o }); return reply(u, o); };
const req = (u, origin = OK, extra = {}) => new Request('https://lane-note-fetch.example.workers.dev/?url=' + encodeURIComponent(u), { headers: Object.assign({ Origin: origin }, extra) });
const pdf = () => new Response('%PDF-1.4 fictional', { headers: { 'Content-Type': 'application/pdf' } });
let ok = 0; const check = async (n, f) => { seen = []; reply = pdf; _resetRate(); await f(); ok++; console.log('  ✔ ' + n); };
console.log('[v0.26.25] 中継：公開サイトならどこでも');
await check('kotorikkyo.info・www.kotorikkyo.info・ほかの公開サイトの PDF／HTML を取れる', async () => {
  for (const u of ['https://www.kotorikkyo.info/_files/ugd/000000_fictional.pdf', 'https://kotorikkyo.info/x.pdf', 'https://example.org/result.pdf', 'http://example.org/result.pdf']) {
    const r = await worker.fetch(req(u)); assert.equal(r.status, 200, u); assert.equal(r.headers.get('x-lane-type'), 'application/pdf');
  }
  reply = () => new Response('<html><title>結果</title></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  assert.equal((await worker.fetch(req('https://example.org/'))).headers.get('x-lane-type'), 'text/html; charset=utf-8');
});
await check('非公開の宛先は通さない（上流に行かない）：localhost・*.local・*.internal・ドットなし・10/8・172.16/12・192.168/16・127/8・169.254/16・::1・fc00::/7・fe80::・IPv4埋め込み・0x7f.1 などの書き方・ポート・利用者名・ほかの方式・中継自身', async () => {
  const bad = ['https://localhost/', 'https://a.localhost/', 'https://printer.local/', 'https://metadata.google.internal/', 'https://intranet/', 'https://10.1.2.3/', 'https://172.16.0.1/', 'https://172.31.255.255/', 'https://192.168.1.1/',
    'https://127.0.0.1/', 'https://169.254.169.254/latest/meta-data', 'https://100.64.0.1/', 'https://0.0.0.0/', 'https://[::1]/', 'https://[fc00::1]/', 'https://[fd12::1]/', 'https://[fe80::1]/', 'https://[::ffff:127.0.0.1]/', 'https://[::ffff:a9fe:a9fe]/',
    'http://0x7f.1/', 'https://2130706433/', 'https://0177.0.0.1/', 'https://example.org:8443/', 'https://u:p@example.org/', 'ftp://example.org/', 'file:///etc/passwd', 'https://lane-note-fetch.example.workers.dev/?url=x'];
  for (const u of bad) assert.equal((await worker.fetch(req(u))).status, 400, u);
  assert.equal(seen.length, 0);
  assert.equal(blockedHost('172.15.0.1'), false); assert.equal(blockedHost('172.32.0.1'), false); assert.equal(blockedHost('8.8.8.8'), false);
});
await check('転送のたびに行き先を検査（非公開へは 400）・最大5回', async () => {
  reply = u => u.includes('example.org') ? new Response(null, { status: 302, headers: { Location: 'http://192.168.0.10/admin' } }) : pdf();
  assert.equal((await worker.fetch(req('https://example.org/a'))).status, 400); assert.equal(seen.length, 1);
  seen = []; let n = 0; reply = () => (++n <= 5 ? new Response(null, { status: 302, headers: { Location: '/r' + n } }) : pdf());
  assert.equal((await worker.fetch(req('https://example.org/r0'))).status, 200); assert.equal(seen.length, 6);
  seen = []; reply = () => new Response(null, { status: 302, headers: { Location: '/loop' } });
  assert.equal((await worker.fetch(req('https://example.org/loop'))).status, 400); assert.equal(seen.length, 6);
});
await check('返すのは PDF・HTML・テキストだけ。種類のないファイルは中身が %PDF のときだけ（PDF として）', async () => {
  reply = () => new Response('GIF89a', { headers: { 'Content-Type': 'image/gif' } }); assert.equal((await worker.fetch(req('https://example.org/a.gif'))).status, 415);
  reply = () => new Response('{"a":1}', { headers: { 'Content-Type': 'application/json' } }); assert.equal((await worker.fetch(req('https://example.org/a.json'))).status, 415);
  reply = () => new Response('MZ\x90\x00binary', { headers: { 'Content-Type': 'application/octet-stream' } }); assert.equal((await worker.fetch(req('https://example.org/a.exe'))).status, 415);
  reply = () => new Response('%PDF-1.7 fictional body', { headers: { 'Content-Type': 'application/octet-stream' } });
  const r = await worker.fetch(req('https://example.org/dl?id=1')); assert.equal(r.status, 200); assert.equal(r.headers.get('x-lane-type'), 'application/pdf'); assert.equal(await r.text(), '%PDF-1.7 fictional body');
});
await check('Cookie・Authorization は上流に渡さない', async () => {
  await worker.fetch(req('https://example.org/a.pdf', OK, { Cookie: 'sid=secret', Authorization: 'Bearer secret' }));
  const hd = new Headers(seen[0].o.headers); assert.equal(hd.get('cookie'), null); assert.equal(hd.get('authorization'), null); assert.equal(seen[0].o.redirect, 'manual');
});
await check('呼べるのは LANE NOTE のアドレスだけ（masarun0721.github.io・lane-note.web.app）', async () => {
  assert.equal((await worker.fetch(req('https://example.org/a.pdf', 'https://lane-note.web.app'))).headers.get('access-control-allow-origin'), 'https://lane-note.web.app');
  assert.equal((await worker.fetch(req('https://example.org/a.pdf', 'https://evil.invalid'))).status, 403);
});
await check('回数制限：LIMITER がなくても IP ごとに1分600回まで（601回目は 429・別の IP は通る）', async () => {
  for (let i = 0; i < 600; i++) assert.equal((await worker.fetch(req('https://example.org/a.pdf', OK, { 'CF-Connecting-IP': '203.0.113.5' }))).status, 200);
  assert.equal((await worker.fetch(req('https://example.org/a.pdf', OK, { 'CF-Connecting-IP': '203.0.113.5' }))).status, 429);
  assert.equal((await worker.fetch(req('https://example.org/a.pdf', OK, { 'CF-Connecting-IP': '203.0.113.6' }))).status, 200);
});
await check('アプリ側：知らないサイトでも断らずに中継へ出す。中継が 400（非公開の宛先）なら「このアドレスは読み込めません」', async () => {
  const w = new JSDOM('', { url: 'https://masarun0721.github.io/lane-note/', runScripts: 'outside-only' }).window;
  Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.eval(fs.readFileSync(path.join(root, 'source/src/urlload.js'), 'utf8'));
  const L = w.LaneUrl, asked = [];
  const f = async u => { asked.push(decodeURIComponent(u.split('?url=')[1])); return /10\.0\.0\.1/.test(u) ? new Response('blocked host', { status: 400 }) : new Response('%PDF-1.4 x', { headers: { 'X-Lane-Type': 'application/pdf' } }); };
  const r = await L.fetchUrl('https://www.kotorikkyo.info/_files/ugd/000000_fictional.pdf', { fetch: f }); assert.equal(r.kind, 'pdf');
  await assert.rejects(L.fetchUrl('https://10.0.0.1/a.pdf', { fetch: f }), e => e.code === 'blocked');
  assert.deepEqual(asked, ['https://www.kotorikkyo.info/_files/ugd/000000_fictional.pdf', 'https://10.0.0.1/a.pdf']);
});
await check('記録「DQ,FS」は DQ（理由 FS は備考に）', async () => { const m = R.cleanMark('DQ,FS'); assert.equal(m.mark, 'DQ'); assert.deepEqual(m.tags, ['FS']); });
console.log('v0.26.25 中継 OK ' + ok);
