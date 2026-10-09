// 江東区秋季型（Excelの競技日程：区分・競技名(組の範囲)・招集開始・招集完了の列）を、PDFを使わずに作った文字の並びで確かめる
//   node test/tt_callcols_check.mjs        （source/ で実行）
import {createRequire} from 'module';const require=createRequire(import.meta.url);
const P=require('../src/parser.js');globalThis.MeetParser=P;const L=require('../src/logic.js');
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ok',m)}else{fail++;console.log('  NG',m)}};
const it=(str,x,y)=>({str,x,y,w:str.length*5,h:9});
const row=(y,cells)=>cells.map(([s,x])=>it(s,x,y));
const X=[30,80,160,250,290,330,380];
const line=(y,a)=>row(y,a.map((s,i)=>[s,X[i]]).filter(c=>c[0]!==''));
const tt=[{width:595,height:842,items:[
 ...row(40,[['競技時刻',30],['区分',80],['競技名',160],['申込数',250],['組数',290],['招集開始',330],['招集完了',380]]),
 ...line(60,['11:05','高校・一般女子','100m','20','3','10:40','10:50']),
 ...line(70,['11:15','高校・一般男子','100m(1~6)','193','25','10:50','11:00']),
 ...line(80,['11:30','高校・一般男子','100m(7~12)','','','11:05','11:15']),
 ...line(90,['12:15','中学共通女子','800m','29','2','11:50','12:00']),
 ...line(100,['17:55','中学共通男子','4X100mR(1~4)','53','7','17:30','17:40']),
 ...line(110,['18:10','中学共通男子','4X100mR(5~7)','','','17:45','17:55']),
]}];
const T=P.parseTimetable(tt);
console.log('[1] タイムテーブルの読み取り');
ok(T.length===6,'6行すべて読む（かっこ付きの種目名・4X100mR）：'+T.map(s=>s.event).join(','));
const m7=T.find(s=>s.event==='100m(7~12)');
ok(m7&&m7.heats&&m7.heats.from===7&&m7.heats.to===12,'「100m(7~12)」は7〜12組');
ok(T.every(s=>s.gender),'区分「高校・一般男子」から性別：'+T.map(s=>s.gender).join(','));
ok(m7&&m7.callStart==='11:05'&&m7.callEnd==='11:15','招集開始・完了の列を読む（11:05〜11:15）');
console.log('[2] 照合');
const mk=(event,heat,time)=>({event,round:'タイムレース',heat,pos:1,posKind:'レーン',bib:'1',name:'架空 太郎',team:'架空高',grade:'1',page:1,time});
const sl={entries:[mk('高校・一般男子100m',1,'11:15'),mk('高校・一般男子100m',8,'11:15'),mk('中学共通男子800m',1,'12:30')],relays:[
 {event:'中学共通男子4X100mR',round:'タイムレース',heat:6,pos:3,team:'架空高A',members:[{bib:'1',name:'a',grade:'1'}],page:2,time:'17:55'}],events:[]};
const R=L.build(sl,T,['架空高'],{relayOrderMin:60,relayOrderBase:'招集完了',relayOrderFirst:true});
const h1=R.find(r=>r.heat===1&&/100m/.test(r.event)),h8=R.find(r=>r.heat===8);
ok(h1.start==='11:15'&&!h1.conflict&&h1.call==='10:50〜11:00'&&h1.callSrc==='tt','1組：11:15、招集はタイムテーブルの10:50〜11:00');
ok(h8.start==='11:30'&&!h8.conflict&&h8.call==='11:05〜11:15','8組：プログラム11:15（種目の開始）とタイムテーブル7〜12組11:30は食い違いにしない → 11:30（'+h8.note+'）');
const m800=R.find(r=>/800m/.test(r.event));
ok(!m800.start||m800.start==='12:30','男子800mに女子800m（12:15）の時刻を使わない（'+m800.start+' / '+m800.note+'）');
ok(m800.callSrc==='rule','タイムテーブルに無い種目は「〇分前」のルールで招集を計算');
const rl=R.find(r=>r.typ==='relay');
ok(rl.start==='18:10'&&rl.orderDeadline==='16:40','リレー6組：18:10、オーダー締切は最初の組の招集完了17:40の60分前＝16:40（'+rl.orderDeadline+'）');
console.log('[3] 注意事項');
const np=[{width:595,height:842,items:[it('５ 招集について',30,40),it('（２） 各競技の招集開始時刻・招集完了時刻は、タイムテーブルに記載のとおりとする。',30,50),
 it('（３） リレーオーダー用紙の提出締切時刻は最初の組の招集完了時刻の６０分前とする。',30,60)]}];
const N=P.parseNotes(np);
ok(N.callInTT&&/タイムテーブルに記載/.test(N.src.callTT),'「タイムテーブルに記載のとおり」を見つける');
ok(N.relayOrder&&N.relayOrder.minutes===60&&N.relayOrder.first,'オーダー締切「最初の組の招集完了時刻の60分前」');
console.log('[4] 支部大会型（支部ごとに時刻が違う）の照合');
const BS=[{event:'100m',time:'9:45',gender:'男',cat:'3',round:'決勝TR',branch:['2']},{event:'100m',time:'10:10',gender:'男',cat:'3',round:'決勝TR',branch:['3']},
 {event:'100m',time:'10:35',gender:'男',cat:'2',round:'決勝TR',branch:['2']},{event:'走幅跳',time:'14:00',gender:'男',cat:'2・3共',round:'決勝',branch:['2']},{event:'走幅跳',time:'16:00',gender:'男',cat:'2・3共',round:'決勝',branch:['3']}];
let ms=P.matchSegs('男子3支部3年 100m','決勝',BS);ok(ms.length===1&&ms[0].time==='10:10','「男子3支部3年 100m」→ 3年・③の10:10だけ（'+ms.map(x=>x.time)+'）');
ms=P.matchSegs('男子3支部2・3年 走幅跳','決勝',BS);ok(ms.length===1&&ms[0].time==='16:00','「男子3支部2・3年 走幅跳」→ ③の16:00（'+ms.map(x=>x.time)+'）');
ms=P.matchSegs('男子3支部1年 100m','決勝',BS);ok(ms.length===0,'1年の100mは2年・3年の時刻に当てない');
const t2=P.timeFor([{event:'走幅跳',time:'14:00',round:'決勝'},{event:'走幅跳',time:'16:00',round:'決勝'}],null);
ok(!t2.time&&t2.ambiguous,'同じラウンドで時刻の違う候補が2つ → 先頭を使わず未確定（'+t2.note+'）');
console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);
