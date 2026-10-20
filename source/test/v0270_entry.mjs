// v0.27.0 エントリー下書き：公認ベスト（参考は使わない）・公認なしは空欄・フィールドのm・リレー・ルール警告・参加料・印刷・コピー
//   架空データだけ。外には通信しない。 node v0270_entry.mjs [スクショの保存先フォルダ]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module'; import puppeteer from 'puppeteer-core';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), FX = path.join(here, 'fixtures'), NM = path.join(here, 'node_modules/pdfjs-dist/'), SHOT = process.argv[2] || '';
const R = createRequire(import.meta.url)('../src/results.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.27.0] エントリー下書き');
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] }); const sl = ms => new Promise(r => setTimeout(r, ms));
async function page(W = 1280) {
  const p = await b.newPage(); await p.setViewport({ width: W, height: 900 }); const errs = [];
  await p.setRequestInterception(true);
  p.on('request', r => { const u = r.url(), m = /cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[^/]+\/(.+)$/.exec(u);
    if (m) { const fp = NM + m[1].split('?')[0]; if (fs.existsSync(fp)) return r.respond({ status: 200, contentType: /\.m?js$/.test(fp) ? 'application/javascript' : 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(fp) }); }
    u.startsWith(B) || /^(data|blob):/.test(u) ? r.continue() : r.abort(); });
  p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.evaluateOnNewDocument(() => { if (!sessionStorage.getItem('__i')) { localStorage.clear(); sessionStorage.setItem('__i', '1'); } localStorage.setItem('lanenote.mode.v1', 'coach'); localStorage.setItem('lanenote.xnews.v1', '1'); });
  return { p, errs };
}
const E = createRequire(import.meta.url)('../src/entrydraft.js');
const rec = o => { const r = Object.assign({ meet: '架空区大会', date: '2026-09-20', event: '男子100m', round: '決勝', heat: '', name: '架空 一郎', kana: '', grade: '2', team: '架空中', mark: '12.40', wind: '+1.0', bib: '', lane: '', rank: 1, comment: '' }, o); r.id = R.recId(r.meet, r.date, r); return r; };
const ROWS = [rec({}), rec({ mark: '11.90', wind: '+2.5', date: '2026-09-21', meet: '架空記録会' }), rec({ event: '男子走幅跳', mark: '5.80', wind: '+0.5' }), rec({ event: '男子200m', mark: '24.00', wind: '+3.1' }),
  rec({ event: '男子八種競技', mark: '4000', wind: '' }), rec({ name: '架空 二郎', mark: '12.80', grade: '1' }), rec({ name: '架空 三郎', mark: '12.90' }), rec({ name: '架空 四郎', mark: '13.00', grade: '3' }), rec({ name: '架空 五郎', event: '男子八種競技', mark: '3500', wind: '' }),
  rec({ event: '男子4×100mR', name: '架空中', mark: '48.10', wind: '' }), rec({ event: '男子4×100mR', name: '架空中', mark: '47.50', wind: '', date: '2026-09-21', meet: '架空記録会' }),
  rec({ name: '架空 花子', event: '女子100m', mark: '13.50', wind: '+0.2' })];
const D = E.data(R, ROWS), K = n => D.athletes.find(a => a.name === n).key, EV = (n, l) => D.byKey[K(n)].events.find(e => e.label === l);
try {
  await check('公認ベスト：追い風参考（11.90）は使わず公認の12.40／記録の大会と日付も公認のもの', async () => {
    const e = EV('架空 一郎', '100m'); assert.equal(e.best.mark, '12.40'); assert.equal(e.best.meet, '架空区大会'); assert.equal(e.best.date, '2026-09-20');
    const P = E.newPlan(); P.picks[K('架空 一郎')] = [e.ev]; const L = E.lines(R, D, P); assert.equal(L[0].mark, '12.40'); assert.equal(L[0].grade, '2');
  });
  await check('公認記録なし：追い風参考しかない200mは空欄＋「公認記録なし（空欄でOK）」（推測しない）', async () => {
    const e = EV('架空 一郎', '200m'); assert.equal(e.best, null);
    const P = E.newPlan(); P.picks[K('架空 一郎')] = [e.ev]; const L = E.lines(R, D, P); assert.equal(L[0].mark, ''); assert(!/24\.00/.test(E.table(L)) && E.table(L).includes(E.NO_MARK));
    assert(E.text(R, D, P).includes('200m\t架空 一郎（2年）\t公認記録なし（空欄でOK）'));
  });
  await check('フィールド種目は「5.80m」（アプリのほかの表示と同じ）', async () => { const P = E.newPlan(); P.picks[K('架空 一郎')] = [EV('架空 一郎', '走幅跳').ev]; assert.equal(E.lines(R, D, P)[0].mark, '5.80m'); });
  await check('リレー：チームの公認ベスト（47.50）とメンバー', async () => {
    const x = D.relays[0]; assert.equal(x.best.mark, '47.50'); const P = E.newPlan(); P.relays[x.ev] = [{ label: 'A', members: ['架空 一郎', '架空 二郎', '架空 三郎', '架空 四郎'].map(K) }];
    const L = E.lines(R, D, P); assert.equal(L[0].kind, 'relay'); assert.equal(L[0].mark, '47.50'); assert.deepEqual(L[0].members, ['架空 一郎', '架空 二郎', '架空 三郎', '架空 四郎']); assert.deepEqual(E.check(D, P), []);
    assert.equal(E.data(R, ROWS.filter(r => !/R$/.test(r.event) || r.mark !== '47.50').map(r => /R$/.test(r.event) ? Object.assign({}, r, { wind: '' }) : r)).relays[0].best.mark, '48.10');
  });
  await check('ルール警告：1人2種目まで・リレー2チームまで・複数チーム・混成の重なり・混成は各校1名・人数（止めない）', async () => {
    const P = E.newPlan(), x = D.relays[0].ev;
    P.picks[K('架空 二郎')] = [EV('架空 二郎', '100m').ev, EV('架空 一郎', '200m').ev, EV('架空 一郎', '走幅跳').ev];
    P.picks[K('架空 一郎')] = [EV('架空 一郎', '八種競技').ev, EV('架空 一郎', '100m').ev]; P.picks[K('架空 五郎')] = [EV('架空 五郎', '八種競技').ev];
    P.relays[x] = [{ label: 'A', members: ['架空 二郎', '架空 三郎', '架空 四郎', '架空 花子'].map(n => n === '架空 花子' ? K('架空 三郎') : K(n)) }, { label: 'B', members: [K('架空 二郎')] }, { label: 'C', members: [] }];
    const c = E.check(D, P).map(w => w.code).sort(); assert.deepEqual([...new Set(c)].sort(), ['combAlone', 'combPerSchool', 'dup', 'legs', 'maxEv', 'noMulti', 'relayTeams'], c.join());
    assert.equal(E.lines(R, D, P).length, 6 + 3, '警告があっても下書きは作る');
    P.rules = Object.assign({}, P.rules, { maxEv: 3, relayTeams: 3, noMulti: false, combAlone: false, combPerSchool: 2 });
    const c2 = new Set(E.check(D, P).map(w => w.code)); assert(!c2.has('maxEv') && !c2.has('relayTeams') && !c2.has('noMulti') && !c2.has('combAlone') && !c2.has('combPerSchool'), [...c2].join());
  });
  await check('参加料：個人700・リレー1400・混成2000・プログラム700×部数（男女なら2部）・合計／変えられる', async () => {
    const P = E.newPlan(); P.picks[K('架空 一郎')] = [EV('架空 一郎', '100m').ev, EV('架空 一郎', '走幅跳').ev]; P.picks[K('架空 五郎')] = [EV('架空 五郎', '八種競技').ev];
    P.relays[D.relays[0].ev] = [{ label: 'A', members: [] }];
    let F = E.fees(R, D, P); assert.equal(F.copies, 1); assert.equal(F.total, 700 * 2 + 1400 + 2000 + 700);
    P.picks[K('架空 花子')] = [EV('架空 花子', '100m').ev]; F = E.fees(R, D, P); assert.equal(F.copies, 2); assert.equal(F.total, 700 * 3 + 1400 + 2000 + 1400); assert(E.feeTable(F).includes('6,900円'));
    P.fees.indiv = 800; P.fees.copies = 3; F = E.fees(R, D, P); assert.equal(F.total, 800 * 3 + 1400 + 2000 + 2100);
  });
  await check('画面：記録ページで選んで、表・警告・印刷・コピー（1280・390、はみ出さない）', async () => {
    for (const W of [1280, 390]) {
      const { p, errs } = await page(W); const ctx = b.defaultBrowserContext(); await ctx.overridePermissions(B.slice(0, -1), ['clipboard-read', 'clipboard-write']);
      const f = path.join(fs.mkdtempSync('/tmp/v0270-'), 's.json'); fs.writeFileSync(f, JSON.stringify({ records: ROWS }));
      await p.goto(B + 'records.html', { waitUntil: 'load' }); await sl(900);
      await p.evaluate(() => { const s = document.getElementById('rbSchool'); s.value = '架空'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); });
      await (await p.$('#rbImport')).uploadFile(f); await sl(2000);
      const hdr = await p.evaluate(() => [...document.querySelectorAll('header button, header a')].filter(e => e.offsetParent).map(e => e.textContent.trim()).join('|'));
      assert(!/エントリー下書き/.test(hdr), 'ヘッダーには出さない');
      await p.click('#rbEntryOpen'); await sl(300);
      const first = await p.evaluate(() => ({ help: !!document.querySelector('#rbEntry .en-help'), lines: [...document.querySelectorAll('#rbEntry .en-line')].map(e => e.textContent), hint: document.getElementById('rbEntryBox').innerText.trim() }));
      assert(!first.help, '説明ははじめ閉じる（?で開く）'); assert.equal(first.lines.length, 1); assert(first.lines[0].length <= 30, first.lines[0]); assert.equal(first.hint, '📝 エントリー下書き', 'ボタンの横に説明を出さない');
      await p.click('#rbEntry [data-en="help"]'); await sl(200);
      const help = await p.evaluate(() => document.querySelector('#rbEntry .en-help').innerText); assert(/手で打ち込む/.test(help) && /送ったり/.test(help));
      await p.click('#rbEntry [data-en="help"]'); await sl(200); assert(!(await p.$('#rbEntry .en-help')), '?でまた閉じる');
      await p.evaluate(() => document.querySelector('#rbEntry [data-ensex="m"]').click()); await sl(200);
      const pick = (n, ev) => p.evaluate((n, ev) => { const li = [...document.querySelectorAll('#rbEntry .en-aths li')].find(l => l.querySelector('.en-nm').textContent.startsWith(n)); [...li.querySelectorAll('.en-chip')].find(c => c.textContent.startsWith(ev + ' ')).click(); }, n, ev);
      await pick('架空 一郎', '100m'); await sl(150); await pick('架空 一郎', '200m'); await sl(150); await pick('架空 一郎', '走幅跳'); await sl(150);
      await p.evaluate(() => document.querySelector('#rbEntry [data-enteam]').click()); await sl(200);
      for (const [j, n] of ['架空 一郎', '架空 二郎', '架空 三郎', '架空 四郎'].entries()) await p.evaluate((j, n) => { const s = document.querySelector('#rbEntry [data-enleg$="|0|' + j + '"]'); s.value = [...s.options].find(o => o.textContent === n).value; s.dispatchEvent(new Event('change', { bubbles: true })); }, j, n);
      await sl(200);
      const r = await p.evaluate(() => ({ rows: [...document.querySelectorAll('#rbEntry .en-t tbody tr')].map(t => [...t.cells].map(c => c.innerText.replace(/\s+/g, ' ').trim())), warn: document.querySelector('#rbEntry .en-warn') ? document.querySelector('#rbEntry .en-warn').innerText : '', fee: document.querySelector('#rbEntry .en-tot').innerText, sw: document.documentElement.scrollWidth, vw: innerWidth,
        cur: getComputedStyle(document.querySelector('#rbEntry .en-chip')).cursor + getComputedStyle(document.querySelector('#rbEntry .en-q')).cursor }));
      assert.equal(r.rows.length, 4, JSON.stringify(r.rows)); assert.deepEqual(r.rows[0].slice(1, 4), ['2年', '100m', '12.40']); assert(/架空区大会 ?2026\.09\.20/.test(r.rows[0][4]));
      assert.equal(r.rows.find(x => x[2] === '200m')[3], '公認記録なし（空欄でOK）'); assert.equal(r.rows.find(x => x[2] === '走幅跳')[3], '5.80m'); assert.equal(r.rows[3][3], '47.50');
      assert(/1人2種目まで/.test(r.warn), r.warn); assert.equal(r.cur, 'pointerpointer'); assert(r.sw <= r.vw, W + ' はみ出し');
      assert(/4,200円/.test(r.fee), r.fee);   // 個人700×3＋リレー1400＋プログラム700×1
      // 下書きの件数＝見える行の数。表を画面のいちばん上に出しても、どの行も見出しなどに隠れない（v0.27.0：共通の th の sticky で1行目が隠れていた）
      for (const top of [false, true]) {
        const v = await p.evaluate(async top => {
          const t = document.querySelector('#rbEntry .en-t'); if (top) { t.scrollIntoView({ block: 'start' }); await new Promise(r => setTimeout(r, 150)); }
          const n = +(document.querySelector('#rbEntry .en-step:last-of-type .muted, #rbEntry .en-step .muted') ? [...document.querySelectorAll('#rbEntry .en-step .muted')].map(e => e.textContent).find(x => /件$/.test(x)).replace('件', '') : -1);
          const rows = [...t.tBodies[0].rows].map(tr => { tr.scrollIntoView({ block: 'center' }); const r = tr.getBoundingClientRect(), el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { h: r.height, ok: !!el && tr.contains(el), txt: tr.innerText.replace(/\s+/g, ' ').trim() }; });
          if (top) { t.scrollIntoView({ block: 'start' }); await new Promise(r => setTimeout(r, 150)); }
          const tr0 = t.tBodies[0].rows[0], r0 = tr0.getBoundingClientRect(), e0 = document.elementFromPoint(r0.x + r0.width / 2, r0.y + r0.height / 2);
          const th = t.tHead ? t.tHead.rows[0].cells[0] : null, hr = th ? th.getBoundingClientRect() : null;
          return { n, rows, firstOk: !!e0 && tr0.contains(e0), headAbove: !hr || hr.height === 0 || hr.bottom <= r0.top + 1 };
        }, top);
        assert.equal(v.rows.length, v.n, '件数と行の数がちがう ' + JSON.stringify(v));
        assert(v.rows.every(r => r.h > 0 && r.ok && r.txt), '隠れた行・空の行 ' + JSON.stringify(v.rows));
        assert(v.firstOk && v.headAbove, '1行目が見出しに隠れる（top=' + top + '）' + JSON.stringify(v));
        assert(/100m/.test(v.rows[0].txt) && /12\.40/.test(v.rows[0].txt), v.rows[0].txt);
      }
      await p.evaluate(() => window.scrollTo(0, 0)); await sl(150);
      if (SHOT) await (await p.$('#rbEntry')).screenshot({ path: path.join(SHOT, 'fix70_entry_' + W + '.png') });
      await p.click('#rbEntry [data-en="copy"]'); await sl(300);
      const cp = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
      assert(/【エントリー下書き】/.test(cp) && /200m\t架空 一郎（2年）\t公認記録なし（空欄でOK）/.test(cp) && /合計 4,200円/.test(cp), cp);
      await p.click('#rbEntry [data-en="print"]'); await sl(500);
      const pr = await p.evaluate(() => ({ vis: !document.getElementById('rbPrint').hidden, t: document.getElementById('rbPrintBody').innerText, band: !!document.querySelector('#rbPrintBody .lp-band'), tbl: !!document.querySelector('#rbPrintBody .lp-t') }));
      assert(pr.vis && pr.band && pr.tbl && /エントリー下書き/.test(pr.t) && /12\.40/.test(pr.t) && /公認記録なし（空欄でOK）/.test(pr.t) && /4,200円/.test(pr.t) && !/11\.90/.test(pr.t), pr.t.slice(0, 300));
      if (SHOT) await p.screenshot({ path: path.join(SHOT, 'fix70_print_' + W + '.png') });
      await p.evaluate(() => document.getElementById('rbPrintClose').click()); await sl(200);
      const st = await p.evaluate(() => Object.keys(localStorage).filter(k => /entry/i.test(k))); assert.deepEqual(st, [], '保存しない');
      assert(!errs.length, errs.join(' / ')); await p.close();
    }
  });
  await check('送信しない：エントリー下書きのコードに通信（fetch・XHR・送信）が無い', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'source/src/entrydraft.js'), 'utf8'); assert(!/fetch\(|XMLHttpRequest|sendBeacon|jaaf\.or\.jp|localStorage/.test(src));
  });
} finally { await b.close(); srv.close(); }
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
