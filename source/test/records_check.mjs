// LANE LOGの読み取り・自己ベストの確認（架空の選手・架空の大会。実在のデータは使わない）
//   node records_check.mjs                → 架空データだけで確認
//   node records_check.mjs a.pdf b.pdf …  → 手元の結果PDFも読んで件数と警告を出す（要 pdfjs-dist。PDFはコミットしない）
import {createRequire} from 'module';const require=createRequire(import.meta.url);
const R=require('../src/results.js');
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ok',m)}else{fail++;console.log('  NG',m)}};
console.log('[1] 記録の形と風');
ok(R.markValue('10.47').v===10.47&&R.markValue('4:31.15').v===271.15&&R.markValue('5m74').v===5.74&&!R.markValue('5m74').lower,'時間・距離を数値にする');
ok(R.windClass({event:'男子100m',wind:'+2.1'})==='aid'&&R.windClass({event:'男子100m',wind:'+2.0'})==='ok'&&R.windClass({event:'男子100m',wind:''})==='unk'&&R.windClass({event:'男子400m',wind:''})==='na','追い風2.0超は参考・2.0は公認・風なしは不明・400mは風なし');
ok(R.normEvent('高校男子100m')===R.normEvent('男子（選） １００ｍ')&&R.normEvent('男子高校 100m')===R.normEvent('男子 100m'),'種目名のゆれをそろえる');
ok(R.matchSchool('架空高','架空')&&R.matchSchool('架空中','架空')&&!R.matchSchool('架空台中','架空')&&R.matchSchool('3・架空','架空'),'学校名の照合');
console.log('[2] 表（HTML・貼り付け）');
const st=[{type:'text',v:'第1回架空区陸上競技大会'},{type:'text',v:'2026年 4月 1日 10時00分'},{type:'text',v:'男子（選） １００ｍ ﾀｲﾑﾚｰｽ2組'},{type:'text',v:'風:+1.2'},
 {type:'row',cells:['順位','ﾚｰﾝ','Bib','氏名','氏名','所属','記録','ｺﾒﾝﾄ']},
 {type:'row',cells:['1','4','101','架空 一郎(高2)','ｶｸｳ ｲﾁﾛｳ','架空高','11.50 [11.497]','']},
 {type:'row',cells:['','5','102','見本 二郎(中3)','ﾐﾎﾝ ｼﾞﾛｳ','架空中','','DNS']},
 {type:'row',cells:['2','6','103','他校 三郎(高1)','ﾀｺｳ ｻﾌﾞﾛｳ','別の高','11.80','']},
 {type:'text',v:'男子（選） １００ｍ ﾀｲﾑﾚｰｽ総合結果'},
 {type:'row',cells:['順位','ﾚｰﾝ','Bib','氏名','氏名','所属','記録','ｺﾒﾝﾄ','組','着']},
 {type:'row',cells:['3','4','101','架空 一郎(高2)','ｶｸｳ ｲﾁﾛｳ','架空高','11.50\n[11.497]\n+1.2','','2組','1着']},
 {type:'text',v:'男子（選） 走幅跳 決勝'},
 {type:'row',cells:['順位','試順','Bib','氏名','所属','記録','ｺﾒﾝﾄ','1回']},
 {type:'row',cells:['1','3','101','架空 一郎(高2)\nｶｸｳ ｲﾁﾛｳ','架空高','6m01\n+2.4','','6m01\n+2.4']}];
let res=R.parseCells(st,{school:'架空'});
ok(res.meet.name==='第1回架空区陸上競技大会'&&res.meet.date==='2026-04-01','大会名と日付');
ok(res.recs.length===3,'自校の3件（他校は除く・総合結果は組の行にまとめる）：'+res.recs.length);
const a=res.recs[0];ok(a.mark==='11.50'&&a.wind==='+1.2'&&a.heat===2&&a.grade==='高2'&&a.kana==='カクウ イチロウ'&&a.overall===3,'100m：記録・風・組・学年・カナ・総合順位');
ok(res.recs[1].mark==='DNS','DNSはコメント欄から');
ok(res.recs[2].mark==='6m01'&&res.recs[2].wind==='+2.4'&&res.recs[2].name==='架空 一郎','走幅跳：1つのセルの漢字・カナと記録・風');
const txt='男子（選） １００ｍ ﾀｲﾑﾚｰｽ総合結果\n2026年 4月 1日\n順位\tﾚｰﾝ\tBib\t氏名\t所属\t記録\tｺﾒﾝﾄ\t組\t着\n1\t4\t101\t架空 一郎(高2)\tｶｸｳ ｲﾁﾛｳ\t架空高\t11.50\n[11.497]\n+1.2\t\n\t2組\t1着\n';
res=R.parsePlain(txt,{school:'架空'});ok(res.recs.length===1&&res.recs[0].mark==='11.50'&&res.recs[0].wind==='+1.2'&&res.recs[0].heat===2,'貼り付け（セルの中の改行）');
console.log('[3] 自己ベスト');
const recs=[['2026-04-01','12.00','+1.0'],['2026-05-01','11.80','+2.5'],['2026-06-01','11.90','+0.5'],['2026-07-01','12.10','+0.3'],['2026-08-01','11.70','']].map((x,i)=>({id:'r'+i,date:x[0],mark:x[1],wind:x[2],event:'男子100m',name:'架空 一郎',team:'架空高'}));
const cb=R.computeBests(recs);const b=cb.bests[0];
ok(b.best.mark==='11.90','公認ベストは11.90（追い風2.5と風不明は除く）');
ok(b.ref&&b.ref.mark==='11.70','参考記録は11.70（風不明）');
ok(cb.flags.r0==='初'&&cb.flags.r2==='PB'&&!cb.flags.r1&&!cb.flags.r3,'初記録とPB更新の印');
const id1=R.recId('大会',"2026-04-01",recs[0]),id2=R.recId('大 会',"2026-04-01",Object.assign({},recs[0]));ok(id1===id2,'同じ記録は同じID（2回入れても重ならない）');
console.log('[4] 大会名の推測（ファイル名・見出し）');
{const g=(f,d)=>R.guessMeet(f,d||'');const cases=[
 ['2026第3支部学年別_結果.pdf','','第3支部学年別'],
 ['R8_北区陸上_リザルト(1).pdf','','北区陸上'],
 ['20261004_江東区秋季_最終.pdf','','江東区秋季'],
 ['令和8年度豊島区春季大会記録_v2.pdf','','豊島区春季大会'],
 ['10月4日 江東区秋季 速報.html','','江東区秋季'],
 ['2026-05-30_2・3支部学年別大会_確定版.pdf','','2・3支部学年別大会'],
 ['第1回架空区陸上競技大会 結果.pdf','','第1回架空区陸上競技大会'],
 ['架空区記録会-リザルト-v2.pdf','','架空区記録会'],
 ['result.pdf','第74回北区民体育大会','第74回北区民体育大会'],
 ['20261004_江東区秋季_最終.pdf','第49回江東区秋季陸上競技大会','第49回江東区秋季陸上競技大会'],
 ['豊島区.pdf','','豊島区'],
 ['26学年別TT（黒木再々修正）.pdf','','学年別'],
 ['timeorder.html','本郷 出場一覧（時間順） 10/10(土) 第74回北区民体育大会 兼 北区陸上競技選手権大会','第74回北区民体育大会 兼 北区陸上競技選手権大会'],
 ['scan0001.pdf','',''],['結果.pdf','',''],['リザルト(2).pdf','','']];
 cases.forEach(([f,d,want])=>{const r=g(f,d);ok(r.name===want,f+(d?' ＋見出し「'+d+'」':'')+' → 「'+r.name+'」');});
 ok(g('20261004_江東区秋季.pdf').date==='2026-10-04'&&g('R8.10.4 北区.pdf').date==='2026-10-04'&&g('令和8年10月4日 北区.pdf').date==='2026-10-04'&&g('2026_10_04 北区.pdf').date==='2026-10-04','ファイル名の日付（20261004・R8.10.4・令和8年10月4日・2026_10_04）');
 ok(g('10月4日 江東区秋季.pdf').date===''&&g('10月4日 江東区秋季.pdf').md==='10月4日','年のない日付は月日だけ控える');
 ok(g('20261399_北区.pdf').date==='','ありえない日付は使わない');}
if(process.argv.length>2){const {loadPages}=await import('./load.mjs');
 for(const f of process.argv.slice(2)){const r=R.parsePdf(await loadPages(f),{school:process.env.SCHOOL||'本郷'});console.log('[PDF]',f,'記録',r.recs.length,'件 警告',r.warns.length,'件');r.warns.slice(0,10).forEach(w=>console.log('   ⚠',w));}}
console.log('\n'+pass+' passed, '+fail+' failed');process.exit(fail?1:0);
