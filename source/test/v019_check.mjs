// v0.19 エントリー照合（check.html）：架空のデータだけで確かめる（本物のエントリーファイル・スタートリストは使わない）
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url)), SRC = path.join(here, '../src'), OUT = path.join(here, '../..');
const src = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const E = require('../src/entry.js');
let pass = 0, fail = 0; const delay = (ms = 30) => new Promise(r => setTimeout(r, ms));
async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
const _ = '';
// 北区型を真似た架空のエントリー票（見出しが3行に分かれる・資格記録の分秒・リレー組分け・隠れた計算用の列・下に集計欄）
const HEAD = [
  ['★必要事項入力欄へ'], ['出場選手エントリー票'], ['第1回 架空市陸上競技大会'],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, '種目1', '資格記録', _, _, 'リレー', _, _, _, 36000],
  [_, '見本', '太郎', 'ﾐﾎﾝ', 'ﾀﾛｳ', 'MIHON', 'Taro', _, '生年月日', _, _, _, _, _, _, '分', '秒', _, _, _, _, 'リレー'],
  ['No.', '姓', '名', 'ﾌﾘｶﾞﾅ（姓）', 'ﾌﾘｶﾞﾅ（名）', '英語表記（姓）', '英語表記（名）', '学年', '年(西暦)', '月', '日', '性別', '所属', '登録都道府県', _, _, 'm', _, '分', '秒', _, '組分け']];
const row = (sei, mei, kana, gr, sex, ev, relay) => { const r = [_, sei, mei, kana, _, 'X', 'X', gr, 2013, 4, 1, sex, '架空中', '東京', ev, _, '14', '50', _, _, _, relay || _, 800, gr, sex + gr + ev]; return r; };
const BODY = [
  row('山田', '太郎', 'ﾔﾏﾀﾞ', '中1', '男', '中1_100', 'A'),
  row('高橋', '健', 'ﾀｶﾊｼ', '中1', '男', '中1_1500男'),
  row('渡邊', '一郎', 'ﾜﾀﾅﾍﾞ', '中2', '男', '中2_100', 'A'),          // スタートリストは「渡辺」→ 表記ゆれ
  row('ｺｰﾙ', '星', 'ｺｰﾙ', '中2', '男', '中共_3000男'),               // 半角カナ
  row('松﨑', '花', 'ﾏﾂｻﾞｷ', '中3', '女', '中3_100'),                // スタートリストは「松崎」
  row('佐藤', '次郎', 'ｻﾄｳ', '中3', '男', '中共_砲丸投', 'A'),
  row('鈴木', '三郎', 'ｽｽﾞｷ', '中2', '男', '中2_1500男'),            // スタートリストでは中学共通800mにいる → ⚠
  row('伊藤', '四郎', 'ｲﾄｳ', '中1', '男', '中1_100'),                // スタートリストに無い（別の所属にいる）→ ⚠
  row('中村', '五郎', 'ﾅｶﾑﾗ', '中3', '男', '＊リレー要員', 'A'),
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, '未エントリー', '0', '0'],
  [_, '架空中学校'], [_, '03-0000-0000', '総数', _, '金額'], [_, 45, 0, _, 0]];
const NOTE = [['【注意事項】'], ['出場選手エントリー票（見本）'], [], ['No.', '姓', '名', 'ﾌﾘｶﾞﾅ（姓）', 'ﾌﾘｶﾞﾅ（名）', '英語表記（姓）', '英語表記（名）', '学年', '年', '月', '日', '性別', '所属', _, '種目1'], [_, '東京', '太郎', 'ﾄｳｷｮｳ', 'ﾀﾛｳ', 'T', 'T', '中1', 2010, 10, 10, '男', '見本中', _, '中1_100'], [_, '東山', '京太郎', 'ﾋｶﾞｼﾔﾏ', 'ｷｮｳﾀﾛｳ', 'H', 'K', '中3', 2008, 5, 4, '男', '見本中', _, '中共_800']];
const LIST = [['競技種目', _, 'エントリー票種目選択名'], ['中学生 1年100m 男子 or 女子', '→', '中1_100', '男女選択'], ['中学生男子 共通　3000m', '→', '中共_3000男', '男子のみ']];
const BOOKS = [{ name: '注意事項', aoa: NOTE }, { name: '出場選手エントリー票', aoa: HEAD.concat(BODY) }, { name: 'リスト', aoa: LIST }];
const se = (event, name, grade, team, extra) => Object.assign({ event, round: 'タイムレース', heat: 1, posKind: 'レーン', pos: 3, bib: '100', name, grade, team }, extra || {});
const SL = { entries: [
  se('男子中学1年 100m', '山田 太郎', '中1', '架空中'), se('男子中学1年 1500m', '高橋 健', '中1', '架空中'), se('男子中学2年 100m', '渡辺 一郎', '中2', '架空中'),
  se('男子中学共通 3000m', 'コール 星', '中2', '架空中'), se('女子中学3年 100m', '松崎 花', '中3', '架空中'), se('男子中学共通 砲丸投(5.000kg)', '佐藤 次郎', '中3', '架空中'),
  se('男子中学共通 800m', '鈴木 三郎', '中2', '架空中'), se('男子中学1年 100m', '伊藤 四郎', '中1', '見本中'), se('男子中学3年 100m', '加藤 六郎', '中3', '架空中'),
  se('男子中学1年 100m', '他校 太郎', '中1', '他校中')],
  relays: [{ event: '男子中学共通 4×100m', round: 'タイムレース', heat: 2, posKind: 'レーン', pos: 4, team: '架空中A', members: [{ name: '山田 太郎', grade: '中1' }, { name: '渡辺 一郎', grade: '中2' }, { name: '佐藤 次郎', grade: '中3' }, { name: '中村 五郎', grade: '中3' }, { name: '小林 七郎', grade: '中2' }] },
    { event: '女子中学共通 4×100m', round: 'タイムレース', heat: 1, posKind: 'レーン', pos: 2, team: '架空中A', members: [{ name: '松崎 花', grade: '中3' }] }],
  events: [], warnings: [] };
const allTeams = ['架空中', '見本中', '他校中'];

console.log('[v0.19 エントリー照合]');
await check('種目の書き方をそろえる：中1_100 ↔ 男子中学1年 100m・中共_3000男・一般･高校_800・砲丸投(重さ)・やり投げ', () => {
  const same = (a, sx, b, g) => E.sameEvent(E.parseEvent(a, sx), E.parseEvent(b, ''), g);
  assert.ok(same('中1_100', '男', '男子中学1年 100m'));
  assert.ok(!same('中1_100', '女', '男子中学1年 100m'), '性別が違う');
  assert.ok(!same('中1_100', '男', '男子中学2年 100m'), '学年が違う');
  assert.ok(!same('中1_100', '男', '男子中学共通 100m'), '学年別と共通は別');
  assert.ok(same('中共_3000男', '男', '男子中学共通 3000m')); assert.ok(same('中共_200', '女', '女子中学共通 200m'));
  assert.ok(same('中共_砲丸投', '男', '男子中学共通 砲丸投(5.000kg)')); assert.ok(same('一般･高校_800', '男', '男子一般 800m')); assert.ok(same('一般･高校_800', '男', '男子高校 800m'));
  assert.ok(same('一般･高校_やり投げ', '女', '女子一般 やり投(0.600kg)')); assert.ok(same('高_100', '男', '男子高校 100m')); assert.ok(!same('高_100', '男', '男子一般 100m'));
  assert.ok(same('男子100m', '', '男子中学共通 100m', '中2')); assert.ok(same('女子１００ｍＨ', '', '女子中学共通 100mH')); assert.ok(same('中1_1500男', '男', '男子中学1年 1500m'));
  assert.equal(E.parseEvent('＊リレー要員', '男').reserve, true); assert.equal(E.parseEvent('未エントリー', '男'), null);
  assert.equal(E.evLabel(E.parseEvent('中1_100', '男')), '男子中学1年 100m');
});
await check('名前の表記ゆれ：空白・全角/半角・ひらがな/カタカナ・澤/沢・邊/邉/辺・髙/高・﨑/崎', () => {
  const L = E.looseName;
  assert.equal(E.strictName('山田　太郎'), E.strictName('山田 太郎')); assert.equal(E.strictName('ｺｰﾙ 星'), E.strictName('コール星'));
  assert.equal(L('吉澤 一'), L('吉沢一')); assert.equal(L('渡邊'), L('渡辺')); assert.equal(L('渡邉'), L('渡辺')); assert.equal(L('髙橋'), L('高橋')); assert.equal(L('松﨑'), L('松崎')); assert.equal(L('さくら'), L('サクラ'));
  assert.notEqual(E.strictName('渡邊'), E.strictName('渡辺'));
});
await check('見出しの行と列を自動で探す（3行に分かれた見出し・英語表記は使わない・リレーは組分けの列）・注意事項の見本は使わない', () => {
  const pk = E.pickSheet(BOOKS, E.codeMap(LIST));
  assert.equal(pk.name, '出場選手エントリー票'); const C = pk.det.cols;
  assert.equal(pk.det.header, 5); assert.equal(C.sei, 1); assert.equal(C.mei, 2); assert.deepEqual(C.kana, [3, 4]); assert.equal(C.grade, 7); assert.equal(C.sex, 11); assert.equal(C.team, 12);
  assert.deepEqual(C.event, [14], '種目1だけ（計算用の列は使わない）'); assert.equal(C.relay, 21, 'A・Bが入る組分けの列');
  const ent = E.readEntries(pk.aoa, pk.det, E.codeMap(LIST));
  assert.equal(ent.athletes.length, 9, '未エントリー・集計欄は読まない'); assert.deepEqual(ent.warns, []);
  assert.equal(ent.athletes[0].name, '山田 太郎'); assert.equal(ent.athletes[0].relay, 'A'); assert.equal(ent.athletes[8].reserve, true);
  assert.equal(E.codeMap(LIST)['中1_100'], '中学生 1年100m 男子 or 女子');
});
await check('別の形（氏名1列・種目1/2/3・「男子100m」の書き方・CSV風）も読める', () => {
  const aoa = [['架空記録会 申込'], ['番号', '氏名', 'フリガナ', '学年', '性別', '学校名', '種目1', '種目2', '種目3', '4×100mR'], ['1', '田中 一', 'タナカ ハジメ', '2', '男', '架空中', '男子100m', '男子走幅跳', '', '○'], ['2', '田中 二', '', '3', '女', '架空中', '女子200m', '', '', '']];
  const d = E.detect(aoa); assert.equal(d.header, 1); assert.equal(d.cols.name, 1); assert.deepEqual(d.cols.event, [6, 7, 8]); assert.equal(d.cols.team, 5);
  const ent = E.readEntries(aoa, d, {}); assert.equal(ent.athletes.length, 2); assert.equal(ent.athletes[0].events.length, 2); assert.equal(ent.athletes[0].events[1].disc, '走幅跳');
});
await check('照合：✅/⚠️/❓・表記ゆれ・別の種目／別の所属のヒント・問題が先・リレーは別', () => {
  const pk = E.pickSheet(BOOKS, E.codeMap(LIST)), ent = E.readEntries(pk.aoa, pk.det, E.codeMap(LIST));
  const teams = E.pickTeams(ent, allTeams); assert.deepEqual(teams, ['架空中']);
  const r = E.compare(ent, SL, teams);
  assert.deepEqual(r.count, { ok: 6, miss: 2, extra: 2, yure: 2 });
  assert.deepEqual(r.rows.map(x => x.st).slice(0, 4), ['miss', 'miss', 'extra', 'extra'], '問題が先');
  const by = n => r.rows.filter(x => (x.a && x.a.name === n) || (x.sl && x.sl.name === n));
  assert.equal(by('渡邊 一郎')[0].yure, true); assert.equal(by('松﨑 花')[0].yure, true); assert.equal(by('コール 星')[0].st, 'ok'); assert.equal(by('コール 星')[0].yure, false, '半角/全角だけは同じ名前');
  const suz = by('鈴木 三郎'); assert.equal(suz.find(x => x.st === 'miss').ev.disc, '1500m'); assert.match(suz.find(x => x.st === 'miss').note, /男子中学共通 800m/); assert.match(suz.find(x => x.st === 'extra').note, /エントリーでは「男子中学2年 1500m」/);
  assert.match(by('伊藤 四郎')[0].note, /別の所属「見本中/); assert.match(by('加藤 六郎')[0].note, /エントリーファイルにこの名前がありません/);
  assert.ok(!r.rows.some(x => x.sl && x.sl.team === '他校中'), '選んでいない学校は出さない');
  assert.equal(r.reserves.length, 1);
  const A = r.relays.find(x => x.label === '架空中A' && x.sex === '男'); assert.equal(A.st, 'ok');
  const st = Object.fromEntries(A.members.map(m => [m.name, m.st])); assert.equal(st['山田 太郎'], 'ok'); assert.equal(st['渡邊 一郎'], 'ok'); assert.equal(st['中村 五郎'], 'ok'); assert.equal(st['小林 七郎'], 'extra');
  assert.ok(r.relays.some(x => x.st === 'extra' && x.sex === '女'), 'エントリーに無い女子リレーは❓');
});
await check('ビルド結果：check.html・3ページのナビに「✅ 照合」・はじめての人に説明・sw.js が保存・版 v0.19', () => {
  const C = fs.readFileSync(path.join(OUT, 'check.html'), 'utf8'), I = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8'), RC = fs.readFileSync(path.join(OUT, 'records.html'), 'utf8'), G = fs.readFileSync(path.join(OUT, 'guide.html'), 'utf8'), SW = fs.readFileSync(path.join(OUT, 'sw.js'), 'utf8');
  for (const P of [I, RC, C]) assert.match(P, /<nav class="pagenav"[^>]*>.*🏁 大会準備.*📒 記録<\/a><a href="check.html"[^>]*>✅ 照合<\/a><\/nav>/);
  assert.match(C, /<a href="check.html" class="on" aria-current="page">✅ 照合/); assert.match(C, /<p class="tagline">エントリー照合：/); assert.match(C, /class="topbar"><details class="changelog"/); assert.match(C, /どこにも送らず/);
  assert.ok(!/__[A-Z_]+__/.test(C.replace(/__check|__fitScale/g, '')), 'プレースホルダが残っていない');
  assert.match(G, /id="g10"/); assert.match(G, /表記ゆれで一致/); assert.match(G, /check\.html/);
  assert.match(SW, /\.\/check\.html/); assert.match(SW, /getPage\(CHECK\)/); assert.match(SW, /lanenote-page-v0\.(19|[2-9]\d)(\.\d+)?-/);
  assert.match(I, /v0\.(19|[2-9]\d)/);
});
// 画面（jsdom・実際のソース）
const tpl = src('check_template.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/__[A-Z_]+__/g, '');
const d = new JSDOM(tpl, { url: 'http://127.0.0.1:9090/check.html', runScripts: 'outside-only' }); const w = d.window;
let printed = 0; w.print = () => { printed++; }; w.scrollTo = () => {};
w.eval(src('parser.js')); w.eval(src('logic.js')); w.eval(src('entry.js')); w.eval(src('check_app.js'));
const $ = id => w.document.getElementById(id);
await check('画面：エントリー→スタートリストで学校が自動で選ばれ、件数・問題が先・リレー・表記ゆれの印', async () => {
  w.__check.setBooks(BOOKS, 'kakuu_entry.xlsx'); await delay();
  assert.match($('ckEntStatus').textContent, /シート「出場選手エントリー票」 9人・個人種目 8件・リレー 4人/);
  assert.ok($('ckResult').hidden, 'スタートリストがまだ');
  w.__check.setSl(SL, 'kakuu_startlist.pdf', 3); await delay();
  assert.equal($('ckSchool').value, '架空中'); assert.ok(!$('ckResult').hidden);
  const sum = $('ckSum').textContent; assert.match(sum, /✅ 6/); assert.match(sum, /⚠️ 2/); assert.match(sum, /❓ 2/); assert.match(sum, /≒ 2/); assert.match(sum, /確かめてほしいところが 5件/);
  const rows = Array.from(w.document.querySelectorAll('#ckList .ck-row')); assert.ok(rows[0].classList.contains('ck-miss')); assert.match(rows[0].textContent, /エントリーしたのにスタートリストにない/);
  assert.equal(w.document.querySelectorAll('.ck-okd .ck-row').length, 6); assert.equal(w.document.querySelector('.ck-okd').open, false);
  assert.ok(w.document.querySelectorAll('#ckList .ck-yure').length >= 2); assert.match($('ckRelay').textContent, /架空中A/); assert.match($('ckRelay').textContent, /リレー要員としてエントリー：中村 五郎/);
});
await check('列の割り当て：種目の列を外すと読み直す', async () => {
  assert.ok(!$('ckMap').hidden); const sel = $('ckMapBody').querySelector('select[data-role="event"][data-i="0"]'); sel.value = ''; sel.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
  assert.match($('ckEntStatus').textContent, /個人種目 0件/);
  const s2 = $('ckMapBody').querySelector('select[data-role="event"][data-i="0"]'); s2.value = '14'; s2.dispatchEvent(new w.Event('change', { bubbles: true })); await delay();
  assert.match($('ckEntStatus').textContent, /個人種目 8件/);
});
await check('画面で見る・PDF作成・印刷：1枚の表（要約・全員・リレー）', async () => {
  w.document.querySelector('[data-ckprint="view"]').click(); await delay();
  assert.ok(!$('ckPrint').hidden); const b = $('ckPrintBody').innerHTML; assert.match(b, /ENTRY CHECK/); assert.match(b, /kakuu_startlist/); assert.match(b, /<table class="cp-t">/); assert.match(b, /渡邊 一郎/); assert.match(b, /リレー（/); assert.equal(printed, 0);
  $('ckPrintClose').click(); assert.ok($('ckPrint').hidden);
  w.document.querySelector('[data-ckprint="print"]').click(); await delay(); assert.equal(printed, 1);
  // v0.23：PDF作成は印刷ダイアログなしでPDFファイルを直接作る
  const made = []; w.LanePdf = { make: async o => { made.push(o); return { pages: 1 }; }, pageDoc: (h, c) => '<html><body class="' + (c || '') + '">' + h + '</body></html>' };
  w.document.querySelector('[data-ckprint="pdf"]').click(); await delay(100); assert.equal(printed, 1); assert.equal(made.length, 1);
  assert.match(made[0].filename, /_エントリー照合\.pdf$/); assert.match(made[0].html, /ENTRY CHECK/); delete w.LanePdf;
});
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);
