// v0.26.23 記録の横の「NGR」「GR」「PB」「大会新」などと、私学の学校名の書き方（架空データのみ）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
import {loadPages} from './load.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), FX = path.join(here, 'fixtures');
const R = createRequire(import.meta.url)('../src/results.js');
let ok = 0; const check = (n, f) => { f(); ok++; console.log('  ✔ ' + n); };
console.log('[v0.26.23] 記録の印と私学の学校名');
const rows = r => r.recs.map(x => [x.name, x.team, x.mark, x.comment]);
const T = await loadPages(path.join(FX, 'mark_tagged.pdf')), P = await loadPages(path.join(FX, 'mark_plain.pdf'));
check('PDF：「10.85NGR」「PB 11.20」、コメント欄の「GR」があっても記録を読み、印は備考に残す', () => {
  const r = R.parsePdf(T, {}); assert.equal(r.warns.length, 0);
  assert.deepEqual(rows(r), [['架空 一郎', '架空学園高', '10.85', 'NGR'], ['見本 二郎', '見本高', '10.99', 'GR'], ['試験 三太', '架空学園高', '11.20', 'PB'], ['例示 四郎', '例示高', '11.31', '']]);
  assert.deepEqual(rows(R.parsePdf(P, {})).map(x => x[2]), ['10.85', '10.99', '11.20', '11.31']);
});
check('記録の文字：前後・くっつき・別の語・風つき・「=GR」「大会新」「*」', () => {
  const c = s => { const m = R.cleanMark(s); return [m.mark, m.wind, m.tags.join(',')]; };
  assert.deepEqual(c('10.85NGR'), ['10.85', null, 'NGR']); assert.deepEqual(c('NR 10.85'), ['10.85', null, 'NR']);
  assert.deepEqual(c('10.85 SB +1.2'), ['10.85', '+1.2', 'SB']); assert.deepEqual(c('11.20(+0.5)PB'), ['11.20', '+0.5', 'PB']);
  assert.deepEqual(c('4:12.34大会新'), ['4:12.34', null, '大会新']); assert.deepEqual(c('10.85=GR'), ['10.85', null, '=GR']); assert.deepEqual(c('*10.85'), ['10.85', null, '']);
  assert.deepEqual(c('12.10'), ['12.10', null, '']);
});
const page = rs => '<html><head><title>架空私学大会</title></head><body>男子 100m<br>決勝 1組<br>風:+0.7<br>' +
  rs.map(([rk, no, mk, nm, tm, ex]) => '<font color="#000080">' + rk + '位　(' + no + ')' + (ex || '') + '<br>　' + mk + '<br>' + nm + '<br>' + tm + '<br></font>').join('') + '</body></html>';
check('gold.jaic.org（個人）：記録の行に「NGR」、別の行の「大会新」、順位の行の「GR」でも名前・所属がずれない', () => {
  let h = page([[1, 5901, '10.52 NGR', '架空　一郎(3)', '架空学園高'], [2, 5902, '10.60', '見本　二郎(2)', '見本学院'], [3, 5903, '10.70', '試験　三太(2)', '試験大附', ' GR']]);
  h = h.replace('見本　二郎(2)<br>', '大会新<br>見本　二郎(2)<br>');
  const r = R.parseCells(R.goldMobileStream(h), {});
  assert.deepEqual(rows(r), [['架空 一郎', '架空学園高', '10.52', 'NGR'], ['見本 二郎', '見本学院', '10.60', '大会新'], ['試験 三太', '試験大附', '10.70', 'GR']]);
});
check('gold.jaic.org（リレー）：「41.96NGR」、別の行の「大会新」でもチーム・記録・走者を読む', () => {
  const sj = new TextDecoder('shift_jis').decode(fs.readFileSync(path.join(FX, 'relay_gold_heat.html')));
  const h = sj.replace('1位　　41.96<br>', '1位　　41.96NGR<br>').replace('2位　　42.98<br>', '2位　　42.98<br>大会新<br>');
  const g = R.parseRelayGold(h).cands;
  assert.deepEqual(g.slice(0, 2).map(c => [c.team, c.mark, c.comment, c.runners.length]), [['架空', '41.96', 'NGR', 4], ['都見本', '42.98', '大会新', 4]]);
  assert.equal(g[2].mark, 'DQ');
});
const ra = await loadPages(path.join(FX, 'relay_a.pdf')), base = R.parseRelayPdf(ra);
const ra2 = JSON.parse(JSON.stringify(ra)); const it = ra2[0].items.find(i => i.str.trim() === base[0].mark); it.str = it.str.trim() + 'NGR';
const tg = R.parseRelayPdf(ra2);
check('PDF（リレー）：記録に「NGR」がくっついても、チーム・記録・走者を読み、備考に NGR', () => {
  assert.equal(tg.length, base.length); assert.deepEqual([tg[0].team, tg[0].mark, tg[0].comment, tg[0].runners.length], [base[0].team, base[0].mark, 'NGR', 4]);
});
check('私学の学校名：正式名・中等部/高等部・大学附属の略し方・(私)・都道府県つき', () => {
  const Y = [['本郷中', '本郷中学校'], ['架空学園高', '架空学園高等学校'], ['架空学園高等部', '架空学園高'], ['架空学園中等部', '架空学園中'], ['架空学園中学', '架空学園中'],
    ['架空大附', '架空大学附属高'], ['架空大学附属高', '架空大附'], ['架空大付属中', '架空大学付属中学校'], ['（私）架空学園', '架空学園'], ['東京・架空学園', '架空学園高'], ['東京 架空学園高', '架空学園'], ['架空学園高(東京)', '架空学園'], ['架空学院', '架空学院高等学校']];
  const N = [['架空学園中', '架空学園高'], ['架空学園高等部', '架空学園中'], ['架空学園大附属', '架空学園'], ['第二架空中', '架空中'], ['架空中A', '架空中'], ['立教池袋', '立教池袋中'], ['東京学館', '学館']];
  for (const [a, b] of Y) assert(R.matchSchool(a, b), a + ' ← ' + b);
  for (const [a, b] of N) assert(!R.matchSchool(a, b), a + ' ← ' + b + '（別の学校・別の学年）');
});

// 東京都中体連の速報（gold.jaic.org/…/cyuugaku/record/…）の形：所属「地区・学校名」「地区・クラブ・L･学校名」、NPR・OPN、混成の得点、(0)DNS
const cyu = '<!-- 2026/06/28 15:00:00 15 (Lsoku=0)-->\n<html><head><meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS"><title>女子共通 ８００ｍ ﾀｲﾑﾚｰｽ1組</title></head>\n女子共通 ８００ｍ ﾀｲﾑﾚｰｽ1組<br>\n<hr>\n' +
  '<font color="#000080">1位　(719)<br>　 2:09.58NPR <br>\nNGR <br>架空　花子 (3)<br>墨　田・架空立花<br>\n' +
  '</font><font color="#008000">2位　(6021)<br>　 2:14.99<br>見本　桜 (2)<br>足　立・KJR・L･架空十一<br>\n' +
  '</font><font color="#000000">　　(10)<br>　 2:17.47OPN <br>試験　葵 (2)<br>港　　・架空学園<br>\n</font>\n<ul class="cowomts"><li>NPR:東京都中学新記録<li>NGR:大会新記録<li>OPN:オープン参加</ul></html>';
check('中体連の速報：「2:09.58NPR」＋別の行の「NGR」・「OPN」でも読み、印は備考に。名前・所属がずれない', () => {
  const r = R.parseCells(R.goldMobileStream(cyu), {});
  assert.deepEqual(rows(r), [['架空 花子', '墨 田・架空立花', '2:09.58', 'NGR NPR'], ['見本 桜', '足 立・KJR・L・架空十一', '2:14.99', ''], ['試験 葵', '港 ・架空学園', '2:17.47', 'OPN']]);
  assert.equal(r.warns.length, 0);
});
check('中体連の所属「墨　田・架空立花」「足　立・KJR・L･架空十一」は「架空立花中」「架空十一」で見つかる。区分は中学', () => {
  assert(R.matchSchool('墨　田・架空立花', '架空立花中')); assert(R.matchSchool('墨　田・架空立花', '架空立花')); assert(R.matchSchool('足　立・KJR・L･架空十一', '架空十一中'));
  assert(R.matchSchool('港　　・架空学園', '架空学園中')); assert(!R.matchSchool('墨　田・架空立花', '立花中')); assert(!R.matchSchool('港・架空学園', '架空学園高'));
  assert(R.matchSchool('東京・架空学園', '架空学園高'));   // 都道府県・学校名の形はこれまでどおり
  assert.equal(R.divisionOf({ team: '墨　田・架空立花', event: '女子共通 800m' }), 'jh');
  assert.equal(R.athleteKey({ name: '架空 花子', team: '墨　田・架空立花' }), R.athleteKey({ name: '架空 花子', team: '架空立花中' }));
});
check('混成の各種目「55.02(598)」は記録 55.02・備考「598点」、「(0)DNS」は DNS', () => {
  const c = s => { const m = R.cleanMark(s); return [m.mark, m.wind, m.tags.join(',')]; };
  assert.deepEqual(c('55.02(598)'), ['55.02', null, '598点']); assert.deepEqual(c('3m88(450)'), ['3m88', null, '450点']); assert.deepEqual(c('(0)DNS'), ['DNS', null, '']);
  assert.deepEqual(c('13.56(+0.8)'), ['13.56', '+0.8', '']);
});
console.log('v0.26.23 記録の印と私学 OK ' + ok);
