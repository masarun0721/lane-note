// v0.26.44：Astra 第7回の対照テスト（http/https を混ぜた転送の鎖。最後の http は取りに行く前に止める）。本物の worker.js と urlload.js・上流はにせ物
// Actual Worker/LaneUrl, mocked upstream. No production connections or writes.
import fs from 'node:fs'; import assert from 'node:assert/strict'; import vm from 'node:vm';
const worker=await import('data:text/javascript;base64,'+fs.readFileSync(new URL('../../worker/worker.js',import.meta.url)).toString('base64'));
const sandbox={URL,TextDecoder,Uint8Array,Blob,File,AbortController,setTimeout,clearTimeout,console};sandbox.window=sandbox;sandbox.addEventListener=()=>{};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync(new URL('../src/urlload.js',import.meta.url),'utf8'),sandbox);
const orig=globalThis.fetch,relay=async u=>worker.default.fetch(new Request(u,{headers:{Origin:'https://masarun0721.github.io','CF-Connecting-IP':'192.0.2.10'}}),{});
let passed=0,failed=0;async function check(n,f){try{worker._resetRate();await f();passed++;console.log('PASS',n)}catch(e){failed++;console.log('FAIL',n,e.stack)}}
try{
 await check('C603 mixed chain: HTTP->302 HTTPS->HTML HTTP is rejected before final HTTP fetch',async()=>{
  const calls=[],start='http://audit.example/start',secure='https://audit.example/page',insecure='http://audit.example/final.pdf';
  globalThis.fetch=async u=>{u=String(u);calls.push(u);if(u===start)return new Response(null,{status:302,headers:{Location:secure}});if(u===secure)return new Response('<meta http-equiv="refresh" content="0;url='+insecure+'">',{headers:{'Content-Type':'text/html'}});throw Error('unexpected final HTTP fetch')};
  await assert.rejects(sandbox.LaneUrl.fetchUrl(start,{fetch:relay}),e=>e.code==='blocked');assert.deepEqual(calls,[start,secure]);
 });
 await check('C603 mixed chain: HTTPS->HTML HTTPS->302 HTTP is rejected before final HTTP fetch',async()=>{
  const calls=[],start='https://audit.example/start',next='https://audit.example/page',insecure='http://audit.example/final.pdf';
  globalThis.fetch=async u=>{u=String(u);calls.push(u);if(u===start)return new Response('<script>location.href="'+next+'";</script>',{headers:{'Content-Type':'text/html'}});if(u===next)return new Response(null,{status:302,headers:{Location:insecure}});throw Error('unexpected final HTTP fetch')};
  await assert.rejects(sandbox.LaneUrl.fetchUrl(start,{fetch:relay}),e=>e.code==='blocked');assert.deepEqual(calls,[start,next]);
 });
}finally{globalThis.fetch=orig}
console.log(JSON.stringify({passed,failed}));if(failed)process.exitCode=1;
