import puppeteer from 'puppeteer-core'; import fs from 'fs'; import http from 'http'; import path from 'path';
const ROOT = '/workspace/lane_note_repo';
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); r.end(d); }); }).listen(9123);
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--font-render-hinting=none'] });
const p = await b.newPage(); await p.setBypassServiceWorker(true); await p.setViewport({ width: 1280, height: 900 });
const cdp = await p.target().createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: '/tmp/nt/out' }).catch(() => {});
await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: '/tmp/nt/out' }).catch(() => {});
await p.goto('http://127.0.0.1:9123/index.html', { waitUntil: 'networkidle0' });
await p.evaluate(() => {
  const A = window.__meetApp, sn = ['山田 太郎', '青木 健', '鈴木 大翔', '高橋 蓮', '田中 湊', '伊藤 陽翔', '渡辺 樹', '中村 悠真', '小林 朝陽'], gn = ['佐藤 花子', '井上 舞', '加藤 陽葵', '吉田 凛', '山本 結菜', '松本 芽依', '木村 結衣', '林 さくら'];
  const ev = { m: [['男子中学1年 100m', '予選'], ['男子中学共通 200m', '予選'], ['男子中学共通 走幅跳', '決勝'], ['男子中学共通 1500m', 'タイムレース'], ['男子中学共通 砲丸投', '決勝']], f: [['女子中学2年 100m', '予選'], ['女子中学共通 200m', '予選'], ['女子中学共通 走高跳', '決勝'], ['女子中学共通 800m', 'タイムレース']] };
  const entries = []; let bib = 100;
  sn.forEach((n, i) => { bib++; [ev.m[i % 5], ev.m[(i + 2) % 5]].forEach((e, k) => entries.push({ team: '本郷中', event: e[0], round: e[1], heat: 1 + (i % 3), pos: 2 + i % 6, posKind: 'レーン', bib: String(bib), name: n, grade: String(1 + i % 3), page: 1 })); });
  gn.forEach((n, i) => { bib++; [ev.f[i % 4], ev.f[(i + 1) % 4]].forEach(e => entries.push({ team: '本郷中', event: e[0], round: e[1], heat: 1 + (i % 3), pos: 3 + i % 5, posKind: 'レーン', bib: String(bib), name: n, grade: String(1 + i % 3), page: 1 })); });
  const relays = [{ team: '本郷中A', event: '男子中学共通 4×100mR', round: '決勝', heat: 1, pos: 4, page: 3, members: sn.slice(0, 4).map(n => ({ name: n })) }, { team: '本郷中B', event: '男子中学共通 4×100mR', round: '決勝', heat: 2, pos: 5, page: 3, members: sn.slice(4, 8).map(n => ({ name: n })) }, { team: '本郷中A', event: '女子中学共通 4×100mR', round: '決勝', heat: 1, pos: 3, page: 3, members: gn.slice(0, 4).map(n => ({ name: n })) }];
  const tt = [['100m', '男子', '中学1年', '予選', '9:30'], ['100m', '男子', '中学1年', '決勝', '13:40'], ['100m', '女子', '中学2年', '予選', '9:50'], ['200m', '男子', '中学共通', '予選', '11:00'], ['200m', '女子', '中学共通', '予選', '11:30'], ['走幅跳', '男子', '中学共通', '決勝', '10:00'], ['走高跳', '女子', '中学共通', '決勝', '10:30'], ['1500m', '男子', '中学共通', 'タイムレース', '12:30'], ['800m', '女子', '中学共通', 'タイムレース', '13:00'], ['砲丸投', '男子', '中学共通', '決勝', '13:00'], ['4×100mR', '男子', '中学共通', '決勝', '14:30'], ['4×100mR', '女子', '中学共通', '決勝', '14:50']].map(a => ({ event: a[0], gender: a[1], cat: a[2], round: a[3], time: a[4] }));
  Object.assign(A.state, { sl: { format: 'startlist', hasTimes: false, warnings: [], diag: [], entries, relays }, tt, teams: ['本郷中'], slName: 'sl.pdf', ttName: 'tt.pdf', docText: { yoko: '会場：味の素フィールド西が丘\n最寄駅：本蓮沼駅 徒歩10分\n開門 8:00 競技開始 9:30' } });
  document.getElementById('meetName').value = '第77回 北区中学校陸上競技大会'; document.getElementById('meetDate').value = '2026年10月18日';
  A.render();
});
await new Promise(r => setTimeout(r, 500));
await p.click('#btnParent'); await new Promise(r => setTimeout(r, 800));
await p.evaluate(() => { const e = document.querySelector('#ntEdit [data-t="school"]'); e.value = '北区立本郷中学校'; e.dispatchEvent(new Event('input', { bubbles: true })); const a = document.querySelector('[data-list="advisors"] [data-la="add"]'); a.click(); });
await p.evaluate(() => { const e = document.querySelector('[data-list="advisors"] [data-li="0"]'); e.value = '阪田 雅志'; e.dispatchEvent(new Event('input', { bubbles: true })); });
await new Promise(r => setTimeout(r, 800));
const res = {};
for (const L of ['std', 'table', 'clean']) {
  await p.evaluate(L => { document.getElementById('ntSchool').open = true; const b = document.querySelector(`[data-layout="${L}"]`); b.click(); document.querySelector('.nt-lay').scrollIntoView(); }, L); await new Promise(r => setTimeout(r, 1200));
  const info = await p.evaluate(() => { const f = document.getElementById('pvFrame'); return { size: document.getElementById('ntSize').textContent, warn: document.getElementById('ntWarn').textContent, html: '<!doctype html>' + f.contentDocument.documentElement.outerHTML }; });
  await p.screenshot({ path: `/tmp/nt/out/ui_${L}.png` });
  const q = await b.newPage(); await q.setContent(info.html, { waitUntil: 'load' });
  await q.emulateMediaType('print'); await q.setViewport({ width: 794, height: 1123 });
  const pdf = await q.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true }); fs.writeFileSync(`/tmp/nt/out/${L}.pdf`, pdf);
  await q.close();
  // DOCX
  await p.evaluate(() => { window.__bl = null; URL.createObjectURL = b => { window.__bl = b; return 'blob:x'; }; HTMLAnchorElement.prototype.click = function () {}; });
  await p.click('#pvDocx'); await new Promise(r => setTimeout(r, 800));
  const b64 = await p.evaluate(async () => { const u = new Uint8Array(await window.__bl.arrayBuffer()); let s = ''; for (const c of u) s += String.fromCharCode(c); return btoa(s); });
  fs.writeFileSync(`/tmp/nt/out/${L}.docx`, Buffer.from(b64, 'base64')); const dx = true;
  res[L] = { size: info.size, warn: info.warn, docx: !!dx };
}
await p.evaluate(() => { const m = document.querySelector('[data-t="mono"]'); m.checked = true; m.dispatchEvent(new Event('change', { bubbles: true })); }); await new Promise(r => setTimeout(r, 1200));
{ const html = await p.evaluate(() => '<!doctype html>' + document.getElementById('pvFrame').contentDocument.documentElement.outerHTML); const q = await b.newPage(); await q.setContent(html, { waitUntil: 'load' }); fs.writeFileSync('/tmp/nt/out/mono.pdf', await q.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true })); await q.close(); }
await p.evaluate(() => { const m = document.querySelector('[data-t="mono"]'); m.checked = false; m.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('[data-accent="red"]').click(); }); await new Promise(r => setTimeout(r, 1200));
await p.evaluate(() => { document.getElementById('ntSchool').open = true; document.querySelector('.nt-acc').scrollIntoView({ block: 'center' }); }); await p.screenshot({ path: '/tmp/nt/out/editor.png' });
// phone
await p.setViewport({ width: 390, height: 844 }); await new Promise(r => setTimeout(r, 600)); await p.evaluate(() => { document.getElementById('ntEdit').scrollTop = 0; }); await p.screenshot({ path: '/tmp/nt/out/phone.png' }); await p.evaluate(() => document.querySelector('.nt-prev').scrollIntoView()); await new Promise(r => setTimeout(r, 400)); await p.screenshot({ path: '/tmp/nt/out/phone2.png' });
console.log(JSON.stringify(res)); await b.close(); srv.close();
