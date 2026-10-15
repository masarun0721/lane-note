// v0.26.42 前の内容を戻したときの帯（#ssNote）に、どの大会の内容かを出す（架空データのみ・本番に接続しない）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..');
const delay = (ms = 60) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.42] 戻したときの帯に大会名と日付');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = html.match(/<script>([\s\S]*?)<\/script>/g).map(x => x.replace(/^<script>|<\/script>$/g, ''));
async function open(snap, search = '') {
  const d = new JSDOM(html.replace(/<script>[\s\S]*?<\/script>/g, ''), { url: 'http://127.0.0.1:9/index.html' + search, runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
    beforeParse(v) { if (snap) v.sessionStorage.setItem('lanenote-meet-session', JSON.stringify(snap)); v.HTMLElement.prototype.scrollIntoView = function () {}; } });
  await delay(30); const w = d.window; Object.assign(w, { TextEncoder, TextDecoder, Response, File, Blob }); w.scrollTo = () => {}; w.confirm = () => true;
  for (const s of scripts) { try { w.eval(s); } catch (e) { } }
  w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await delay(300); return w;
}
const snap = (st, inp) => ({ v: 1, t: 1, own: { uid: 'anon', team: '', plan: '', exp: Date.now() + 36e5 }, st, inp, stat: {}, rule: {} });   // v0.26.42 C601：ログインなしで作った一時保存
const note = w => w.document.getElementById('ssNote');
await check('大会名と日付（戻した画面の値）を太字で出す・「最初から」ボタンは残る', async () => {
  const w = await open(snap({ yokoName: '架空要項.pdf' }, { meetName: { v: '第9回架空秋季記録会', m: '', a: '' }, meetDate: { v: '2026年11月1日', m: '1', a: '' } }));
  const n = note(w); assert.equal(n.hidden, false); assert.equal(n.querySelector('b').textContent, '第9回架空秋季記録会');
  assert.match(n.textContent, /↺ 前に読み込んだ内容を戻しました：第9回架空秋季記録会（2026年11月1日）（このタブを閉じると消えます）。/); assert(n.querySelector('#ssClearBtn'));
});
await check('大会名がなければ、読み込んだファイルの名前（要項）', async () => {
  const w = await open(snap({ yokoName: '架空大会要項.pdf' }, {}));
  assert.match(note(w).textContent, /戻しました：「架空大会要項\.pdf」（このタブを閉じると消えます）/);
});
await check('要項がなければスタートリストのファイル名', async () => {
  const w = await open(snap({ slName: '架空SL.pdf' }, {}));
  assert.match(note(w).textContent, /戻しました：「架空SL\.pdf」/);
});
await check('何もわからなければ、今までの文', async () => {
  const w = await open(snap({ notes: 'x' }, {}));
  assert.equal(note(w).textContent.replace(/\s*最初から\s*$/, '').trim(), '↺ 前に読み込んだ内容を戻しました（このタブを閉じると消えます）。');
});
await check('文字はエスケープする（タグとして入らない）', async () => {
  const w = await open(snap({}, { meetName: { v: '<img src=x onerror=alert(1)>架空大会', m: '', a: '' } }));
  const n = note(w); assert(!n.querySelector('img')); assert.match(n.textContent, /<img src=x onerror=alert\(1\)>架空大会/);
});
await check('大会予定から開いた（?plan=）ときは帯を出さない（今までどおり）', async () => {
  const w = await open(snap({ yokoName: '架空要項.pdf' }, { meetName: { v: '架空大会', m: '', a: '' } }), '?plan=' + encodeURIComponent('2026-11-01|架空大会'));
  assert.equal(note(w).hidden, true);
});
console.log('v02642_ss_banner: ' + pass + ' ok / ' + fail + ' NG'); process.exit(fail ? 1 : 0);
