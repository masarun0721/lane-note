// v0.28.9 📄 最終チェック用PDF（エントリー調査）。架空データだけ。node v0289_final_pdf.mjs [見本PDFの保存先フォルダ]
//   中身の関数を確かめ、Chrome があれば LanePdf で本当に PDF を作る（CDN から html2canvas・jsPDF を読むのでネット接続が必要）
import assert from 'node:assert/strict'; import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), OUT = process.argv[2] || '';
const req = createRequire(import.meta.url), R = req('../src/results.js'), S = req('../src/survey.js');
let pass = 0, fail = 0; const check = async (n, f) => { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } };
console.log('[v0.28.9] 最終チェック用PDF');
const SEI = ['青木', '石井', '上田', '江口', '大野', '加藤', '木村', '工藤', '小林', '佐藤', '清水', '鈴木', '田中', '千葉', '土屋', '中村', '西川', '野口', '橋本', '平野', '藤田', '本田', '松本', '三浦', '村上', '森', '山田', '横山', '吉田', '渡辺'];
const GR = ['3', '2', '1', '中3', '中2', '中1'], EV = ['男子100m', '男子200m', '男子400m', '男子800m', '男子1500m', '男子110mH', '男子走高跳', '男子走幅跳', '男子砲丸投'];
const roster = SEI.map((s, i) => ({ n: '見本 ' + s + '太', g: GR[i % 6], s: 'm' }));
const A = {}; roster.forEach((r, i) => { if (i % 10 === 9) return; if (i % 13 === 4) { A[i] = { join: false, ev1: '', ev2: '', relay: '', rel: '', cm: '体調不良のため' }; return; }
  A[i] = { ev1: EV[i % 9], ev2: i % 3 ? EV[(i + 4) % 9] : '', relay: i % 4 === 0 ? 'no' : 'ok', rel: i % 4 === 0 ? '' : i % 2 ? '男子4×100mR' : '男子4×400mR', rel2: i % 4 === 1 ? '男子4×400mR' : '', cm: i % 5 === 0 ? '第2希望は記録会の結果しだいで変えたいです。よろしくお願いします。' : '', join: true }; });
const C = { meet: '第1回 架空区秋季陸上競技大会', deadline: Date.parse('2026-10-30T14:59:59Z'), roster, kind: 'official', relayAsk: true, rels: ['男子4×100mR', '男子4×400mR'], sexes: 'm' };
const now = Date.parse('2026-10-23T02:00:00Z'), opt = cm => ({ cm, now, sort: l => R.sortEvents(l) });
await check('左右2段・学年ごと（上の学年から・中学は別で後）・名前順。種目だけ☐、リレーは☐なしで rel・rel2。ひとことは選んだときだけ下の行', () => {
  const s = S.sheet(C, A, opt(true)), t = s.html;
  assert.match(t, /class="fc-band"/); assert.equal((t.match(/<table class="fc-t">/g) || []).length, 2); assert.equal(s.left + s.right, s.rows); assert(Math.abs(s.left - s.right) <= 4, s.left + '/' + s.right);
  const gs = [...t.matchAll(/<span class="fc-gl">([^<]+)</g)].map(m => m[1]); assert.deepEqual(gs.filter((g, i) => g !== gs[i - 1]), ['3年', '2年', '1年', '中3年', '中2年', '中1年']); assert(!/(\d年)<\/span><\/td><\/tr><\/tbody><\/table><table class="fc-t"><thead>.*?<span class="fc-gl">\1/.test(t), '同じ学年の札が続かない');
  assert.match(t, /可<small>4×100mR・4×400mR<\/small>/); assert(!/fc-r">[^<]*☐/.test(t)); assert.match(t, /<span class="fc-ck">☐<\/span>100m/);
  assert.match(t, /class="fc-cmr"/); assert.match(t, /回答<b>\d+\/30人/); assert.match(t, /締切<b>10\/30/); assert.match(t, /LANE NOTE/);
  const w = S.sheet(C, A, opt(false)).html; assert(!w.includes('fc-cmr')); assert(!w.includes('記録会の結果しだい'));
  const first = t.split('<span class="fc-gl">3年</span>')[1].split('fc-gl')[0], names = [...first.matchAll(/<td class="fc-n">([^<]+)</g)].map(m => m[1]); assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'ja')));
  assert.equal(s.yet, 3); assert(s.out >= 2); assert.match(t, /出場しない<small>\d+人<\/small><\/h2><p class="fc-l"><span>見本 [^<]*<small>（体調不良のため）/);
});
await check('種目ごとの人数：標準の種目順のチップ・リレーも数える', () => {
  const s = S.sheet(C, A, opt(false)), k = s.counts.map(x => x[0]); assert.deepEqual(k, R.sortEvents(k.slice()));
  assert(k.includes('男子4×100mR') && k.includes('男子4×400mR')); assert.match(s.html, /<span class="fc-chip">100m<b>\d+<\/b>/); assert.match(s.html, /fc-chip rl">4×100mR/);
});
await check('記録会は 1種目目／2種目目。リレーを聞かない調査はリレーの列ごと出さない', () => {
  const t = S.sheet(Object.assign({}, C, { kind: 'kiroku', relayAsk: false, rels: [] }), A, opt(false)).html; assert.match(t, /<th>1種目目<\/th><th>2種目目<\/th><\/tr>/); assert(!t.includes('リレー<')); assert(!t.includes('fc-r')); assert(!/4×100mR<b>/.test(t));
});
const CHROME = '/usr/bin/google-chrome';
if (fs.existsSync(CHROME)) {
  const puppeteer = (await import('puppeteer-core')).default;
  const srv = http.createServer((q, r) => fs.readFile(path.join(ROOT, decodeURIComponent(q.url.split('?')[0])), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': /html$/.test(q.url.split('?')[0]) ? 'text/html; charset=utf-8' : 'application/javascript' }); r.end(d); } }));
  await new Promise(r => srv.listen(0, r)); const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] }), p = await b.newPage(); await p.setBypassServiceWorker(true);
  await p.goto(`http://127.0.0.1:${srv.address().port}/records.html`, { waitUntil: 'load' });
  for (const cm of [true, false]) await check('PDFを作る（印刷ダイアログなし）：A4・30人で1ページ（ひとことありは2ページまで）・ひとこと' + (cm ? 'あり' : 'なし'), async () => {
    const r = await p.evaluate(async (C, A, cm, now) => { const s = LaneSurvey.sheet(C, A, { cm, now }); const o = await LanePdf.make({ html: LaneSurvey.sheetDoc(s), filename: s.filename, margin: 10, footer: 'LANE NOTE', trim: true });
      const u = new Uint8Array(await o.blob.arrayBuffer()); let x = ''; for (let i = 0; i < u.length; i += 8192) x += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return { pages: o.pages, name: o.filename, b64: btoa(x) }; }, C, A, cm, now);
    assert(r.pages >= 1 && r.pages <= (cm ? 2 : 1), r.pages); assert.match(r.name, /最終チェック/);
    if (OUT) fs.writeFileSync(path.join(OUT, cm ? 'v0289b_with.pdf' : 'v0289b_without.pdf'), Buffer.from(r.b64, 'base64'));
  });
  await b.close(); srv.close();
}
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
