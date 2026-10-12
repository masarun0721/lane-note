// v0.25.1：ボタンの説明に入れる小さな画面の絵（source/img/*.webp）と、ガイドのスクショ（引数のフォルダ）を撮る。
// データは入れない（空の画面＝架空のデータすらない状態）。外のネットワークには出ない。
// 使い方：node v0251_shots.mjs [/workspace/lane_note_shots]   → そのあと python3 build.py --out .. で埋めこむ
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'), OUT = process.argv[2] || '';
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p)) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript' }); let d = fs.readFileSync(p); if (/records\.html$/.test(p) && /[?&]demo=1/.test(q.url)) d = Buffer.from(String(d).replace('if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }', 'window.__t={putMany,scope,reload,setTab:v=>{setTab(v);render();}};renderAuth();').replace('  msOpenFromQuery();', '')); s.end(d); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function open(pg, mode, vp) {
  const p = await b.newPage(); await p.setRequestInterception(true); p.on('request', r => r.url().startsWith(B) ? r.continue() : r.abort());
  await p.setViewport(vp); await p.goto(B + pg); await p.evaluate(m => { localStorage.clear(); localStorage.setItem('lanenote.mode.v1', m); }, mode);
  await p.goto(B + pg, { waitUntil: 'domcontentloaded' }); await sleep(500);
  await p.addStyleTag({ content: '.status.ng,#rbAuthMsg .ng,p.ng{display:none!important}' }).catch(() => {});   // 外につながないので出る「部品を読み込めません」は絵に入れない
  return p;
}
const PH = { width: 390, height: 760, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
for (const [name, pg, mode] of [['btn_meet', 'index.html', 'coach'], ['btn_records', 'records.html', 'coach'], ['btn_check', 'check.html', 'coach'], ['btn_player', 'index.html', 'player']]) {
  const p = await open(pg, mode, PH);
  const y = await p.evaluate(() => { const m = document.querySelector('main'); return Math.max(0, m.getBoundingClientRect().top + scrollY - 8); });
  await p.screenshot({ path: path.join(ROOT, 'source/img', name + '.webp'), type: 'webp', quality: 45, clip: { x: 0, y, width: 390, height: 640 } });
  await p.close(); console.log('  img', name);
}
// 「こんなときに使えます」の絵（すべて架空のデータ）
const NAMES = ['架空 一郎', '見本 二郎', '試験 三郎', '仮名 四郎', '例示 花子', '模擬 葉子'];
async function meetPage() {
  const p = await open('index.html', 'coach', PH);
  await p.evaluate(N => {
    const A = window.__meetApp, entries = [], ev = [['男子中学共通 100m', '予選', '9:30'], ['男子中学共通 走幅跳', '決勝', '10:00'], ['女子中学共通 200m', '予選', '11:00'], ['女子中学共通 800m', 'タイムレース', '13:00']];
    N.forEach((n, i) => { const e = ev[i % 4]; entries.push({ team: '架空第一中', event: e[0], round: e[1], heat: 1 + i % 2, pos: 3 + i, posKind: 'レーン', bib: String(101 + i), name: n, grade: String(1 + i % 3), page: 1 }); });
    const tt = ev.map(e => { const m = /^(男子|女子)中学共通 (.+)$/.exec(e[0]); return { event: m[2], gender: m[1], cat: '中学共通', round: e[1], time: e[2] }; });
    document.getElementById('school').value = '架空第一'; Object.assign(A.state, { sl: { format: 'startlist', hasTimes: false, warnings: [], diag: [], entries, relays: [] }, tt, teams: ['架空第一中'], slName: 'sl.pdf', ttName: 'tt.pdf' });
    const mn = document.getElementById('meetName'); if (mn) mn.value = '架空区 中学校陸上競技大会'; A.updateTeams(); A.render();
  }, NAMES); await sleep(500); return p;
}
async function shotEl(p, sel, name) { await p.evaluate(s => { const e = document.querySelector(s); if (e) e.scrollIntoView(); window.scrollBy(0, -8); }, sel); await sleep(300); await p.screenshot({ path: path.join(ROOT, 'source/img', name + '.webp'), type: 'webp', quality: 45 }); console.log('  img', name); }
{ const p = await meetPage(); await p.evaluate(() => document.getElementById('btnPrintView').click()); await sleep(900); await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: path.join(ROOT, 'source/img', 'use_meet.webp'), type: 'webp', quality: 45 }); console.log('  img use_meet'); await p.close(); }
{ const p = await meetPage(); await p.click('#btnParent').catch(() => {}); await sleep(900); await p.screenshot({ path: path.join(ROOT, 'source/img', 'use_parent.webp'), type: 'webp', quality: 45 }); console.log('  img use_parent'); await p.close(); }
{ const p = await open('records.html?demo=1', 'coach', PH);
  const ok = await p.evaluate(async N => { if (!window.__t) return false; const R = window.ResultParser, recs = [], add = o => { const r = Object.assign({ team: '架空第一中', date: '2026-10-11', meet: '架空区 中学校陸上競技大会', wind: '' }, o); r.id = R.recId(r.meet, r.date, r); recs.push(r); };
    N.forEach((n, i) => { add({ name: n, event: '中学共通男子100m', mark: (12.4 + i / 10).toFixed(2), wind: '+0.5', grade: String(1 + i % 3), rank: String(i + 1) }); add({ name: n, event: '中学共通男子100m', mark: (12.6 + i / 10).toFixed(2), wind: '+0.3', grade: String(1 + i % 3), rank: String(i + 1), date: '2026-09-20', meet: '架空 記録会' }); });
    document.getElementById('rbSchool').value = '架空第一中'; await window.__t.putMany(recs, window.__t.scope()); await window.__t.reload(window.__t.scope()); window.__t.setTab('rank'); return true; }, NAMES);
  if (ok) { await sleep(400); await shotEl(p, '#rbView', 'use_records'); await p.evaluate(() => document.getElementById('rbPPOpen').click()); await sleep(500); await p.screenshot({ path: path.join(ROOT, 'source/img', 'use_pp.webp'), type: 'webp', quality: 45 }); console.log('  img use_pp'); }
  await p.close(); }
if (OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [w, vp] of [['pc', { width: 1280, height: 900 }], ['phone', { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
    let p = await open('guide.html', 'coach', vp); await p.screenshot({ path: path.join(OUT, `v0251_guide_top_${w}.png`) }); await p.close();
    p = await open('guide.html#manual', 'coach', vp); await p.screenshot({ path: path.join(OUT, `v0251_guide_buttons_${w}.png`) });
    await p.evaluate(() => document.getElementById('b2').scrollIntoView()); await sleep(200); await p.screenshot({ path: path.join(OUT, `v0251_guide_buttons_records_${w}.png`) }); await p.close();
    p = await open('records.html', 'coach', vp); await p.screenshot({ path: path.join(OUT, `v0251_records_top_${w}.png`) }); await p.close();
  }
  console.log('  shots →', OUT);
}
await b.close(); srv.close();
