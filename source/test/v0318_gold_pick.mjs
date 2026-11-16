// v0.31.8：速報（gold 型）の一覧から競技一覧（kyougi1.html など）を選んで読み込んだとき、その一覧の結果のページ（rel*.html）までたどる（架空データのみ）
import assert from 'node:assert/strict';
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url'; import {JSDOM} from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url));
const B = 'https://kaku.example/2026/meet/';
const top = '<html><head><meta charset="utf-8"><title>架空秋季競技会</title></head><body>競技一覧<br><hr>男子<br><a href="kyougi1.html#KY00">１００ｍ</a><br><a href="kyougi2.html#KY01">２００ｍ</a><br><hr><a href="cond.html">コンディション画面へ</a></body></html>';
const idx = (n, rels) => '<html><head><meta charset="utf-8"><title>架空秋季競技会</title></head><body><a href="kyougi.html">競技先頭ページへ</a><hr><a name="KY0' + n + '">男子 種目' + n + '</a><br>ﾀｲﾑﾚｰｽ&nbsp;11月14日<br>' +
  rels.map((r, i) => '<a href="' + r + '">' + (i + 1) + '組&nbsp;9:4' + i + '</a>&nbsp;結果<br>').join('') + '<a href="kyougi' + (n === 1 ? 2 : 1) + '.html">次</a><a href="cond.html">コンディション画面へ</a></body></html>';
const rel = (t) => '<!-- 2026/11/14 09:44:05 15 --><html><head><meta charset="utf-8"><title>' + t + '</title></head>' + t + '<br><hr><font color="#000080">1位　(101)<br>　11.22<br>架空　一郎(1)<br>3・架空高<br></font><hr><a href="rel002.html">次のレースへ</a></body></html>';
const site = { [B + 'kyougi.html']: top, [B + 'kyougi1.html']: idx(1, ['rel001.html', 'rel002.html']), [B + 'kyougi2.html']: idx(2, ['rel003.html']),
  [B + 'rel001.html']: rel('男子 １００ｍ ﾀｲﾑﾚｰｽ1組'), [B + 'rel002.html']: rel('男子 １００ｍ ﾀｲﾑﾚｰｽ2組'), [B + 'rel003.html']: rel('男子 ２００ｍ ﾀｲﾑﾚｰｽ1組'), [B + 'cond.html']: '<html>x</html>' };
async function setup() {
  const w = new JSDOM('<div id="u"></div>', { url: 'https://lane-note.web.app/records.html', runScripts: 'outside-only' }).window;
  Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.HTMLElement.prototype.scrollIntoView = function () {};
  const log = [];
  w.eval(fs.readFileSync(path.join(here, '../src/urlload.js'), 'utf8'));
  w.fetch = async (u) => { const t = decodeURIComponent(u.slice((w.LaneUrl.PROXY + '?url=').length)); log.push(t); return site[t] ? new Response(site[t], { headers: { 'Content-Type': 'text/html; charset=utf-8' } }) : new Response('nf', { status: 404 }); };
  const got = [];
  const ui = w.LaneUrl.mount(w.document.getElementById('u'), { id: 'ru', targets: [{ k: 'res', label: '結果' }], accept: ['pdf', 'html'], multiple: true, delay: 0, onFiles: (fs) => { fs.forEach(f => got.push(f.name)); } });
  return { w, ui, got, log };
}
const delay = (ms = 80) => new Promise(r => setTimeout(r, ms));
let ok = 0; const check = async (n, f) => { await f(); ok++; console.log('  ✔ ' + n); };
console.log('[v0.31.8] 速報の競技一覧を選んで読み込む');
await check('競技一覧（kyougi1.html）だけ選ぶ → その一覧の結果ページ rel001・rel002 を取り込む（ほかの一覧・rel003 は取らない）', async () => {
  const { w, ui, got, log } = await setup(); const d = w.document;
  await ui.go(B + 'kyougi.html'); await delay();
  assert(d.querySelector('#ruLinks [data-crawl]'), '大会の速報ページとして出る');
  const lis = [...d.querySelectorAll('#ruLinks li')]; const i1 = lis.findIndex(li => /kyougi1\.html/.test(li.querySelector('a').href));
  lis[i1].querySelector('input').checked = true; d.querySelector('#ruLinks [data-load]').click();
  for (let k = 0; k < 40 && !got.length; k++) await delay(50);
  assert.deepEqual(got, ['kyougi.html', 'rel001.html', 'rel002.html']);
  assert(!log.includes(B + 'rel003.html') && !log.includes(B + 'kyougi2.html'), log.join(','));
  assert.match(d.getElementById('ruSt').textContent, /結果のページを 2 件/);
});
await check('このページ自体（競技一覧の先頭）を選んだら、大会の結果をまとめて取り込む（全部）', async () => {
  const { w, ui, got } = await setup(); const d = w.document;
  await ui.go(B + 'kyougi.html'); await delay();
  d.querySelector('#ruLinks li input').checked = true; d.querySelector('#ruLinks [data-load]').click();
  for (let k = 0; k < 40 && got.length < 4; k++) await delay(50);
  assert.deepEqual(got, ['kyougi.html', 'rel001.html', 'rel002.html', 'rel003.html']);
});
await check('速報でないページのリンクは、今までどおり選んだものだけ', async () => {
  const s2 = { [B + 'list.html']: '<html><body><a href="a.html">結果A</a><a href="b.html">結果B</a></body></html>', [B + 'a.html']: '<html><body>a</body></html>', [B + 'b.html']: '<html><body>b</body></html>' };
  Object.assign(site, s2);
  const { w, ui, got } = await setup(); const d = w.document;
  await ui.go(B + 'list.html'); await delay();
  assert(!d.querySelector('#ruLinks [data-crawl]'));
  const lis = [...d.querySelectorAll('#ruLinks li')]; lis[1].querySelector('input').checked = true; d.querySelector('#ruLinks [data-load]').click(); await delay(200);
  assert.deepEqual(got, ['a.html']);
});
console.log('v0.31.8 速報の競技一覧 OK ' + ok);
