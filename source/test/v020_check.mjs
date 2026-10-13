// v0.20 URLから読み込む：fetch は模擬（本物の中継・ネットワークにはつながない）
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src'), OUT = path.join(here, '../..');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8');
let pass = 0, fail = 0; const delay = (ms = 40) => new Promise(r => setTimeout(r, ms));
async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
const PROXY = 'https://lane-note-fetch.masashi-sakata1007.workers.dev/';
// 模擬の中継：URL → { status, type, body }
function fakeFetch(map, log) {
  return async (u, init) => {
    log && log.push({ u, init });
    assert(u.startsWith(PROXY + '?url='), '中継を通っていない: ' + u);
    const target = decodeURIComponent(u.slice((PROXY + '?url=').length));
    const r = typeof map[target] === 'string' ? { body: map[target] } : map[target]; if (!r) return new Response('nf', { status: 404 });
    if (r.throw) throw new TypeError('Failed to fetch');
    return new Response(r.body, { status: r.status || 200, headers: { 'Content-Type': r.type || 'text/html' } });
  };
}
async function dom(file, url, scripts, before) {
  const html = src(file).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
  const d = new JSDOM(html, { url, runScripts: 'outside-only' }); await delay();
  const w = d.window; w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
  Object.assign(w, { TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response, Blob, File });
  w.fetch = () => Promise.reject(new Error('network prohibited in tests'));
  w.indexedDB = new IDBFactory();
  if (before) before(w);
  scripts.forEach(s => w.eval(typeof s === 'function' ? s() : src(s)));
  return w;
}
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 10, 37, 37, 69, 79, 70]);   // "%PDF-1.7\n%%EOF"
const L = (() => { const w = new JSDOM('', { url: 'https://masarun0721.github.io/lane-note/', runScripts: 'outside-only' }).window; Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.eval(src('urlload.js')); return w.LaneUrl; })();

console.log('[v0.20-1] 部品（LaneUrl）');
await check('PDF/HTMLの見分け：Content-Type が違っても中身の先頭で判断', () => {
  assert.equal(L.sniff(PDF, 'application/octet-stream'), 'pdf');
  assert.equal(L.sniff(new TextEncoder().encode('<!DOCTYPE html><html>'), 'application/octet-stream'), 'html');
  assert.equal(L.sniff(new TextEncoder().encode('abc'), 'application/pdf'), 'pdf');
  assert.equal(L.sniff(new Uint8Array([0x50, 0x4b, 3, 4]), 'application/octet-stream'), 'other');
});
await check('リンク集め：相対URLを解決・PDFと同じサイトのページだけ・重複/画像/mailto/自分自身は除く・表の行見出しを付ける', () => {
  const h = '<table><tr><td>男子100m</td><td><a href="rel001.html">結果</a> <a href="pdf/100m.pdf">PDF</a></td></tr></table>' +
    '<a href="../tt.pdf">タイムテーブル</a><a href="rel001.html#x">重複</a><a href="logo.png">画像</a><a href="mailto:a@b">メール</a><a href="kyougi.html">自分</a><a href="https://other.example/x.html">よそ</a><a href="https://other.example/s.pdf">よそPDF</a>';
  const ls = L.findLinks(h, 'https://gold.jaic.org/jaic/res/kyougi.html');
  assert.deepEqual([...ls].map(l => String(l.url)), ['https://gold.jaic.org/jaic/res/rel001.html', 'https://gold.jaic.org/jaic/res/pdf/100m.pdf', 'https://gold.jaic.org/jaic/tt.pdf', 'https://other.example/s.pdf']);
  assert.equal(ls[1].kind, 'pdf'); assert.equal(ls[0].kind, 'page'); assert.match(ls[0].label, /男子100m/);
});
await check('Shift_JIS のページも文字化けしない', () => {
  const sj = new Uint8Array([0x3c,0x6d,0x65,0x74,0x61,0x20,0x63,0x68,0x61,0x72,0x73,0x65,0x74,0x3d,0x73,0x68,0x69,0x66,0x74,0x5f,0x6a,0x69,0x73,0x3e, 0x8c, 0x8b, 0x89, 0xca]);   // 結果
  assert.match(L.decodeHtml(sj, 'text/html'), /結果/);
});
await check('エラーはやさしい日本語：大きすぎる・対応していない形式・ログインが必要・読み込めない・見つからない・URLの形', async () => {
  const f = fakeFetch({
    'https://a.jp/big.pdf': { status: 413, body: 'too large' }, 'https://a.jp/x.zip': { status: 415, body: 'unsupported type' },
    'https://a.jp/login': { body: '<html><title>ログイン</title><form><input type="password"></form></html>' },
    'https://a.jp/auth': { status: 401, body: '' }, 'https://a.jp/down': { throw: true }, 'https://a.jp/zip2': { type: 'application/octet-stream', body: new Uint8Array([0x50, 0x4b, 3, 4]) } });
  const msg = async u => { try { await L.fetchUrl(u, { fetch: f }); return 'OK'; } catch (e) { return e.message; } };
  assert.match(await msg('https://a.jp/big.pdf'), /大きすぎる/);
  assert.match(await msg('https://a.jp/x.zip'), /対応していない形式/); assert.match(await msg('https://a.jp/zip2'), /対応していない形式/);
  assert.match(await msg('https://a.jp/login'), /ログインが必要/); assert.match(await msg('https://a.jp/auth'), /ログインが必要/);
  assert.match(await msg('https://a.jp/down'), /読み込めませんでした/); assert.match(await msg('https://a.jp/none'), /見つかりません/);
  assert.match(await msg('ftp://x'), /URLの形/);
});
await check('20MBを超える中身は Content-Length が無くても読まない', async () => {
  const big = new Uint8Array(20 * 1048576 + 10); big.set(PDF);
  const f = async () => new Response(big, { status: 200, headers: { 'Content-Type': 'application/pdf' } });
  await assert.rejects(L.fetchUrl('https://a.jp/b.pdf', { fetch: f }), /大きすぎる/);
});
await check('転送だけのページ（gold.jaic.org のトップのような location.href）は1回だけついていく', async () => {
  const f = fakeFetch({ 'https://gold.jaic.org/': { body: '<html><script>window.location.href="https://gold.jaic.org/jaic/indexj.htm";</script></html>' }, 'https://gold.jaic.org/jaic/indexj.htm': { body: '<html><title>JAIC</title></html>' } });
  const r = await L.fetchUrl('https://gold.jaic.org/', { fetch: f }); assert.equal(r.url, 'https://gold.jaic.org/jaic/indexj.htm'); assert.equal(r.title, 'JAIC');
});

console.log('[v0.20-2] 記録のページ（jsdom・実際のソース）');
const RES_HTML = '<html><head><meta charset="utf-8"><title>男子100m 決勝</title></head><body><h1>第1回 架空記録会</h1><p>2026年10月10日</p><table><tr><th>順位</th><th>ﾚｰﾝ</th><th>No.</th><th>氏名</th><th>所属</th><th>記録</th></tr><tr><td>1</td><td>4</td><td>101</td><td>架空 一郎(2)</td><td>架空中</td><td>12.34</td></tr></table></body></html>';
const INDEX_HTML = '<html><title>架空記録会</title><body><table><tr><td>男子100m</td><td><a href="rel001.html">決勝</a></td></tr><tr><td>女子100m</td><td><a href="rel002.html">決勝</a></td></tr><tr><td>一覧</td><td><a href="/pdf/all.pdf">PDF</a></td></tr></table></body></html>';
async function recW(map, log) {
  return dom('records_template.html', 'https://masarun0721.github.io/lane-note/records.html', ['auth_common.js', 'results.js', 'urlload.js', () => {
    let js = src('records_app.js'); const tail = 'if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }';
    assert(js.includes(tail)); return js.replace(tail, 'window.__t={scope};renderAuth();');
  }], w => { w.fetch = fakeFetch(map, log); });
}
await check('Webページ1枚：中継を通して取り、ファイルを入れたときと同じ取り込みのプレビューが出る（credentials は送らない）', async () => {
  const log = [], w = await recW({ 'https://kaku.example/res/rel001.html': { body: RES_HTML } }, log), d = w.document;
  d.getElementById('ruUrl').value = 'https://kaku.example/res/rel001.html'; d.getElementById('ruGo').click(); await delay(150);
  assert.equal(log.length, 1); assert.equal(log[0].init.credentials, 'omit');
  const b = d.getElementById('rbBatches'); assert(b.children.length >= 1, 'プレビューが出ない: ' + d.getElementById('ruSt').textContent);
  assert.match(b.textContent, /rel001\.html/);
});
await check('大会のページ：リンク一覧（相対URL解決）→ 選んだページだけ読み込む', async () => {
  const log = [], w = await recW({ 'https://kaku.example/res/kyougi.html': { body: INDEX_HTML }, 'https://kaku.example/res/rel001.html': { body: RES_HTML }, 'https://kaku.example/res/rel002.html': { body: RES_HTML.replace('男子', '女子') } }, log), d = w.document;
  d.getElementById('ruUrl').value = 'https://kaku.example/res/kyougi.html'; d.getElementById('ruGo').click(); await delay(120);
  const box = d.getElementById('ruLinks'); assert.equal(box.hidden, false);
  const items = [...box.querySelectorAll('li')]; assert.equal(items.length, 4, 'このページ自体＋3件');
  assert.match(box.innerHTML, /https:\/\/kaku\.example\/pdf\/all\.pdf/); assert.match(items[1].textContent, /男子100m/);
  items.forEach(li => { const c = li.querySelector('input'); c.checked = false; }); items[1].querySelector('input').checked = true; items[2].querySelector('input').checked = true;
  box.querySelector('[data-load]').click(); await delay(200);
  assert.deepEqual(log.map(x => decodeURIComponent(x.u.split('?url=')[1])), ['https://kaku.example/res/kyougi.html', 'https://kaku.example/res/rel001.html', 'https://kaku.example/res/rel002.html']);
  assert.match(d.getElementById('rbBatches').textContent, /rel001\.html、rel002\.html/);
});
await check('エラーはステータス欄に出て、プレビューは増えない', async () => {
  const w = await recW({ 'https://kaku.example/big.pdf': { status: 413, body: 'too large' } }), d = w.document;
  d.getElementById('ruUrl').value = 'https://kaku.example/big.pdf'; d.getElementById('ruGo').click(); await delay(100);
  assert.match(d.getElementById('ruSt').textContent, /大きすぎる/); assert.equal(d.getElementById('rbBatches').children.length, 0);
});
await check('URLだけを貼ったら、URL欄に入れて読み込みを促す（勝手には取りに行かない）', async () => {
  const log = [], w = await recW({}, log), d = w.document;
  d.getElementById('rbPaste').value = ' https://kaku.example/r.html '; d.getElementById('rbPasteGo').click(); await delay();
  assert.equal(d.getElementById('ruUrl').value, 'https://kaku.example/r.html'); assert.equal(log.length, 0);
});

console.log('[v0.20-3] 部品の画面：入れる先の自動選択・押した時点の文脈を持ち回る（A01）');
await check('大会準備型（入れる先が複数）：リンク名から入れる先を見当付け、入れる先ごとに渡す。PDFでないページは出さない', async () => {
  const w = new JSDOM('<div id="u"></div>', { url: 'https://masarun0721.github.io/lane-note/', runScripts: 'outside-only' }).window; Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File });
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.fetch = fakeFetch({ 'https://m.example/meet/': { body: '<a href="sl.pdf">スタートリスト</a><a href="tt.pdf">タイムテーブル</a><a href="note.pdf">競技注意事項</a><a href="page2.html">別ページ</a>' }, 'https://m.example/meet/sl.pdf': { type: 'application/pdf', body: PDF }, 'https://m.example/meet/tt.pdf': { type: 'application/pdf', body: PDF } });
  w.eval(src('urlload.js'));
  const got = [], T = [{ k: 'sl', label: 'SL', re: /スタート/ }, { k: 'tt', label: 'TT', re: /タイム/ }, { k: 'note', label: 'N', re: /注意/ }];
  let n = 0;
  const ui = w.LaneUrl.mount(w.document.getElementById('u'), { id: 'pu', targets: T, accept: ['pdf'], begin: () => ++n, onFiles: (fs, k, ctx) => { got.push([k, fs[0].name, fs[0].type, ctx]); } });
  await ui.go('https://m.example/meet/'); await delay();
  const sels = [...w.document.querySelectorAll('#puLinks select')]; assert.equal(sels.length, 3);
  assert.deepEqual(sels.map(s => s.value), ['sl', 'tt', 'note']);
  sels[2].value = ''; w.document.querySelector('#puLinks [data-load]').click(); await delay(120);
  assert.deepEqual(got, [['sl', 'sl.pdf', 'application/pdf', 1], ['tt', 'tt.pdf', 'application/pdf', 1]]);
  await ui.go('https://m.example/meet/sl.pdf'); await delay();
  assert.deepEqual(got[2], ['sl', 'sl.pdf', 'application/pdf', 2], 'PDF直接：選んでいる入れる先・新しい文脈');
});
await check('PDFだけ受け付ける画面で、リンクのないWebページは「PDFへのリンクが見つかりません」', async () => {
  const w = new JSDOM('<div id="u"></div>', { url: 'https://masarun0721.github.io/lane-note/check.html', runScripts: 'outside-only' }).window; Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File });
  w.fetch = fakeFetch({ 'https://m.example/p.html': { body: '<html><p>本文だけ</p></html>' } }); w.eval(src('urlload.js'));
  const ui = w.LaneUrl.mount(w.document.getElementById('u'), { id: 'cu', targets: [{ k: 'sl', label: 'SL' }], accept: ['pdf'], onFiles: () => { throw new Error('呼ばれてはいけない'); } });
  await ui.go('https://m.example/p.html'); assert.match(w.document.getElementById('cuSt').textContent, /PDFへのリンクが見つかりません/);
});


console.log('[v0.20.2] gold.jaic.org の速報（kyougi.html → kyougi1..N.html → rel*.html）');
const G = 'https://gold.jaic.org/tokyo/2026r/1011kaku/';
const head = t => '<!-- 2026/10/11 13:21:37 15 (Lsoku=0)-->\n<html lang="ja">\n<head>\n<meta http-equiv="Content-Type" content="text/html; charset=utf-8">\n<title>' + t + '</title></head>\n' + t + '<br>\n';
const blk = (rank, bib, mark, name, team, c) => '<font color="#' + (c || '000080') + '">' + (rank ? rank + '位' : '　') + '　(' + bib + ')<br>　' + mark + '<br>' + name + '<br>' + team + '<br>\n</font>';
const GOLD = {
  [G + 'kyougi.html']: head('第1回架空区陸上競技選手権大会') + '<font color="#000000">第1回架空区陸上競技選手権大会</font><br>競技一覧<br><a href="kyougi1.html#KY00">男子中学1年 １００ｍ</a><br><a href="kyougi1.html#KY01">男子中学共通 砲丸投(5.000kg)</a><br><a href="kyougi2.html#KY02">男子中学共通 ４×１００ｍ</a><br><a href="cond.html">コンディション画面へ</a></body></html>',
  [G + 'kyougi1.html']: head('第1回架空区陸上競技選手権大会') + '<a href="kyougi.html">競技先頭ページへ</a><br>\n<hr><a name="KY00">男子中学1年 １００ｍ</a><br>\nﾀｲﾑﾚｰｽ&nbsp;10月11日<br>\n(全 2組)<br>\n<a href="rel001.html">1組&nbsp;10:34</a>&nbsp;<font color="#E00000">結果</font><br>\n<a href="rel002.html">2組&nbsp;10:37</a>&nbsp;<font color="#E00000">結果</font><br>\nﾀｲﾑﾚｰｽ総合結果&nbsp;10月11日<br>\n<a href="rel010.html">&nbsp;10:38</a>&nbsp;<font color="#E00000">結果</font><br>\n<hr><a name="KY01">男子中学共通 砲丸投(5.000kg)</a><br>\n決勝&nbsp;10月11日<br>\n<a href="rel003.html">&nbsp;14:00</a>&nbsp;<font color="#E00000">結果</font><br><a href="kyougi2.html">次へ</a><a href="cond.html">コンディション画面へ</a>',
  [G + 'kyougi2.html']: head('第1回架空区陸上競技選手権大会') + '<a name="KY02">男子中学共通 ４×１００ｍ</a><br>決勝<br><a href="rel004.html">&nbsp;15:00</a><br><a href="kyougi1.html">前へ</a>',
  [G + 'rel001.html']: head('男子中学1年 １００ｍ ﾀｲﾑﾚｰｽ1組') + '全 2組<br>\n<hr>\n<center>風:-1.1<br></center>\n' + blk(1, 1079, '12.39', '架空  一郎(中1)', '架空十中') + blk(3, 123, '12.58', '佐山  架空(中1)', '架空第一中', '008000') + blk('', 124, 'DNS ', '欠場  太郎(中1)', '架空第一中', '000000') + '\n<hr>\n<a href="rel002.html#CONTENTS">次のレースへ</a><br><a href="kyougi.html">競技一覧画面へ</a>',
  [G + 'rel002.html']: head('男子中学1年 １００ｍ ﾀｲﾑﾚｰｽ2組') + '<hr>\n<center>風:+0.5<br></center>\n' + blk(1, 200, '13.42', '宮本  架空(中1)', '架空第一中') + '<hr><a href="rel001.html#CONTENTS">前</a>',
  [G + 'rel010.html']: head('男子中学1年 １００ｍ ﾀｲﾑﾚｰｽ総合結果') + '<hr>\n' + blk(1, 1079, '12.39(-1.1)', '架空  一郎(中1)', '架空十中') + blk(2, 123, '12.58(-1.1)', '佐山  架空(中1)', '架空第一中') + blk(3, 200, '13.42(+0.5)', '宮本  架空(中1)', '架空第一中'),
  [G + 'rel003.html']: head('男子中学共通 砲丸投(5.000kg) 決勝') + '<hr>\n' + blk(1, 155, '  9m54', '試験  一郎(中3)', '架空第一中'),
  [G + 'rel004.html']: head('男子中学共通 ４×１００ｍ 決勝') + '<hr>\n<font color="#000080">1位　　45.33<br>架空第一中A<br>\n(1)財満  架空(中3)<br>\n</font>',
  [G + 'cond.html']: head('コンディション') + '晴れ' };
await check('結果の行（携帯向けの形）を表にして読む：順位・番号・記録・氏名(学年)・所属・風・DNS・「12.58(-1.1)」', () => {
  const RP = createRequire(import.meta.url)('../src/results.js');
  const st = [G + 'rel001.html', G + 'rel002.html', G + 'rel010.html', G + 'rel003.html'].flatMap(u => RP.goldMobileStream(GOLD[u]));
  const res = RP.parseCells(st, {}); const H = [...res.recs].filter(r => r.team === '架空第一中');
  assert.equal(res.meet.date, '2026-10-11');
  assert.deepEqual(H.map(r => [r.event, r.round, r.heat, r.rank, r.name, r.grade, r.mark, r.wind, r.overall || '']),
    [['男子中学1年 100m', 'タイムレース', 1, 3, '佐山 架空', '中1', '12.58', '-1.1', 2], ['男子中学1年 100m', 'タイムレース', 1, '', '欠場 太郎', '中1', 'DNS', '', ''], ['男子中学1年 100m', 'タイムレース', 2, 1, '宮本 架空', '中1', '13.42', '+0.5', 3], ['男子中学共通 砲丸投(5.000kg)', '決勝', '', 1, '試験 一郎', '中3', '9m54', '', '']]);
  assert.equal(RP.goldMobileStream('<html><table><tr><td>順位</td></tr></table></html>'), null, 'ほかのHTMLは今までどおり');
});
await check('リンク名：「1組 10:34」だけでなく種目・ラウンドを付ける', () => {
  const ls = L.findLinks(GOLD[G + 'kyougi1.html'], G + 'kyougi1.html');
  const lab = u => [...ls].find(l => l.url === G + u).label;
  assert.equal(lab('rel001.html'), '男子中学1年 100m タイムレース 1組'); assert.equal(lab('rel010.html'), '男子中学1年 100m タイムレース総合結果'); assert.equal(lab('rel003.html'), '男子中学共通 砲丸投(5.000kg) 決勝');
  const top = L.findLinks(GOLD[G + 'kyougi.html'], G + 'kyougi.html'); assert.match([...top].find(l => /kyougi1/.test(l.url)).label, /男子中学1年 100m など2件の一覧/);
});
await check('記録のページ：「この大会の結果をまとめて取り込む」→ 一覧をたどって rel*.html を全部取り、コンディションは飛ばし、架空第一だけ・総合順位つきでプレビュー', async () => {
  const log = [], w = await recW(GOLD, log), d = w.document;
  d.getElementById('rbSchool').value = '架空第一'; d.getElementById('rbSchool').dispatchEvent(new w.Event('input'));
  d.getElementById('ruUrl').value = G + 'kyougi.html'; d.getElementById('ruGo').click(); await delay(150);
  const btn = d.querySelector('#ruLinks [data-crawl]'); assert(btn, 'まとめて取り込むボタンが出ない: ' + d.getElementById('ruSt').textContent + d.getElementById('ruLinks').innerHTML.slice(0,300));
  btn.click();
  for (let i = 0; i < 80 && !/読み取りました|✖/.test(d.getElementById('rbStatus').textContent); i++) await delay(100);
  const got = log.map(x => decodeURIComponent(x.u.split('?url=')[1]).replace(G, ''));
  assert.deepEqual(got.slice(1).sort(), ['kyougi1.html', 'kyougi2.html', 'rel001.html', 'rel002.html', 'rel003.html', 'rel004.html', 'rel010.html'].sort(), '取ったページ: ' + got.join(','));
  assert(!got.includes('cond.html')); assert.equal(new Set(got).size, got.length, '同じページを2回取った');
  assert.match(d.getElementById('ruSt').textContent, /5 件/);
  const rows = [...d.querySelectorAll('#rbBatches tr')].filter(tr => !tr.querySelector('th')).map(tr => tr.textContent);
  assert.equal(rows.length, 4, rows.join('\n')); assert(rows.every(r => /架空第一中/.test(r))); assert(rows.some(r => /総合2/.test(r)));
  assert.match(d.getElementById('rbBatches').innerHTML, /value="第1回架空区陸上競技選手権大会"/, [...d.querySelectorAll('#rbBatches input')].map(i => i.value).join('/'));
});
await check('まとめて取り込むは「やめる」で止まり、何も取り込まない・上限を超えたら読まない', async () => {
  const many = Object.assign({}, GOLD); let html = head('架空大会') + '<a name="KY00">男子 100m</a><br>決勝<br>'; for (let i = 1; i <= 30; i++) { html += '<a href="rel' + String(100 + i) + '.html">' + i + '組</a><br>'; many[G + 'rel' + (100 + i) + '.html'] = GOLD[G + 'rel002.html']; }
  many[G + 'kyougi1.html'] = html;
  const w = await recW(many), d = w.document;
  d.getElementById('ruUrl').value = G + 'kyougi.html'; d.getElementById('ruGo').click(); await delay(150);
  d.querySelector('#ruLinks [data-crawl]').click(); await delay(400);
  d.querySelector('#ruLinks [data-stop]').click(); await delay(400);
  assert.match(d.getElementById('ruSt').textContent, /やめました/); assert.equal(d.getElementById('rbBatches').children.length, 0);
  const out = await L.crawlMeet({ url: G + 'kyougi.html', kind: 'html', html: many[G + 'kyougi.html'] }, { fetch: fakeFetch(many), delay: 0, max: 10 });
  assert.equal(out.requests, 10); assert(out.rest.length > 0 && !out.failed.length);
});

console.log('[v0.20-4] ビルド結果');
await check('3ページに URL 欄・「今はまだ対応していません」は消えた・データの取り扱いに中継の説明・版 v0.20／記録 v0.10.0・worker/worker.js', () => {
  const I = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8'), R = fs.readFileSync(path.join(OUT, 'records.html'), 'utf8'), C = fs.readFileSync(path.join(OUT, 'check.html'), 'utf8'), G = fs.readFileSync(path.join(OUT, 'guide.html'), 'utf8');
  for (const [h, id] of [[I, 'urlLoad'], [R, 'rbUrlLoad'], [C, 'ckUrlLoad']]) { assert(h.includes('id="' + id + '"')); assert(h.includes('LaneUrl.mount')); assert(!/今はまだURLからの読み込みには対応していません/.test(h)); assert(h.includes(PROXY)); }
  assert.match(G, /Cloudflare/); assert.match(G, /保存しません/); assert.match(I, /v0\.20/); assert.match(R, /v0\.10\.\d/);
  const wk = fs.readFileSync(path.join(OUT, 'worker/worker.js'), 'utf8'); assert.match(wk, /ALLOWED_ORIGINS = \["https:\/\/masarun0721\.github\.io"/);
});
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
