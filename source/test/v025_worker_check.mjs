// v0.25：Cloudflare Worker の中継（Astra 第3回監査 W01〜W09 を「直ったこと」の期待値に変えて取り込み）。上流 fetch は模擬（外には出ない）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const {default: worker} = await import('data:text/javascript;base64,' + fs.readFileSync(path.join(root, 'worker/worker.js')).toString('base64'));
const OK = 'https://masarun0721.github.io';
let seen = [], reply, pass = 0, fail = 0;
const plain = () => new Response('fictional upstream', { headers: { 'Content-Type': 'text/plain' } });
globalThis.fetch = async (u, o) => { seen.push({ url: u, options: o }); return reply(u, o); };
const req = (u, origin = OK) => new Request('https://worker.invalid/?url=' + encodeURIComponent(u), origin === null ? {} : { headers: { Origin: origin } });
async function test(n, f) { seen = []; reply = plain; try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, e.stack); } }
console.log('[v0.25 Worker]');
await test('W01→ Origin なしは 403・上流に行かない', async () => { assert.equal((await worker.fetch(req('https://gold.jaic.org/', null))).status, 403); assert.equal(seen.length, 0); });
await test('W02→ 許可 Origin を名乗っても、許可リスト外のサイトは 403（汎用の中継にならない）', async () => { const r = await worker.fetch(req('https://example.org/')); assert.equal(r.status, 403); assert.match(await r.text(), /host not allowed/); assert.equal(seen.length, 0); });
await test('W03 対照：許可外 Origin は 403', async () => { assert.equal((await worker.fetch(req('https://gold.jaic.org/', 'https://other.invalid'))).status, 403); assert.equal(seen.length, 0); });
await test('W04/W05→ 数字のIP・localhost.・device.local.・http・ポート指定・利用者名は通さない', async () => {
  for (const u of ['http://0x7f.1/', 'https://2130706433/', 'https://[::1]/', 'https://localhost./', 'https://device.local./', 'http://gold.jaic.org/', 'https://gold.jaic.org:8443/', 'https://u:p@gold.jaic.org/']) assert.ok([400, 403].includes((await worker.fetch(req(u))).status), u);
  assert.equal(seen.length, 0);
});
await test('許可サイト：末尾のドットは取り除いて通す・取得専用の応答（octet-stream・attachment・nosniff・sandbox・no-store・X-Lane-Type）', async () => {
  reply = () => new Response('<script>globalThis.marker=1</script>', { headers: { 'Content-Type': 'text/html; charset=Shift_JIS', 'Cache-Control': 'public', 'Content-Security-Policy': 'x' } });
  const r = await worker.fetch(req('https://gold.jaic.org./a.html')); assert.equal(r.status, 200);
  assert.equal(seen[0].url, 'https://gold.jaic.org/a.html'); assert.equal(seen[0].options.redirect, 'manual');
  assert.equal(r.headers.get('content-type'), 'application/octet-stream'); assert.equal(r.headers.get('content-disposition'), 'attachment'); assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('content-security-policy'), /sandbox/); assert.equal(r.headers.get('cache-control'), 'no-store'); assert.equal(r.headers.get('x-lane-type'), 'text/html; charset=Shift_JIS');
  assert.match(r.headers.get('access-control-expose-headers'), /X-Lane-Type/);
});
await test('W06→ リダイレクトは自分でたどり、行き先も検査（許可外・3回超は止める）', async () => {
  reply = u => u.includes('/r1') ? new Response(null, { status: 302, headers: { Location: '/r2' } }) : u.includes('/r2') ? new Response(null, { status: 301, headers: { Location: 'https://169.254.169.254/latest' } }) : plain();
  assert.equal((await worker.fetch(req('https://gold.jaic.org/r1'))).status, 403); assert.equal(seen.length, 2);
  seen = []; reply = () => new Response(null, { status: 302, headers: { Location: '/loop' } });
  assert.equal((await worker.fetch(req('https://gold.jaic.org/loop'))).status, 400); assert.equal(seen.length, 4);
  seen = []; reply = u => u.endsWith('/a') ? new Response(null, { status: 302, headers: { Location: 'https://gold.jaic.org/b.pdf' } }) : new Response('%PDF-1.4', { headers: { 'Content-Type': 'application/pdf' } });
  const r = await worker.fetch(req('https://gold.jaic.org/a')); assert.equal(r.status, 200); assert.equal(await r.text(), '%PDF-1.4');
});
await test('W07→ Content-Length なしの 21MiB は、20MiB を超えたところで止まる', async () => {
  reply = () => new Response(new ReadableStream({ start(c) { for (let i = 0; i < 21; i++) c.enqueue(new Uint8Array(1024 * 1024)); c.close(); } }), { headers: { 'Content-Type': 'application/pdf' } });
  const r = await worker.fetch(req('https://gold.jaic.org/big.pdf'));
  await assert.rejects(r.arrayBuffer());
});
await test('W08 対照：大きすぎる Content-Length は 413', async () => { reply = () => new Response('x', { headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(21 * 1024 * 1024) } }); assert.equal((await worker.fetch(req('https://gold.jaic.org/x.pdf'))).status, 413); });
await test('形式：画像などは 415・GET 以外は 405', async () => {
  reply = () => new Response('x', { headers: { 'Content-Type': 'image/svg+xml' } }); assert.equal((await worker.fetch(req('https://gold.jaic.org/x.svg'))).status, 415);
  assert.equal((await worker.fetch(new Request('https://worker.invalid/?url=x', { method: 'POST', headers: { Origin: OK } }))).status, 405);
});
await test('回数制限：LIMITER があれば 429', async () => { const env = { LIMITER: { limit: async () => ({ success: false }) } }; assert.equal((await worker.fetch(req('https://gold.jaic.org/'), env)).status, 429); assert.equal(seen.length, 0); });
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);
