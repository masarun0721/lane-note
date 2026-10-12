// No network: upstream fetch is replaced by a stub. Asserts vulnerable current behavior.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve(process.env.LANE_NOTE_SOURCE||new URL('../attached-source',import.meta.url).pathname);
const {default:worker}=await import('data:text/javascript;base64,'+fs.readFileSync(path.join(root,'worker/worker.js')).toString('base64'));
let seen=[],reply=()=>new Response('fictional upstream',{headers:{'Content-Type':'text/plain'}}),passed=0;
globalThis.fetch=async(u,o)=>{seen.push({url:u,options:o});return reply();};
const req=(u,origin)=>new Request('https://worker.invalid/?url='+encodeURIComponent(u),origin===undefined?{}:{headers:{Origin:origin}});
async function test(n,f){seen=[];reply=()=>new Response('fictional upstream',{headers:{'Content-Type':'text/plain'}});await f();passed++;console.log('CONFIRMED',n);}
await test('W01: missing Origin permits arbitrary public host',async()=>assert.equal((await worker.fetch(req('https://example.org/'))).status,200));
await test('W02: spoofed approved Origin permits arbitrary public host',async()=>assert.equal((await worker.fetch(req('https://example.org/','https://masarun0721.github.io'))).status,200));
await test('W03: different Origin rejected (control)',async()=>{assert.equal((await worker.fetch(req('https://example.org/','https://other.invalid'))).status,403);assert.equal(seen.length,0);});
await test('W04: numeric IPv4 aliases normalize and are rejected (correction to S07)',async()=>{for(const h of ['0x7f.1','2130706433','127.0.0.1','[::1]']){assert.equal((await worker.fetch(req('http://'+h+'/'))).status,400);}assert.equal(seen.length,0);});
await test('W05: localhost. and device.local. pass hostname guard (reachability not tested)',async()=>{for(const h of ['localhost.','device.local.'])assert.equal((await worker.fetch(req('http://'+h+'/'))).status,200);});
await test('W06: requests automatic redirects; no validation of final destination in worker',async()=>{await worker.fetch(req('https://example.org/redirect'));assert.equal(seen[0].options.redirect,'follow');});
await test('W07: 21MiB body without Content-Length passes 20MiB limit',async()=>{reply=()=>new Response(new Uint8Array(21*1024*1024),{headers:{'Content-Type':'application/pdf'}});const res=await worker.fetch(req('https://example.org/large'));assert.equal(res.status,200);assert.equal((await res.arrayBuffer()).byteLength,21*1024*1024);});
await test('W08: oversized declared Content-Length rejected (control)',async()=>{reply=()=>new Response('x',{headers:{'Content-Type':'application/pdf','Content-Length':21*1024*1024}});assert.equal((await worker.fetch(req('https://example.org/large'))).status,413);});
await test('W09: active HTML returned as HTML; upstream sandbox and no-store discarded',async()=>{reply=()=>new Response('<script>globalThis.marker=1</script>',{headers:{'Content-Type':'text/html','Content-Security-Policy':'sandbox','Cache-Control':'no-store'}});const res=await worker.fetch(req('https://example.org/html'));assert.equal(res.headers.get('content-type'),'text/html');assert.equal(res.headers.get('content-security-policy'),null);assert.equal(res.headers.get('content-disposition'),null);assert.equal(res.headers.get('cache-control'),'public, max-age=60');assert.match(await res.text(),/<script>/);});
console.log(`${passed} confirmed checks, 0 failed`);
