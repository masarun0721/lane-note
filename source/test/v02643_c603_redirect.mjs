// v0.26.43 Astra 第6回 C603：https から始めたら、HTML の転送（meta refresh・location.href）の先でも https 必須。http へは取りに行く前に止める（本物の Worker と LaneUrl・上流はすべてにせ物。本番に接続しない）
import fs from 'node:fs'; import assert from 'node:assert/strict'; import vm from 'node:vm';
const worker = await import('data:text/javascript;base64,' + fs.readFileSync(new URL('../../worker/worker.js', import.meta.url)).toString('base64'));
const sandbox = { URL, TextDecoder, Uint8Array, Blob, File, AbortController, setTimeout, clearTimeout, console }; sandbox.window = sandbox; sandbox.addEventListener = () => {};
vm.createContext(sandbox); vm.runInContext(fs.readFileSync(new URL('../src/urlload.js', import.meta.url), 'utf8'), sandbox);
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.43] C603 転送の鎖で https → http を止める');
const originalFetch = globalThis.fetch, start = 'https://www.jaaf.or.jp/audit/start', endHttp = 'http://audit.example/final.pdf', endHttps = 'https://www.jaaf.or.jp/audit/final.pdf';
let calls = [], body = '';
globalThis.fetch = async u => { u = String(u); calls.push(u); if (u === start) { if (body === '302') return new Response(null, { status: 302, headers: { Location: endHttp } }); return new Response(body, { headers: { 'Content-Type': 'text/html' } }); } return new Response('%PDF-1.4\n% synthetic audit data\n', { headers: { 'Content-Type': 'application/pdf' } }); };
const relay = async u => worker.default.fetch(new Request(u, { headers: { Origin: 'https://lane-note.web.app', 'CF-Connecting-IP': '192.0.2.10' } }), {});
const page = to => '<html><head><meta http-equiv="refresh" content="0;url=' + to + '"></head><body>x</body></html>';
const js = to => '<html><head><script>location.href="' + to + '";</script></head><body>x</body></html>';
try {
  await check('HTTP 302 https→http は止める（これまでどおり）', async () => { calls = []; body = '302'; worker._resetRate(); await assert.rejects(sandbox.LaneUrl.fetchUrl(start, { fetch: relay }), e => e.code === 'blocked'); assert.deepEqual(calls, [start]); });
  await check('C603: meta refresh で https→http は blocked。http の先は取りに行かない', async () => { calls = []; body = page(endHttp); worker._resetRate(); await assert.rejects(sandbox.LaneUrl.fetchUrl(start, { fetch: relay }), e => e.code === 'blocked'); assert.deepEqual(calls, [start]); });
  await check('C603: location.href で https→http も blocked。http の先は取りに行かない', async () => { calls = []; body = js(endHttp); worker._resetRate(); await assert.rejects(sandbox.LaneUrl.fetchUrl(start, { fetch: relay }), e => e.code === 'blocked'); assert.deepEqual(calls, [start]); });
  await check('C603: httpsOnly を指定したら http の URL は取りに行く前に止める', async () => { calls = []; await assert.rejects(sandbox.LaneUrl.fetchUrl(endHttp, { fetch: relay, httpsOnly: true }), e => e.code === 'blocked'); assert.deepEqual(calls, []); });
  await check('https→https の meta refresh はこれまでどおり読める', async () => { calls = []; body = page(endHttps); worker._resetRate(); const r = await sandbox.LaneUrl.fetchUrl(start, { fetch: relay }); assert.equal(r.kind, 'pdf'); assert.equal(r.url, endHttps); assert.deepEqual(calls, [start, endHttps]); });
  await check('https→https の location.href もこれまでどおり読める', async () => { calls = []; body = js(endHttps); worker._resetRate(); const r = await sandbox.LaneUrl.fetchUrl(start, { fetch: relay }); assert.equal(r.kind, 'pdf'); assert.equal(r.url, endHttps); });
  await check('noRedirect のときは転送をたどらない（これまでどおり）', async () => { calls = []; body = page(endHttp); worker._resetRate(); const q = await sandbox.LaneUrl.fetchUrl(start, { fetch: relay, noRedirect: true }); assert.equal(q.kind, 'html'); assert.deepEqual(calls, [start]); });
} finally { globalThis.fetch = originalFetch; }
console.log(JSON.stringify({ passed: pass, failed: fail })); if (fail) process.exitCode = 1;
