// v0.28.2 エントリー下書きと調査リンク：学年（しぼる・並べる・学年ごとに入れる）・参加料の単価・出場する/しない・調査の種類（公式戦/記録会）・リレーを聞く
//   Chrome・ローカル・偽の Firebase（fake_firebase.mjs）・架空データだけ。権限のルールは rules_survey_check.mjs（エミュレーター）で確かめる
//   node v0280_survey.mjs [スクショの保存先フォルダ]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module'; import puppeteer from 'puppeteer-core';
import {install} from './fake_firebase.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), SHOT = process.argv[2] || '';
const req = createRequire(import.meta.url), R = req('../src/results.js'), E = req('../src/entrydraft.js'), S = req('../src/survey.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.28.2] 学年・参加料・出場しない・記録会');
const rec = o => { const r = Object.assign({ meet: '架空区大会', date: '2026-09-20', event: '男子100m', round: '決勝', heat: '', name: '架空 一郎', kana: '', grade: '2', team: '架空中', mark: '12.40', wind: '+1.0', bib: '', lane: '', rank: 1, comment: '' }, o); r.id = R.recId(r.meet, r.date, r); return r; };
const ROWS = [rec({ name: '架空 一郎', grade: '2' }), rec({ name: '架空 一郎', grade: '2', event: '男子走幅跳', mark: '5.80', wind: '+0.5' }), rec({ name: '架空 二郎', grade: '1', mark: '12.80' }), rec({ name: '架空 三郎', grade: '3', mark: '12.10' }),
  rec({ name: '架空 四郎', grade: '1', mark: '13.10' }), rec({ name: '架空 五郎', grade: '3', mark: '12.30' }), rec({ event: '男子4×100mR', name: '架空中', mark: '47.50', wind: '' }), rec({ name: '架空 花子', grade: '2', event: '女子100m', mark: '13.50', wind: '+0.2' })];
const D = E.data(R, ROWS), K = n => D.athletes.find(a => a.name === n).key;
await check('学年の札と並べ順：中1→中3→高1→高3→（区分なし）1→3→学年なし。「1年」だけのときは大会の区分・名簿の書き方に合わせる。同じ学年の中は元の順', () => {
  assert.equal(E.gradeInfo('中2').lbl, '中2年'); assert.equal(E.gradeInfo('高1').lbl, '高1年'); assert.equal(E.gradeInfo('2', 'hs').lbl, '高2年'); assert.equal(E.gradeInfo('2', '').lbl, '2年'); assert.equal(E.gradeInfo('').lbl, '学年なし');
  assert.equal(E.gradeBase(['高1', '2']), 'hs'); assert.equal(E.gradeBase(['中1', '高1']), ''); assert.equal(E.gradeBase(['1'], '中学'), 'jh');
  const l = ['高2 A', '中3 B', '高1 C', '中1 D', '高2 E', ' F', '中3 G'].map(x => ({ g: x.split(' ')[0], n: x.split(' ')[1] }));
  assert.equal(E.byGrade(l, x => x.g, '', 1).map(x => x.n).join(''), 'DBGCAEF'); assert.equal(E.byGrade(l, x => x.g, '', -1).map(x => x.n).join(''), 'AECBGDF');
});
await check('要項の参加費：個人・リレー・混成・プログラムを1つに決まるときだけ（ちがう値が2つなら、その種類は空）', () => {
  const L = req('../src/deadline.js');
  assert.deepEqual(L.fees('10．参加費 個人１種目－７００円，リレー１チーム－１,４００円、混成種目 ２，０００円 プログラム１部－７００円'), { indiv: 700, relay: 1400, comb: 2000, prog: 700 });
  assert.deepEqual(L.fees('参加料 個人 600円 リレー 1200円\n個人 700円'), { relay: 1200 }); assert.deepEqual(L.fees('参加料は当日'), {});
});
await check('出場しない（join:false）：希望・リレーは空にして、ひとこと（理由）だけ・空でも送れる。下書きには入れず、出場しない人として返す。join の無い古い答えは出場する', () => {
  const s = { evs: ['男子100m'], rels: ['男子4×100mR'] };
  assert.deepEqual(S.cleanAnswer({ join: false, ev1: '男子100m', relay: 'ok', cm: '' }, s).ok, { ev1: '', ev2: '', relay: '', rel: '', cm: '', join: false });
  assert(S.cleanAnswer({ join: true }, s).err); assert.equal(S.cleanAnswer({ ev1: '男子100m' }, s).ok.join, undefined);
  const P = E.newPlan(), r = S.apply(E, D, P, { roster: [{ n: '架空 一郎' }, { n: '架空 二郎' }], akeys: [K('架空 一郎'), K('架空 二郎')] }, { 0: { join: false, ev1: '', relay: '' }, 1: { ev1: '男子100m', relay: '' } });
  assert.deepEqual(r.out, ['架空 一郎']); assert.equal(r.picks, 1); assert(!P.picks[K('架空 一郎')]);
});
await check('調査の種類：はじめは公式戦（希望を聞く）・リレーを聞く。記録会はリレーを聞かないのがはじめ（変えられる）', () => {
  const o = { meet: '架空', sexes: 'm', roster: [{ n: 'x', g: '', s: 'm', key: 'k' }], evs: ['男子100m'], rels: [], deadline: S.jstDay(Date.now() + 5 * 864e5) };
  assert.deepEqual([S.buildDocs(o).pub.kind, S.buildDocs(o).pub.relayAsk], ['official', true]);
  assert.deepEqual([S.buildDocs(Object.assign({}, o, { kind: 'kiroku' })).pub.kind, S.buildDocs(Object.assign({}, o, { kind: 'kiroku' })).pub.relayAsk], ['kiroku', false]);
  assert.equal(S.buildDocs(Object.assign({}, o, { kind: 'kiroku', relayAsk: true })).pub.relayAsk, true);
});
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.webp') ? 'image/webp' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] }); const sl = ms => new Promise(r => setTimeout(r, ms));
const ALICE = { uid: 'alice', displayName: '架空 顧問A', email: 'coach-a@example.invalid' };
async function page(W = 1280, user = ALICE) {
  const p = await b.newPage(); await p.setViewport(W === 390 ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: W, height: 900 }); const errs = [];
  await p.setRequestInterception(true); install(p, B); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.evaluateOnNewDocument(u => { localStorage.setItem('lanenote.mode.v1', 'coach'); localStorage.setItem('lanenote.xnews.v1', '1'); if (u) localStorage.setItem('__fakeuser', JSON.stringify(u)); else localStorage.removeItem('__fakeuser'); }, user);
  return { p, errs };
}
const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('__fakedb') || '{}'));
let SID = '';
const txt = (p, sel) => p.evaluate(s => [...document.querySelectorAll(s)].map(x => x.textContent.trim()), sel);
try {
  const { p, errs } = await page(390);
  await p.goto(B + 'guide.html'); await p.evaluate(() => { localStorage.clear(); }); await p.goto(B + 'records.html', { waitUntil: 'load' }); await p.waitForFunction(() => !document.getElementById('rbSignOut').hidden, { timeout: 15000 }); await sl(800);
  await p.evaluate(() => { const s = document.getElementById('rbSchool'); s.value = '架空'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); });
  const f = path.join(fs.mkdtempSync('/tmp/v0282e-'), 's.json'); fs.writeFileSync(f, JSON.stringify({ records: ROWS })); await (await p.$('#rbImport')).uploadFile(f); await sl(2500);
  await p.click('#rbEntryOpen'); await sl(300);
  await check('② 学年でしぼる（全員・1年・2年・3年）：隠すだけ。隠れた人が選んだ種目は下書きと参加料に残り「非表示中に選択あり」と出る', async () => {
    assert.deepEqual(await txt(p, '#rbEntry [data-engf]'), ['全員', '1年', '2年', '3年']);
    assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('#rbEntry [data-engf="g1"]')).cursor), 'pointer');
    const pick = n => p.evaluate(n => { const li = [...document.querySelectorAll('#rbEntry .en-aths > li')].find(l => l.textContent.includes(n)); li.querySelector('[data-enpick]').click(); }, n);
    await pick('架空 一郎'); await sl(200); await pick('架空 三郎'); await sl(200);
    const tot0 = await p.evaluate(() => document.querySelector('#rbEnFee [data-ftot]').textContent);
    await p.evaluate(() => document.querySelector('#rbEntry [data-engf="g1"]').click()); await sl(200);
    assert.deepEqual((await txt(p, '#rbEntry .en-aths > li .en-nm')).map(x => x.replace(/\s.*/, '')), ['架空', '架空'].map((x, i) => x));
    const names = await txt(p, '#rbEntry .en-aths > li .en-nm'); assert(names.every(x => /1年/.test(x)) && names.length === 2, names.join());
    assert.equal(await p.evaluate(() => document.querySelector('#rbEntry [data-enhid]').textContent), '👁 非表示中に選択あり 2人（下書きと参加料には入っています）');
    assert.equal(await p.evaluate(() => document.querySelector('#rbEnFee [data-ftot]').textContent), tot0, '参加料はそのまま'); assert(/架空 一郎/.test(await p.evaluate(() => document.querySelector('#rbEntry .en-t').textContent)), '下書きに残る');
  });
  await check('② 学年順：いつもの順／学年 低→高／高→低（同じ学年は元の順）', async () => {
    await p.evaluate(() => document.querySelector('#rbEntry [data-engf=""]').click()); await sl(150);
    await p.evaluate(() => document.querySelector('#rbEntry [data-engs="-1"]').click()); await sl(200);
    const g = (await txt(p, '#rbEntry .en-aths > li .en-nm')).map(x => (/(\d)年/.exec(x) || [])[1]); assert.deepEqual(g, ['3', '3', '2', '1', '1']);
    await p.evaluate(() => document.querySelector('#rbEntry [data-engs="1"]').click()); await sl(200);
    assert.deepEqual((await txt(p, '#rbEntry .en-aths > li .en-nm')).map(x => (/(\d)年/.exec(x) || [])[1]), ['1', '1', '2', '3', '3']);
    await p.evaluate(() => document.querySelector('#rbEntry [data-engf="g3"]').click()); await sl(200);
    if (SHOT) { const r = await p.evaluate(() => { const e = document.querySelector('#rbEntry .en-grs'); e.scrollIntoView({ block: 'start' }); const a = e.getBoundingClientRect(), z = document.querySelector('#rbEntry .en-aths').getBoundingClientRect(); return { x: 0, y: a.top - 40 + scrollY, width: 390, height: z.bottom - a.top + 60 }; }); await sl(200); await p.screenshot({ path: path.join(SHOT, 'fix73_entry_grade.png'), clip: r, captureBeyondViewport: true }); }
    await p.evaluate(() => document.querySelector('#rbEntry [data-engf=""]').click()); await p.evaluate(() => document.querySelector('#rbEntry [data-engs="0"]').click()); await sl(150);
  });
  await check('④ 参加料：単価（100円きざみ）とプログラムの部数をその場で直す（上下の数の欄）。打つと合計がすぐ変わり、⚙ 参加料と同じ値・この端末に保存', async () => {
    const st = await p.evaluate(() => [...document.querySelectorAll('#rbEnFee input.en-fin')].map(x => x.getAttribute('data-enfee') + ':' + x.step + ':' + x.min + ':' + x.value));
    assert.deepEqual(st, ['indiv:100:0:700', 'relay:100:0:1400', 'comb:100:0:2000', 'prog:100:0:700', 'copies:1:0:1']);
    await p.evaluate(() => { const i = document.querySelector('#rbEnFee [data-enfee="indiv"]'); i.focus(); i.value = '800'; i.dispatchEvent(new Event('input', { bubbles: true })); }); await sl(150);
    const r = await p.evaluate(() => [document.querySelector('#rbEnFee [data-fsum="indiv"]').textContent, document.querySelector('#rbEnFee [data-ftot]').textContent, document.activeElement.getAttribute('data-enfee')]);
    assert.deepEqual(r, ['1,600円', '2,300円', 'indiv']);
    await p.evaluate(() => { const i = document.querySelector('#rbEnFee [data-enfee="copies"]'); i.value = '3'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }); await sl(200);
    assert.equal(await p.evaluate(() => document.querySelector('#rbEnFee [data-ftot]').textContent), '3,700円');
    await p.evaluate(() => { const i = document.querySelector('#rbEnFee [data-enfee="relay"]'); i.value = '-300'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }); await sl(200);
    assert.equal(await p.evaluate(() => document.querySelector('#rbEnFee [data-enfee="relay"]').value), '0', '負の数にしない');
    const sv = await p.evaluate(() => JSON.parse(localStorage.getItem('lanenote.entry.fees.v1'))); assert.deepEqual(sv['-'], { indiv: 800, relay: 0, comb: 2000, prog: 700, copies: 3 });
    await p.evaluate(() => document.querySelector('#rbEntry [data-en="fee"]').click()); await sl(200);
    assert.equal(await p.evaluate(() => document.querySelector('#rbEntry .en-set [data-enfee="indiv"]').value), '800', '⚙ 参加料と同じ値');
    await p.evaluate(() => document.querySelector('#rbEntry [data-en="fee"]').click()); await sl(150);
    if (SHOT) { const c = await p.evaluate(() => { const e = document.getElementById('rbEnFee'); e.scrollIntoView({ block: 'center' }); const a = e.getBoundingClientRect(); return { x: 0, y: a.top - 30 + scrollY, width: 390, height: a.height + 50 }; }); await sl(200); await p.screenshot({ path: path.join(SHOT, 'fix73_fee.png'), clip: c, captureBeyondViewport: true }); }
    await p.reload({ waitUntil: 'load' }); await p.waitForFunction(() => !document.getElementById('rbSignOut').hidden, { timeout: 15000 }); await sl(1500); await p.click('#rbEntryOpen'); await sl(400);
    assert.equal(await p.evaluate(() => document.querySelector('#rbEnFee [data-enfee="indiv"]').value), '800', '開き直しても残る');
  });
  await check('③ 調査の名簿：学年の順（同じ学年は元の順）にまとめ、学年ごとのボタン（1年 2/2）で全部入れる／外す。種類は公式戦がはじめ、記録会にするとリレーを聞かない（変えられる）', async () => {
    await p.evaluate(() => document.querySelector('#rbEntry [data-sv="toggle"]').click()); await sl(800);
    await p.evaluate(() => document.querySelector('#rbEntry [data-sv="new"]').click()); await sl(300);
    await p.evaluate(() => { const i = document.querySelector('#rbEntry [data-svf="meet"]'); i.value = '架空 記録会'; i.dispatchEvent(new Event('change', { bubbles: true })); });
    await p.evaluate(() => document.querySelector('#rbEntry [data-svsexes="m"]').click()); await sl(200);
    assert.deepEqual(await txt(p, '#rbEntry .en-grl'), ['1年', '2年', '3年']);
    assert.deepEqual((await txt(p, '#rbEntry [data-svath]')).map(x => x.replace(/\s*\d年$/, '')), ['架空 二郎', '架空 四郎', '架空 一郎', '架空 三郎', '架空 五郎']);
    assert.deepEqual(await txt(p, '#rbEntry [data-svgr]'), ['1年 2/2', '2年 1/1', '3年 2/2']);
    assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('#rbEntry [data-svgr]')).cursor), 'pointer');
    await p.evaluate(() => document.querySelector('#rbEntry [data-svgr="g3"]').click()); await sl(150);
    assert.deepEqual(await txt(p, '#rbEntry [data-svgr]'), ['1年 2/2', '2年 1/1', '3年 0/2']); assert.equal(await p.evaluate(() => [...document.querySelectorAll('#rbEntry [data-svath][aria-pressed="false"]')].length), 2);
    await p.evaluate(() => [...document.querySelectorAll('#rbEntry [data-svath]')].find(x => /架空 三郎/.test(x.textContent)).click()); await sl(150);
    assert.deepEqual(await txt(p, '#rbEntry [data-svgr]'), ['1年 2/2', '2年 1/1', '3年 1/2']);
    await p.evaluate(() => document.querySelector('#rbEntry [data-svgr="g3"]').click()); await sl(150); assert.deepEqual(await txt(p, '#rbEntry [data-svgr]'), ['1年 2/2', '2年 1/1', '3年 2/2']);
    assert.deepEqual(await p.evaluate(() => [document.querySelector('[data-svkind="official"]').getAttribute('aria-pressed'), document.querySelector('[data-svf="relayAsk"]').checked, !!document.querySelector('#rbEntry [data-svrel]')]), ['true', true, true]);
    await p.evaluate(() => document.querySelector('[data-svkind="kiroku"]').click()); await sl(200);
    assert.deepEqual(await p.evaluate(() => [document.querySelector('[data-svkind="kiroku"]').getAttribute('aria-pressed'), document.querySelector('[data-svf="relayAsk"]').checked, !!document.querySelector('#rbEntry [data-svrel]')]), ['true', false, false]);
    if (SHOT) { const c = await p.evaluate(() => { const e = document.querySelector('#rbEntry .sv-form'); e.scrollIntoView({ block: 'start' }); const a = e.getBoundingClientRect(); return { x: 0, y: a.top - 20 + scrollY, width: 390, height: Math.min(a.height + 30, 1500) }; }); await sl(200); await p.screenshot({ path: path.join(SHOT, 'fix73_survey_roster.png'), clip: c, captureBeyondViewport: true }); }
    await p.evaluate(() => document.querySelector('#rbEntry [data-sv="create"]').click()); await sl(1200);
    const link = await p.evaluate(() => document.getElementById('rbSvLink').value); SID = /\?q=([A-Za-z0-9]{24})$/.exec(link)[1];
    const pub = (await db(p))['surveys/' + SID]; assert.deepEqual([pub.kind, pub.relayAsk, pub.n], ['kiroku', false, 5]);
  });
  const { p: s } = await page(390, null);
  await check('選手（記録会）：名前→出場する／しない→「1種目目」「2種目目（なければ空のまま）」・リレーは聞かない', async () => {
    await s.goto(B + '?q=' + SID, { waitUntil: 'load' }); await s.waitForSelector('#svBody .sv-name', { timeout: 15000 }); await sl(300);
    await s.evaluate(() => [...document.querySelectorAll('.sv-name')].find(x => /架空 二郎/.test(x.innerText)).click()); await sl(150);
    assert.deepEqual(await txt(s, '#svBody .sv-card h3'), ['1名前', '2出場']); assert(!(await s.$('[data-sv="send"]')), '出場を選ぶまで送れない');
    await s.evaluate(() => document.querySelector('[data-svjoin="1"]').click()); await sl(150); await s.evaluate(() => document.querySelector('[data-svev1="男子100m"]').click()); await sl(150);
    assert.deepEqual(await txt(s, '#svBody .sv-card h3'), ['1名前', '2出場', '31種目目', '42種目目 （なければ空のまま）', 'ひとこと （なくてOK・100文字まで）']); assert(!(await s.$('[data-svrelay]')));
    if (SHOT) await s.screenshot({ path: path.join(SHOT, 'fix73_student_kirokukai_390.png'), fullPage: true });
    await s.evaluate(() => document.querySelector('[data-sv="send"]').click()); await sl(800);
    const a = Object.entries(await db(s)).filter(([x]) => x.startsWith('surveys/' + SID + '/answers/')).map(([, v]) => v)[0]; assert.deepEqual([a.join, a.ev1, a.relay], [true, '男子100m', '']);
  });
  await check('選手：出場しない → 希望の欄は消えて空・ひとことは「理由など」・送れる（join:false）', async () => {
    await s.evaluate(() => [...document.querySelectorAll('.sv-name')].find(x => /架空 四郎/.test(x.innerText)).click()); await sl(150);
    await s.evaluate(() => document.querySelector('[data-svjoin="1"]').click()); await sl(100); await s.evaluate(() => document.querySelector('[data-svev1="男子100m"]').click()); await sl(100);
    await s.evaluate(() => document.querySelector('[data-svjoin="0"]').click()); await sl(150);
    assert.deepEqual(await txt(s, '#svBody .sv-card h3'), ['1名前', '2出場', 'ひとこと （なくてOK・100文字まで）']); assert.equal(await s.evaluate(() => document.getElementById('svCm').placeholder), '理由など（なくてOK）');
    await s.evaluate(() => { const t = document.getElementById('svCm'); t.value = '家の用事'; t.dispatchEvent(new Event('input', { bubbles: true })); });
    if (SHOT) await s.screenshot({ path: path.join(SHOT, 'fix73_student_join_390.png'), fullPage: true });
    await s.evaluate(() => document.querySelector('[data-sv="send"]').click()); await sl(800);
    const all = await db(s);
    const a = Object.entries(all).filter(([x]) => x.startsWith('surveys/' + SID + '/answers/')).map(([, v]) => v).find(v => v.join === false); assert.deepEqual([a.ev1, a.ev2, a.relay, a.cm], ['', '', '', '家の用事']);
  });
  await check('顧問：答えの見出しは種類に合わせる（1種目目／2種目目）・「出場しない 1人」を名前つきで別に。下書きに入れても、出場しない人は種目にも参加料にも入らない', async () => {
    await p.evaluate(() => document.querySelector('#rbEntry [data-sv="reans"]').click()); await sl(800);
    assert.deepEqual((await txt(p, '#rbEntry .sv-ans th')).slice(0, 3), ['選手', '1種目目', '2種目目']);
    assert.equal(await p.evaluate(() => document.querySelector('#rbEntry .sv-ans tbody').querySelectorAll('tr').length), 1);
    assert.equal(await p.evaluate(() => document.querySelector('#rbEntry [data-svout]').textContent), '出場しない 1人：架空 四郎（家の用事）');
    const before = await p.evaluate(() => document.querySelector('#rbEnFee [data-ftot]').textContent);
    await p.evaluate(() => document.querySelector('#rbEntry [data-sv="apply"]').click()); await sl(500);
    assert(/出場しない 1人（架空 四郎）は入れていません/.test(await p.evaluate(() => document.querySelector('#rbEntry').innerText)));
    assert.equal(await p.evaluate(() => document.querySelector('#rbEntry [data-enout]').textContent), '出場しない 1人（調査の答え・下書きと参加料に入れていません）：架空 四郎');
    const t = await p.evaluate(() => document.querySelector('#rbEntry .en-t').textContent); assert(!/架空 四郎/.test(t), '下書きに入らない'); assert(/架空 二郎/.test(t));
    assert.notEqual(await p.evaluate(() => document.querySelector('#rbEnFee [data-ftot]').textContent), '', before);
    assert(!errs.length, errs.join(' / '));
  });
} finally { await b.close(); srv.close(); }
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
