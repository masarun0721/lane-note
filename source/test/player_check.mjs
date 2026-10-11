// 選手用ページ（v0.11）：1人分だけの中身・予定のまぜ方と並び順（架空の選手だけ）
//   node test/player_check.mjs   （source/ で実行）
import {createRequire} from 'module';const require=createRequire(import.meta.url);
const PL=require('../src/player.js');
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ok',m)}else{fail++;console.log('  NG',m)}};
const ind=(bib,name,event,start,cs,ce,heat,pos)=>({typ:'track',team:'架空中',bib,name,grade:'1',kana:'',event,round:'予選',heat,pos,posLabel:'レーン',start,callStart:cs,callEnd:ce,note:'プログラム記載の時刻'});
const rows=[ind('101','見本 一郎','中学1年男子100m','10:30','10:00','10:10',2,4),ind('102','架空 二郎','中学1年男子100m','10:30','10:00','10:10',3,5),
 ind('101','見本 一郎','中学男子走幅跳','13:00','12:20','12:30','-',7),
 {typ:'relay',team:'架空中',relayTeam:'架空中A',event:'中学男子4×100mR',round:'決勝',heat:1,pos:3,posLabel:'レーン',start:'15:10',callStart:'14:40',callEnd:'14:50',
  members:[{bib:'101',name:'見本 一郎',grade:'1'},{bib:'103',name:'例 三郎',grade:'2'},{bib:'104',name:'仮名 四郎',grade:'2'},{bib:'105',name:'試 五郎',grade:'3'}]}];
console.log('[1] 選手の一覧');
const A=PL.athletes(rows);
ok(A.length===5,'個人とリレーのメンバーから5人（重複なし）：'+A.map(a=>a.name).join(','));
const a1=A.find(a=>a.bib==='101'),a5=A.find(a=>a.bib==='105');
console.log('[2] 1人分の中身（ほかの選手を入れない）');
const p=PL.payloadFor(rows,a1,{n:'第1回架空区大会',d:'2026年10月11日（日）',pl:'架空競技場',cp:'サブトラック'});
const js=JSON.stringify(p);
ok(p.k==='p'&&p.a.name==='見本 一郎'&&p.e.length===3,'見本さんは100m・走幅跳・リレーの3件');
ok(!/架空 二郎|例 三郎|仮名 四郎|試 五郎|10[2-5]/.test(js),'ほかの選手の名前・ナンバー（リレーの仲間も）が入っていない');
ok(!('r' in p)&&!('c' in p)&&!('ts' in p),'全体用の項目（r・c・ts）を持たない');
ok(p.e.map(e=>e[0]).join()==='10:30,13:00,15:10','レースの時刻順');
const p5=PL.payloadFor(rows,a5,{});
ok(p5.e.length===1&&p5.e[0][8]===1&&!/見本|101/.test(JSON.stringify(p5)),'リレーだけの選手はリレー1件、仲間の名前なし');
console.log('[3] 自動の予定と自分の予定をまぜる');
const auto=PL.autoItems(p);
ok(auto.length===6&&auto.every(x=>x.auto),'招集とレースで6件、すべて自動（消せない）');
ok(auto[0].kind==='call'&&auto[0].t==='10:00'&&auto[0].t2==='10:10'&&/サブトラック/.test(auto[0].sub),'招集は開始〜完了と場所');
ok(/2組・4レーン/.test(auto[1].sub),'組とレーンを出す');
const own=[{id:'o1',label:'おきる',t:'6:30'},{id:'o2',label:'アップ開始',t:'10:00'},{id:'o3',label:'メモ',t:''},{id:'o4',label:'おひる',t:'12:00'}];
const M=PL.merge(auto,own);
ok(M.map(x=>x.t||'-').join()==='6:30,10:00,10:00,10:30,12:00,12:20,13:00,14:40,15:10,-','時間順・時刻なしは最後：'+M.map(x=>x.t||'-').join());
ok(M[1].kind==='own'&&M[2].kind==='call','同じ時刻は 自分の予定 → 招集 の順');
ok(PL.merge(auto,[]).length===6&&PL.merge([],own).length===4,'片方だけでも動く');
ok(PL.toMin('9:05')<PL.toMin('10:00'),'9:05 は 10:00 より前（文字の並びでなく時刻で比べる）');
console.log('[4] つぎの予定');
ok(PL.nextIndex(M,10*60+5)===3&&M[3].t==='10:30','10:05 のつぎは 10:30 のレース');
ok(PL.nextIndex(M,16*60)===-1,'ぜんぶ終わったら -1');
console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);
