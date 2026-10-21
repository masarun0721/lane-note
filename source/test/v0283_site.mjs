// v0.28.3 公開アドレスを https://lane-note.web.app/ に（リンクはこのアドレスで作る・旧アドレスでは案内だけ出す・Hosting は hosting だけ出す）
//   node v0283_site.mjs [スクショの保存先フォルダ]
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom'; import puppeteer from 'puppeteer-core';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), SHOT = process.argv[2] || '';
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.28.3] 公開アドレス lane-note.web.app');
const SITE = 'https://lane-note.web.app/', rd = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const modeAt = url => { const w = new JSDOM('<!doctype html><head></head><body><p id="x">本文</p></body>', { url, runScripts: 'outside-only' }).window; w.eval(rd('source/src/mode.js')); if (w.document.readyState === 'loading') w.document.dispatchEvent(new w.Event('DOMContentLoaded')); return w; };
await check('リンクのもと：公開版（新・旧）とファイルで開いたときは必ず lane-note.web.app。手元の試験用サーバーは開いているアドレス', () => {
  for (const u of ['https://masarun0721.github.io/lane-note/records.html', 'https://lane-note.web.app/team.html#join=x', 'https://lane-note.firebaseapp.com/']) assert.equal(modeAt(u).eval('laneLinkBase()'), SITE, u);
  assert.equal(modeAt('http://127.0.0.1:8080/sub/records.html').eval('laneLinkBase()'), 'http://127.0.0.1:8080/sub/');
  assert.equal(modeAt('file:///home/x/LANE_NOTE.html').eval('laneLinkBase()'), SITE);
});
await check('アドレスはひとつの定数：mode.js の LANE_SITE = build.py の SHARE_BASE。調査・招待・共有・やり取り・記録のページのリンクはそれを使う', () => {
  assert(rd('source/build.py').includes("SHARE_BASE = '" + SITE + "'")); assert(rd('source/src/mode.js').includes("var LANE_SITE = '" + SITE + "'"));
  for (const [f, fn] of [['survey.js', 'function base()'], ['talk.js', 'function base()'], ['records_app.js', 'function inviteUrl'], ['records_app.js', 'function siteBase'], ['app.js', 'function shareBase']]) { const s = rd('source/src/' + f); const i = s.indexOf(fn); assert(i > 0 && /laneLinkBase\(\)/.test(s.slice(i, i + 200)), f + ' ' + fn); }
  assert(rd('intro.html').includes("q.addData('" + SITE + "')"), 'はじめかたの QR');
});
await check('見える文字に masarun が残っていない（旧アドレスを見分ける所・古いリンクを開く所・Worker の許可リストだけ）', () => {
  for (const f of ['index.html', 'records.html', 'team.html', 'schedule.html', 'check.html', 'guide.html', 'try.html', 'admin.html', 'intro.html', 'sw.js']) {
    const bad = rd(f).split('\n').filter(l => /masarun/.test(l) && !/LANE_OLD_HOST = |OLD = \/\^https|OLD = 'masarun0721\.github\.io'/.test(l)); assert.deepEqual(bad, [], f);
  }
  assert(rd('admin.html').includes('公開版のページ https://lane-note.web.app/ から開いてください'));
  assert.equal((rd('source/src/urlload.js').match(/workers\.dev/g) || []).length, 1, 'Worker のアドレスは1か所');
});
await check('古い masarun のリンクを貼っても開ける（いま開いているアドレスに読みかえる）', () => {
  const s = rd('source/src/mode.js'); assert(/OLD = \/\^https:\\\/\\\/\(masarun0721\\\.github\\\.io\\\/lane-note\|lane-note\\\.web\\\.app\|lane-note\\\.firebaseapp\\\.com\)\\\//.test(s));
  assert(s.includes("location.href = u.indexOf(here) === 0 ? u : here + u.replace(OLD, '');"));
});
await check('旧アドレスの案内は v0.28.4 から move.js（全画面のお知らせ・v0284_move で確かめる）。mode.js には残さない', () => {
  assert(!/LaneMove|laneMove/.test(rd('source/src/mode.js'))); assert(/var LaneMove = /.test(rd('source/src/move.js')));
});
await check('Firebase Hosting：firebase.json に hosting（_site）を足し firestore の設定はそのまま。Actions は hosting だけを出す（ルール・インデックス・Worker は出さない）。Pages は固定のコピー（v0.28.4）', () => {
  const j = JSON.parse(rd('firebase.json')); assert.deepEqual(j.firestore, { rules: 'firestore.rules', indexes: 'firestore.indexes.json' }); assert.equal(j.hosting.public, '_site'); assert(j.emulators.firestore);
  const y = rd('.github/workflows/pages.yml'); const dep = y.split('\n').filter(l => /firebase-tools.*deploy|wrangler/.test(l));
  assert.equal(dep.length, 1); assert(/deploy --only hosting --project lane-note/.test(dep[0])); assert(!/firestore|rules|indexes/.test(dep[0]));
  assert(/actions\/deploy-pages@v4/.test(y) && /hosting:\n    needs: \[rules, test\]/.test(y) && /secrets\.FIREBASE_SERVICE_ACCOUNT_LANE_NOTE/.test(y));
});
if (SHOT) await check('スクショ：旧アドレスで開いたとき（390）', async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const p = await b.newPage(); await p.setViewport({ width: 390, height: 640, isMobile: true, hasTouch: true }); await p.setRequestInterception(true);
    p.on('request', r => { const m = r.url().match(/^https:\/\/masarun0721\.github\.io\/lane-note\/([^?#]*)/); if (!m) return /^(data|blob):/.test(r.url()) ? r.continue() : r.abort(); const f = path.join(ROOT, m[1] || 'index.html'); if (!fs.existsSync(f)) return r.respond({ status: 404, body: '' }); r.respond({ status: 200, contentType: f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript', body: fs.readFileSync(f) }); });
    await p.evaluateOnNewDocument(() => localStorage.setItem('lanenote.mode.v1', 'coach'));
    await p.goto('https://masarun0721.github.io/lane-note/records.html', { waitUntil: 'load' }); await new Promise(r => setTimeout(r, 1200));
    await p.click('#laneMoveQ'); assert(await p.$eval('#laneMove', e => getComputedStyle(e.querySelector('.lm-go')).cursor === 'pointer'));
    await p.screenshot({ path: path.join(SHOT, 'fix74_move_390.png') });
  } finally { await b.close(); }
});
console.log('\n' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);
