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
console.log('[5] シーズン・PBの伸び・ランキング・歴代（v0.3）');
{ok(R.seasonOf('2026-04-01')===2026&&R.seasonOf('2026-03-31')===2025&&R.seasonOf('2027-03-01')===2026&&R.seasonOf('')===null,'シーズンは4月始まりの年度');
 ok(R.improvement('12.00','11.85')===0.15&&R.improvement('5m50','5m74')===0.24&&R.improvement('4:40.00','4:31.15')===8.85,'改善幅（時間は短縮・距離は伸び）');
 ok(R.fmtImprovement(0.15,true)==='−0.15秒'&&R.fmtImprovement(0.24,false)==='+0.24','改善幅の表示');
 const mk=(id,d,ev,n,g,m,w)=>({id,date:d,event:ev,name:n,team:'架空高',grade:g,mark:m,wind:w});
 const rs=[mk('a1','2025-06-01','男子100m','架空 一郎','高1','12.00','+1.0'),mk('a2','2026-05-01','男子100m','架空 一郎','高2','11.80','+0.5'),mk('a3','2026-06-01','男子100m','架空 一郎','高2','11.60','+2.5'),
  mk('a4','2026-07-01','男子100m','架空 一郎','高2','11.70',''),mk('b1','2026-05-01','男子100m','見本 二郎','高1','11.90','+0.1'),mk('c1','2023-05-01','男子100m','先輩 太郎','高3','11.20','+1.5'),
  mk('d1','2026-05-01','男子走幅跳','架空 一郎','高2','5m50','+1.0'),mk('d2','2026-09-01','男子走幅跳','架空 一郎','高2','5m74','+1.9'),mk('e1','2026-09-01','男子走幅跳','見本 二郎','高1','5m80','+3.0')];
 const K=ev=>'hs:'+R.normEvent(ev);
 const pd=R.pbDetails(rs);
 ok(pd.a1.flag==='初'&&pd.a2.flag==='PB'&&pd.a2.prev.id==='a1'&&pd.a2.diff===0.2,'PBの直前ベストと伸び（12.00→11.80 で 0.20）');
 ok(!pd.a3&&!pd.a4,'追い風2.0超・風不明はPBにしない');
 ok(pd.d2.flag==='PB'&&pd.d2.diff===0.24&&!pd.e1,'フィールドのPB（+0.24）・追い風参考は除く');
 const all=R.ranking(rs,{});
 ok(all[K('男子100m')].map(x=>x.name).join(',')==='先輩 太郎,架空 一郎,見本 二郎','全期間ランキング（時間は速い順）');
 ok(all[K('男子100m')][1].best.mark==='11.80','ランキングの記録は公認ベスト');
 const s26=R.ranking(rs,{season:2026});
 ok(s26[K('男子100m')].length===2&&s26[K('男子100m')][0].name==='架空 一郎','今シーズンだけ（先輩・昨年度は除く）');
 const g1=R.ranking(rs,{season:2026,grade:1});
 ok(g1[K('男子100m')].length===1&&g1[K('男子100m')][0].name==='見本 二郎'&&!g1[K('男子走幅跳')],'学年で絞り込む（風参考だけの選手は載らない）');
 ok(R.ranking(rs,{grade:2})[K('男子100m')].map(x=>x.name).join()==='架空 一郎','学年は最新の記録で判定（高1→高2の選手は2年）');
 const tie=R.ranking([mk('t1','2026-05-01','男子400m','甲','高1','55.00',''),mk('t2','2026-05-01','男子400m','乙','高1','55.00',''),mk('t3','2026-05-01','男子400m','丙','高1','56.00','')],{})[K('男子400m')];
 ok(tie.map(x=>x.rank).join()==='1,1,3','同記録は同順位');
 const at=R.allTimeTop(rs,2);
 ok(at[K('男子100m')].length===2&&at[K('男子100m')][0].year==='2023'&&at[K('男子100m')][0].season===2023,'歴代は上位n人・年を出す');
 ok(at[K('男子走幅跳')][0].best.mark==='5m74','歴代のフィールドは遠い順（参考記録は除く）');
 const pf=R.athleteProfile(rs,R.athleteKey(rs[0]));
 ok(pf.events.length===2&&pf.grade==='高2','選手ページ：種目ごと');
 const e100=pf.events.find(e=>e.event===K('男子100m'));
 ok(e100.best.mark==='11.80'&&e100.ref.mark==='11.60'&&e100.points.length===2&&e100.lower&&e100.recent[0].id==='a4','選手ページ：公認ベスト・参考・グラフ点（公認のみ）・最近の記録');
 ok(R.athleteProfile(rs,'nobody')===null,'いない選手はnull');}
console.log('[6] 中学・高校の区分と学年別（v0.4・同じ系列の中学／高校の混ざりの再発防止）');
{const mk=(id,d,ev,n,team,g,m,w)=>({id,date:d,event:ev,name:n,team,grade:g,mark:m,wind:w});
 ok(R.normEvent('男子中学1年 100m')===R.normEvent('男子高校 100m'),'（原因）normEvent だけでは中1と高校の100mが同じ「男子100m」になる');
 ok(R.divisionOf({team:'架空中'})==='jh'&&R.divisionOf({team:'架空高'})==='hs'&&R.divisionOf({team:'架空中学校'})==='jh'&&R.divisionOf({team:'架空高等学校'})==='hs','所属の中・高で区分');
 ok(R.divisionOf({team:'架空',event:'男子中学1年 100m'})==='jh'&&R.divisionOf({team:'架空',event:'男子高校 100m'})==='hs'&&R.divisionOf({team:'架空',event:'男子100m',grade:'中2'})==='jh','所属で決まらなければ種目見出し・学年で区分');
 ok(R.eventCat('男子中学1年 100m')==='1年'&&R.eventCat('男子中学2年 100m')==='2年'&&R.eventCat('男子中学共通 100m')==='共通'&&R.eventCat('男子高校 100m')===''&&R.eventCat('男子2支部1年 100m')==='1年'&&R.eventCat('中1男子100m')==='1年'&&R.eventCat('中学2・3年男子100m')==='2・3年'&&R.eventCat('小学4~6年男子100m')==='小学','学年別・共通の区分を読む');
 const evs=['男子中学1年 100m','男子中学2年 100m','男子中学3年 100m','男子中学共通 100m','男子高校 100m'];
 ok(new Set(evs.map(e=>R.eventKey({event:e,team:'架空'}))).size===2,'v0.26.23：中1・中2・中3・共通の100mは同じ「中学 100m」、高校の100mは別');
 const rs=[mk('j1','2026-05-30','男子中学1年 100m','中一 太郎','架空中','1','13.50','+0.5'),mk('j2','2026-05-30','男子中学2年 100m','中二 次郎','架空中','2','12.40','+0.3'),
  mk('j3','2026-05-30','男子中学3年 100m','中三 三郎','架空中','3','11.95','+0.1'),mk('h1','2026-05-30','男子高校 100m','高一 四郎','架空高','1','11.40','+1.0'),
  mk('h2','2026-05-30','男子高校 100m','高二 五郎','架空高','2','11.10','+1.2'),mk('o1','2026-05-30','男子中学1年 100m','他校 六郎','別の中','1','12.90','+0.5')];
 const mine=rs.filter(r=>R.matchSchool(r.team,'架空'));
 ok(mine.length===5,'学校名「架空」は架空中と架空高の両方に当たる（だから区分が必要）');
 const all=R.ranking(mine,{}),k1=R.eventKey(rs[0]);
 ok(all[k1].length===3&&all[k1][0].name==='中三 三郎'&&!all[k1].some(x=>/高/.test(x.name)),'v0.26.23：「男子 中学 100m」のランキングに中1〜3が入り、高校の選手は入らない');
 ok(!Object.keys(all).some(k=>all[k].some(x=>x.name==='高二 五郎')&&all[k].some(x=>x.name==='中一 太郎')),'中学と高校の記録が同じランキングに入らない');
 ok(Object.keys(R.ranking(mine,{div:'jh'})).length===1&&Object.keys(R.ranking(mine,{div:'hs'})).length===1,'中学／高校の切り替え（どちらも100mは1種目）');
 ok(R.ranking(mine,{div:'jh',grade:1})[k1].length===1&&!R.ranking(mine,{div:'hs',grade:1})[k1],'学年の絞り込みは区分の中だけ（高1が中1に混ざらない）');
 ok(R.eventKeyLabel(rs[0])==='男子 中学 100m'&&R.eventKeyLabel(rs[3])==='男子 高校 100m'&&R.eventKeyLabel(mk('x','','男子中学共通 100m','a','架空中','','12.00',''))==='男子 中学 100m','種目の表示名に中学・高校を出す');
 const same=[mk('s1','2026-04-01','男子100m','同名 太郎','架空中','3','12.00','+0.1'),mk('s2','2026-06-01','男子100m','同名 太郎','架空高','1','11.50','+0.1')];
 ok(R.athleteKey(same[0])!==R.athleteKey(same[1])&&R.pbDetails(same).s2.flag==='初','同じ名前でも架空中と架空高は別の選手として扱う（中学のベストを高校で更新したことにしない）');
 const at=R.allTimeTop(mine,10,{div:'hs'});ok(Object.keys(at).length===1&&at[R.eventKey(rs[3])][0].name==='高二 五郎','歴代記録も区分ごと');
 // HTMLの貼り付け（学年別の見出しが続く形）：見出しが変わったら種目を切り替える
 const st=[{type:'text',v:'第1回架空支部学年別大会'},{type:'text',v:'男子中学1年 １００ｍ 決勝'},{type:'row',cells:['順位','ﾚｰﾝ','Bib','氏名','所属','記録','風']},{type:'row',cells:['1','4','11','中一 太郎(1)','架空中','13.50','+0.5']},
  {type:'text',v:'男子中学2年 １００ｍ 決勝'},{type:'row',cells:['順位','ﾚｰﾝ','Bib','氏名','所属','記録','風']},{type:'row',cells:['1','4','12','中二 次郎(2)','架空中','12.40','+0.3']},
  {type:'text',v:'男子高校 １００ｍ 決勝'},{type:'row',cells:['順位','ﾚｰﾝ','Bib','氏名','所属','記録','風']},{type:'row',cells:['1','4','13','高二 五郎(2)','架空高','11.10','+1.2']},{type:'row',cells:['','5','14','高一 欠場(1)','架空高','DNS','+1.2']}];
 const pr=R.parseCells(st,{school:'架空'});
 ok(pr.recs.map(r=>R.eventKey(r)).join()==='jh:男子100m,jh:男子100m,hs:男子100m,hs:男子100m'&&pr.recs[0].event!==pr.recs[1].event,'見出しごとに種目・区分が切り替わる（元の種目名は残る）');
 ok(pr.recs[3].mark==='DNS'&&pr.recs[3].wind===''&&R.shownWind(pr.recs[3])===''&&R.shownWind(pr.recs[2])==='+1.2','DNSには風を入れない・出さない');
 ok(R.shownWind({event:'男子100m',mark:'DNF',wind:'+1.0'})===''&&R.shownWind({event:'男子100m',mark:'DQ',wind:'+1.0'})===''&&R.shownWind({event:'男子400m',mark:'55.00',wind:'+1.0'})==='','DNF・失格・風のない種目は風を出さない');}
console.log('[7] 選手別の並び・グラフの参考記録');
{const L=[{name:'三山 太郎',kana:'ミヤマ タロウ'},{name:'中家 次郎',kana:'ナカイエ ジロウ'},{name:'三枝 三郎',kana:'サエグサ サブロウ'}];
 ok(R.sortAthletes(L).map(x=>x.name).join()==='三枝 三郎,中家 次郎,三山 太郎','フリガナで五十音順（サ→ナ→ミ）');
 const G=[{name:'乙',grade:'2'},{name:'甲',grade:'1'},{name:'丙',grade:'1'}];
 ok(R.sortAthletes(G).map(x=>x.grade).join()==='1,1,2','フリガナが無ければ学年順');
 const rs=[['2026-04-01','12.00','+1.0'],['2026-05-01','11.80','+2.5'],['2026-06-01','11.70','']].map((x,i)=>({id:'p'+i,date:x[0],mark:x[1],wind:x[2],event:'男子100m',name:'架空 一郎',team:'架空高'}));
 const e=R.athleteProfile(rs,R.athleteKey(rs[0])).events[0];
 ok(e.points.length===1&&e.allPoints.length===3&&e.allPoints.filter(p=>p.ref).length===2,'グラフ用：公認1点・参考（追い風・風不明）2点');}
console.log('[8] v0.5：種目の並び・男女・中学/高校の推測・Excel取り込み');
{const mk=(id,date,ev,name,team,grade,mark,wind,kana)=>({id,date,event:ev,name,team,grade,mark,wind:wind||'',kana:kana||''});
 const rs=[mk('a1','2026-05-01','男子中学1年 1500m','中一 太郎','架空中','1','5:01.00'),mk('a2','2026-05-01','男子中学1年 100m','中一 太郎','架空中','1','13.50','+0.1'),
  mk('a3','2026-05-01','男子高校 100m','高二 五郎','架空高','2','11.20','+0.1'),mk('a4','2026-05-01','男子中学共通 走幅跳','中三 三郎','架空中','3','5m50','+0.2'),
  mk('a5','2026-05-01','男子中学共通 110mH','中三 三郎','架空中','3','16.50','+0.3'),mk('a6','2026-05-01','男子中学共通 200m','中三 三郎','架空中','3','25.00','+0.3'),
  mk('a7','2026-05-01','男子中学共通 砲丸投','中三 三郎','架空中','3','9m00'),mk('a8','2026-05-01','男子高校 やり投','高二 五郎','架空高','2','40m00'),mk('a9','2026-05-01','男子高校 1500m','高二 五郎','架空高','2','4:20.00'),
  mk('a10','2026-05-01','男子中学2年 100m','中二 次郎','架空中','2','12.80','+0.0'),mk('a11','2026-05-01','男子中学共通 走高跳','中三 三郎','架空中','3','1m50')];
 const keys=[...new Set(rs.map(r=>R.eventKey(r)))];
 const g=R.groupEvents(keys,rs,true);
 ok(g.map(x=>x.group).join()==='中学,高校','区分の順（中学→高校）：'+g.map(x=>x.group).join());
 ok(g[0].items.map(i=>i.label).join()==='中学 100m,中学 200m,中学 1500m,中学 110mH(0.914m),中学 走高跳,中学 走幅跳,中学 砲丸投(5.000kg)','中学：短距離（100→200→1500、文字順にしない）→ハードル→跳躍（高→幅）→投てき：'+g[0].items.map(i=>i.label).join());
  ok(g[1].items.map(i=>i.label).join()==='高校 100m,高校 1500m,高校 やり投(0.800kg)','高校：100m→1500m→やり投');
 ok(R.groupEvents(keys,rs,false)[0].items[0].label==='男子 中学 100m','男女が混ざるときは「男子」を付ける');
 const D=e=>R.disciplineOrder(e)[0];ok(D('男子4×100mR')===3&&D('男子5000mW')===4&&D('男子3000mSC')<3&&D('男子八種競技')===7&&D('女子100mH')===2,'リレー・競歩・障害・混成・ハードルの分類');
 const mix=rs.concat([mk('f1','2026-05-01','女子中学1年 100m','中一 花子','架空中','1','14.00','+0.1')]);
 ok(R.gendersIn(rs).join()==='m'&&R.gendersIn(mix).join()==='m,f'&&R.genderOf(mix[mix.length-1])==='f','男子だけ／男女まざりの判定');
 // 中学/高校の推測
 const P=[mk('p1','2026-05-01','男子100m','推測 一郎','架空中','2','12.50','+0.1'),mk('p2','2026-07-01','男子200m','推測 一郎','架空','','25.50','+0.1'),
  mk('q1','2026-05-01','男子100m','両方 二郎','架空中','3','12.00','+0.1'),mk('q2','2026-06-01','男子100m','両方 二郎','架空高','1','11.80','+0.1'),mk('q3','2026-07-01','男子100m','両方 二郎','架空','','11.90','+0.1'),
  mk('r1','2025-09-01','男子100m','進学 三郎','架空中','3','12.20','+0.1'),mk('r2','2026-05-10','男子100m','進学 三郎','架空','','11.95','+0.1'),
  mk('s1','2026-05-01','男子100m','手掛 四郎','架空','','12.10','+0.1'),
  mk('k1','2026-05-01','男子100m','同名 五郎','架空高','2','11.50','+0.1','ドウメイ ゴロウ'),mk('k2','2026-07-01','男子100m','同名 五郎','架空','','11.60','+0.1','ドウメイ ゴロウ')];
 const inf=R.inferDivisions(P,{});
 ok(inf.hints.p2==='jh','中学にしか出ていない選手の「架空」だけの記録は中学');
 ok(inf.hints.k2==='hs','フリガナも同じ選手で高校と決める');
 ok(!inf.hints.q3&&inf.review.some(x=>x.ids.includes('q3')&&/中学にも高校/.test(x.reason)),'中学にも高校にもいる名前は推測しない（要確認）');
 ok(!inf.hints.r2&&inf.review.some(x=>x.ids.includes('r2')&&/4月/.test(x.reason)),'中3の翌年度（4月をまたぐ）は推測しない（要確認）');
 ok(!inf.hints.s1&&inf.review.some(x=>x.ids.includes('s1')),'手がかりがなければ要確認');
 const inf2=R.inferDivisions(P,{[R.personKey(P[5])]:'hs'});ok(inf2.hints.r2==='hs'&&!inf2.review.some(x=>x.ids.includes('r2')),'画面で選んだ区分を使う');
 R.setDivisionHints(inf.hints);ok(R.divisionOf(P[1])==='jh'&&R.athleteKey(P[1])===R.athleteKey(P[0]),'推測した記録は同じ選手（中学）にまとまる');R.setDivisionHints({});
 // Excel
 const m=R.mapHeaders(['No','氏名','フリガナ','学年','所属','種目','記録','風速','年月日','大会名','順位','ラウンド']);
 ok(m.name===1&&m.kana===2&&m.grade===3&&m.team===4&&m.event===5&&m.mark===6&&m.wind===7&&m.date===8&&m.meet===9&&m.rank===10&&m.round===11,'見出しの自動割り当て（氏名・風速・年月日・大会名…）');
 const m2=R.mapHeaders(['名前','学校','種目','タイム','風','日付','大会']);ok(m2.name===0&&m2.team===1&&m2.mark===3&&m2.wind===4&&m2.date===5&&m2.meet===6,'別の書き方（名前・学校・タイム・日付・大会）');
 ok(R.findHeaderRow([['2026年度 記録'],[],['氏名','種目','記録','日付'],['a','100m','12.00','2026/9/13']])===2,'見出しの行を探す（上にタイトルがあっても）');
 ok(R.parseDateCell('2026/9/13')==='2026-09-13'&&R.parseDateCell('R8.9.13')==='2026-09-13'&&R.parseDateCell('令和8年9月13日')==='2026-09-13'&&R.parseDateCell('2026年9月13日')==='2026-09-13'&&R.parseDateCell('2026-09-13')==='2026-09-13','日付：2026/9/13・R8.9.13・令和8年9月13日');
 ok(R.parseDateCell(46278)==='2026-09-13'&&R.parseDateCell('46278')==='2026-09-13'&&R.parseDateCell(46278.5)==='2026-09-13','Excelの通し番号（46278 = 2026/9/13）');
 ok(R.parseDateCell(new Date(2026,8,13))==='2026-09-13'&&R.parseDateCell('')===''&&R.parseDateCell('9月13日')===''&&R.parseDateCell('2026/13/40')===''&&R.parseDateCell(12)==='','Date・空・年なし・ありえない日付・小さい数');
 ok(R.normImportMark(11.5,'100m')==='11.50'&&R.normImportMark(5.74,'走幅跳')==='5m74'&&R.normImportMark(271.3/86400,'1500m')==='4:31.30'&&R.normImportMark('4分31秒15','1500m')==='4:31.15','記録の形をそろえる（11.5→11.50・5.74→5m74・時刻の数・4分31秒15）');
 const aoa=[['氏名','種目','記録','風','日付','大会名'],['架空 一郎','男子100m',11.5,1.2,46278,''],['架空 一郎','男子100m','11.40','+0.5','R8.10.4','区民大会'],['架空 二郎','男子走幅跳',5.5,'',''],['','','','','','']];
 const ir=R.importRows(aoa,R.mapHeaders(aoa[0]),{school:'架空中'});
 ok(ir.recs.length===2&&ir.bad.length===1&&/日付/.test(ir.bad[0].warn),'日付の無い行は取り込まずに知らせる・空行は飛ばす');
 ok(ir.recs[0].meet==='大会名なし（2026-09-13）'&&ir.recs[0].mark==='11.50'&&ir.recs[0].wind==='+1.2'&&ir.recs[0].team==='架空中'&&ir.recs[1].meet==='区民大会'&&ir.recs[1].date==='2026-10-04','大会名なしは「大会名なし（日付）」・所属が空なら学校名・風の数値');
 const id1=R.recId(ir.recs[1].meet,ir.recs[1].date,ir.recs[1]),id2=R.recId('区民大会','2026-10-04',Object.assign({},ir.recs[1]));ok(id1===id2,'同じ記録は同じID（既存と重ならない）');}
if(process.argv.length>2){const {loadPages}=await import('./load.mjs');
 for(const f of process.argv.slice(2)){const r=R.parsePdf(await loadPages(f),{school:process.env.SCHOOL||'本郷'});console.log('[PDF]',f,'記録',r.recs.length,'件 警告',r.warns.length,'件');r.warns.slice(0,10).forEach(w=>console.log('   ⚠',w));}}
console.log('\n'+pass+' passed, '+fail+' failed');process.exit(fail?1:0);
