// firestore.rules をエミュレーターで確かめる（v0.15・再監査A08：設定はリポジトリ直下の firebase.json、版は固定）
// 必ず demo プロジェクト・ローカルのエミュレーターで動かす（本番には絶対につながない。firebase deploy もしない）。要 Java 17 以上：
//   リポジトリ直下で：npx -y firebase-tools@14.12.0 emulators:exec --only firestore --project demo-lane-note --config firebase.json "node source/test/rules_check.mjs"
//   （source/test で npm run test:rules でも同じ）
import fs from 'node:fs';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {doc, collection, setDoc, getDoc, getDocs, updateDoc, deleteDoc, serverTimestamp, Timestamp, query, where, orderBy, limit, writeBatch, setLogLevel} from 'firebase/firestore';
setLogLevel('silent');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('ローカルのエミュレーター 127.0.0.1:8089 が必要です（本番への接続は禁止）');
let passed=0, failed=0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok',name); } catch (e) { failed++; console.log('  NG',name,e.message); } }
const projectId='demo-lane-note';
const claims={firebase:{sign_in_provider:'google.com'},email_verified:true};
const mkShare=(uid='alice',extra={})=>({data:'1.e30',ownerUid:uid,createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+119*864e5),...extra});
const mkFeedback=(uid='alice',extra={})=>({kind:'不具合',body:'架空のテスト',createdAt:serverTimestamp(),uid,...extra});
let env;
env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8089,rules:fs.readFileSync(new URL('../../firestore.rules',import.meta.url),'utf8')}});
try {
 await env.clearFirestore();
 const anon=env.unauthenticatedContext().firestore(), alice=env.authenticatedContext('alice',claims).firestore(), bob=env.authenticatedContext('bob',claims).firestore(), anonymousAuth=env.authenticatedContext('anon',{firebase:{sign_in_provider:'anonymous'}}).firestore();
 const path='shares/Valid00001';
 await test('FINAL: owner records create',()=>assertSucceeds(setDoc(doc(alice,'users/alice/records/r1'),{id:'r1',name:'架空選手'})));
 await test('FINAL: owner records get',()=>assertSucceeds(getDoc(doc(alice,'users/alice/records/r1'))));
 await test('FINAL: owner records list',()=>assertSucceeds(getDocs(collection(alice,'users/alice/records'))));
 await test('FINAL: other user records get denied',()=>assertFails(getDoc(doc(bob,'users/alice/records/r1'))));
 await test('FINAL: anonymous records get denied',()=>assertFails(getDoc(doc(anon,'users/alice/records/r1'))));
 await test('FINAL: other user records write denied',()=>assertFails(setDoc(doc(bob,'users/alice/records/r2'),{id:'r2'})));
 await test('FINAL: other user records list denied',()=>assertFails(getDocs(collection(bob,'users/alice/records'))));
 await test('FINAL: owner weather write',()=>assertSucceeds(setDoc(doc(alice,'users/alice/meets/meet1'),{key:'meet1',weather:'晴'})));
 await test('FINAL: owner division override write',()=>assertSucceeds(setDoc(doc(alice,'users/alice/settings/divOverrides'),{map:{'架空選手@架空高':'hs'}})));
 await test('FINAL: owner record delete',()=>assertSucceeds(deleteDoc(doc(alice,'users/alice/records/r1'))));
 await test('FINAL: Google user valid share create',()=>assertSucceeds(setDoc(doc(alice,path),mkShare())));
 await test('FINAL: valid share anonymous get',()=>assertSucceeds(getDoc(doc(anon,path))));
 await test('FINAL: valid share other user get',()=>assertSucceeds(getDoc(doc(bob,path))));
 await test('FINAL: anonymous list denied',()=>assertFails(getDocs(collection(anon,'shares'))));
 await test('FINAL: owner-filtered list also denied',()=>assertFails(getDocs(query(collection(alice,'shares'),where('ownerUid','==','alice')))));
 await test('FINAL: anonymous create denied',()=>assertFails(setDoc(doc(anon,'shares/Anon000001'),mkShare())));
 await test('FINAL: Firebase anonymous-auth create denied',()=>assertFails(setDoc(doc(anonymousAuth,'shares/Anon000002'),mkShare('anon'))));
 await test('FINAL: spoofed owner denied',()=>assertFails(setDoc(doc(alice,'shares/Spoof00001'),mkShare('bob'))));
 await test('FINAL: update denied even for owner',()=>assertFails(updateDoc(doc(alice,path),{data:'1.e31'})));
 await test('FINAL: other user delete denied',()=>assertFails(deleteDoc(doc(bob,path))));
 await test('FINAL: anonymous delete denied',()=>assertFails(deleteDoc(doc(anon,path))));
 const invalids=[
 ['bad length ID','short',{}],['bad alphabet ID','Invalid_01',{}],
 ['extra field','Extra00001',{x:1}],['non-string data','Type000001',{data:5}],
 ['empty data','Empty00001',{data:''}],['non-base64url data','Format0001',{data:'1.あ'}],
 ['missing owner','Missing001',{ownerUid:undefined}],['missing createdAt','Missing002',{createdAt:undefined}],
 ['client createdAt','Created001',{createdAt:Timestamp.fromMillis(Date.now()-10000)}],
 ['past expiry','Past000001',{expiresAt:Timestamp.fromMillis(Date.now()-10000)}],
 ['non-timestamp expiry','ExpType001',{expiresAt:'2027-01-01'}],
 ['excess expiry','TooLong001',{expiresAt:Timestamp.fromMillis(Date.now()+121*864e5)}],
 ['190001 chars','TooBig0001',{data:'1.'+'A'.repeat(189999)}]
 ];
 for(const [label,id,extra] of invalids){ const d=mkShare('alice',extra); for(const k of Object.keys(d)) if(d[k]===undefined)delete d[k]; await test('FINAL: '+label+' denied',()=>assertFails(setDoc(doc(alice,'shares',id),d))); }
 await test('FINAL: 190000 chars accepted',()=>assertSucceeds(setDoc(doc(alice,'shares/MaxSize001'),mkShare('alice',{data:'1.'+'A'.repeat(189998)}))));
 await test('FINAL: 4-min forward clock skew accepted',()=>assertSucceeds(setDoc(doc(alice,'shares/Clock00001'),mkShare('alice',{expiresAt:Timestamp.fromMillis(Date.now()+120*864e5+240000)}))));
 const seed=async(id,d)=>env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'shares',id),d));
 await seed('Expired001',{data:'1.e30',ownerUid:'alice',createdAt:Timestamp.fromMillis(Date.now()-130*864e5),expiresAt:Timestamp.fromMillis(Date.now()-10*864e5)});
 await seed('Cap1200001',{data:'1.e30',ownerUid:'alice',createdAt:Timestamp.fromMillis(Date.now()-121*864e5),expiresAt:Timestamp.fromMillis(Date.now()+864e5)});
 await seed('Missing003',{data:'1.e30',ownerUid:'alice',createdAt:Timestamp.now()});
 await test('FINAL: expired anonymous get denied',()=>assertFails(getDoc(doc(anon,'shares/Expired001'))));
 await test('FINAL: expired owner get denied',()=>assertFails(getDoc(doc(alice,'shares/Expired001'))));
 await test('FINAL: createdAt + 120 days ceiling enforced',()=>assertFails(getDoc(doc(anon,'shares/Cap1200001'))));
 await test('FINAL: missing expiry get denied',()=>assertFails(getDoc(doc(anon,'shares/Missing003'))));
 await test('FINAL: expired owner delete allowed',()=>assertSucceeds(deleteDoc(doc(alice,'shares/Expired001'))));
 await test('FINAL: valid owner delete allowed',()=>assertSucceeds(deleteDoc(doc(alice,path))));
 await test('FINAL: deleted link cannot be read',()=>assertFails(getDoc(doc(anon,path))));
 await test('FINAL: Google feedback accepted',()=>assertSucceeds(setDoc(doc(alice,'feedback/f1'),mkFeedback())));
 await test('FINAL: anonymous feedback denied',()=>assertFails(setDoc(doc(anon,'feedback/f2'),mkFeedback(null))));
 await test('FINAL: anonymous-auth feedback denied',()=>assertFails(setDoc(doc(anonymousAuth,'feedback/f3'),mkFeedback('anon'))));
 await test('FINAL: feedback UID spoof denied',()=>assertFails(setDoc(doc(alice,'feedback/f4'),mkFeedback('bob'))));
 await test('FINAL: feedback UID null denied',()=>assertFails(setDoc(doc(alice,'feedback/f5'),mkFeedback(null))));
 await test('FINAL: feedback empty body denied',()=>assertFails(setDoc(doc(alice,'feedback/f6'),mkFeedback('alice',{body:''}))));
 await test('FINAL: feedback 5001-char body denied',()=>assertFails(setDoc(doc(alice,'feedback/f7'),mkFeedback('alice',{body:'あ'.repeat(5001)}))));
 await test('FINAL: feedback invalid kind denied',()=>assertFails(setDoc(doc(alice,'feedback/f8'),mkFeedback('alice',{kind:'spam'}))));
 await test('FINAL: feedback oversized contact denied',()=>assertFails(setDoc(doc(alice,'feedback/f9'),mkFeedback('alice',{contact:'x'.repeat(201)}))));
 await test('FINAL: feedback extra field denied',()=>assertFails(setDoc(doc(alice,'feedback/f10'),mkFeedback('alice',{extra:1}))));
 await test('FINAL: feedback own get denied',()=>assertFails(getDoc(doc(alice,'feedback/f1'))));
 await test('FINAL: feedback list denied',()=>assertFails(getDocs(collection(alice,'feedback'))));
 await test('FINAL: feedback update denied',()=>assertFails(updateDoc(doc(alice,'feedback/f1'),{body:'changed'})));
 await test('FINAL: feedback delete denied',()=>assertFails(deleteDoc(doc(alice,'feedback/f1'))));
 await test('FINAL: unknown collection denied',()=>assertFails(setDoc(doc(alice,'unknown/u1'),{x:1})));
 await test('RESIDUAL（未対応・回数制限なし）: ログインした人は何件でも送れる',()=>assertSucceeds(setDoc(doc(alice,'feedback/repeated'),mkFeedback())));

 // v0.14：アプリが実際に書く形
 await test('APP: shares と users/{uid}/shareIndex を1回のまとめ書きで作れる（119日）',async()=>{const b=writeBatch(alice),exp=Timestamp.fromMillis(Date.now()+119*864e5);b.set(doc(alice,'shares/AppBatch01'),{data:'1.e30',ownerUid:'alice',createdAt:serverTimestamp(),expiresAt:exp});b.set(doc(alice,'users/alice/shareIndex/AppBatch01'),{createdAt:serverTimestamp(),expiresAt:exp,label:'大会：架空'});await assertSucceeds(b.commit());});
 await test('APP: 共有を止める（shares と一覧を一緒に消す）',async()=>{const b=writeBatch(alice);b.delete(doc(alice,'shares/AppBatch01'));b.delete(doc(alice,'users/alice/shareIndex/AppBatch01'));await assertSucceeds(b.commit());});
 await test('APP: ほかの人の shareIndex は読めない',()=>assertFails(getDocs(collection(bob,'users/alice/shareIndex'))));
 await test('APP: feedback.js が送る形（全項目）が通る',()=>assertSucceeds(setDoc(doc(alice,'feedback/app1'),mkFeedback('alice',{contact:'',page:'記録',version:'v0.14／記録 v0.6.0',ua:'x'.repeat(400),screen:'390x844（表示 390x844）',path:'/lane-note/records.html［全記録］'}))));
 // v0.24 → v0.25：選手とのやり取り（talks）。Astra 第3回監査 C301・C302・C303・C304・C307 の再現（T01〜T05・T08）を直した形で確かめる
 const T=k=>('Talk'+k).padEnd(20,'0').slice(0,20);
 const DAY=864e5, past=ms=>Timestamp.fromMillis(Date.now()-ms), fut=ms=>Timestamp.fromMillis(Date.now()+ms);
 const mkTalk=(uid='alice',extra={})=>({v:2,ownerUid:uid,name:'架空 一郎',note:'',noteAt:serverTimestamp(),active:true,closed:false,n:0,lastAt:serverTimestamp(),createdAt:serverTimestamp(),expiresAt:fut(119*DAY),...extra});
 const tseed=(tid,extra={})=>env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'talks/'+tid),{v:2,ownerUid:'alice',name:'架空',note:'',noteAt:Timestamp.now(),active:true,closed:false,n:0,lastAt:past(60e3),createdAt:Timestamp.now(),expiresAt:fut(DAY),...extra}));
 const seedMsg=(tid,mid,extra={})=>env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'talks/'+tid+'/msgs/'+mid),{from:'p',body:'前の',createdAt:Timestamp.now(),purgeAt:fut(DAY),...extra}));
 const setTeam=(uid,on)=>env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'users/'+uid+'/settings/talk'),{enabled:on}));
 // アプリと同じ投稿のしかた：数を読んで、msgs/m<n+1> と数の更新を1回のまとめ書き
 async function post(db,tid,from='p',extra={}){const s=await getDoc(doc(db,'talks/'+tid)),d=s.data(),n=d.n+1;const b=writeBatch(db);b.set(doc(db,'talks/'+tid+'/msgs/m'+n),{from,body:'架空の返信',createdAt:serverTimestamp(),purgeAt:d.expiresAt,...extra});b.update(doc(db,'talks/'+tid),{n,lastAt:serverTimestamp()});return b.commit();}
 async function rawMsg(db,tid,mid,data,counter){const b=writeBatch(db);b.set(doc(db,'talks/'+tid+'/msgs/'+mid),data);if(counter)b.update(doc(db,'talks/'+tid),counter);return b.commit();}
 await setTeam('alice',true);
 const TID=T('Main');
 await test('TALK: 顧問（Google）が作れる（v2・n=0・119日）',()=>assertSucceeds(setDoc(doc(alice,'talks/'+TID),mkTalk())));
 await test('TALK: ログインなし・匿名認証・他人名義では作れない',async()=>{await assertFails(setDoc(doc(anon,'talks/'+T('Anon1')),mkTalk('alice')));await assertFails(setDoc(doc(anonymousAuth,'talks/'+T('Anon2')),mkTalk('anon')));await assertFails(setDoc(doc(alice,'talks/'+T('Spoof')),mkTalk('bob')));});
 await test('TALK: 短いID・120日超・余計な項目・n≠0・closed・旧形式（v なし）は作れない',async()=>{await assertFails(setDoc(doc(alice,'talks/Short00001'),mkTalk()));await assertFails(setDoc(doc(alice,'talks/'+T('Long')),mkTalk('alice',{expiresAt:fut(130*DAY)})));await assertFails(setDoc(doc(alice,'talks/'+T('Extra')),mkTalk('alice',{x:1})));await assertFails(setDoc(doc(alice,'talks/'+T('N5')),mkTalk('alice',{n:5})));await assertFails(setDoc(doc(alice,'talks/'+T('Cl')),mkTalk('alice',{closed:true})));const o=mkTalk();delete o.v;await assertFails(setDoc(doc(alice,'talks/'+T('NoV')),o));});
 await test('TALK: リンクを知っていればログインなしで読める・一覧は不可',async()=>{await assertSucceeds(getDoc(doc(anon,'talks/'+TID)));await assertFails(getDocs(query(collection(alice,'talks'),where('ownerUid','==','alice'))));});
 await test('TALK: 選手（ログインなし）が返信できる（数を1つ増やすまとめ書き）',()=>assertSucceeds(post(anon,TID)));
 await test('C303: 3秒以内の連続投稿はサーバーが断る',()=>assertFails(post(anon,TID)));
 await test('C303: 数を増やさない投稿・数だけ増やす更新・番号の飛ばし・2つ増やすのは不可',async()=>{await tseed(T('Cnt'));await assertFails(setDoc(doc(anon,'talks/'+T('Cnt')+'/msgs/m1'),{from:'p',body:'x',createdAt:serverTimestamp(),purgeAt:fut(DAY)}));await assertFails(updateDoc(doc(anon,'talks/'+T('Cnt')),{n:1,lastAt:serverTimestamp()}));const s=(await getDoc(doc(anon,'talks/'+T('Cnt')))).data();await assertFails(rawMsg(anon,T('Cnt'),'m7',{from:'p',body:'x',createdAt:serverTimestamp(),purgeAt:s.expiresAt},{n:1,lastAt:serverTimestamp()}));await assertFails(rawMsg(anon,T('Cnt'),'m2',{from:'p',body:'x',createdAt:serverTimestamp(),purgeAt:s.expiresAt},{n:2,lastAt:serverTimestamp()}));await assertFails(rawMsg(anon,T('Cnt'),'mX',{from:'p',body:'x',createdAt:serverTimestamp(),purgeAt:s.expiresAt},{n:1,lastAt:serverTimestamp()}));});
 await test('C303: 1会話1000件で止まる',async()=>{await tseed(T('Cap'),{n:1000});await assertFails(post(anon,T('Cap')));await tseed(T('Cap2'),{n:999});await assertSucceeds(post(anon,T('Cap2')));});
 await test('C303: 一度に読めるのは50件まで（limit なし・51 は不可）',async()=>{await assertFails(getDocs(collection(anon,'talks/'+TID+'/msgs')));await assertFails(getDocs(query(collection(anon,'talks/'+TID+'/msgs'),orderBy('createdAt','desc'),limit(51))));await assertSucceeds(getDocs(query(collection(anon,'talks/'+TID+'/msgs'),orderBy('createdAt','desc'),limit(50))));});
 await test('C307: purgeAt は会話の期限と同じでないと不可',async()=>{await tseed(T('Pg'));await assertFails(post(anon,T('Pg'),'p',{purgeAt:fut(400*DAY)}));});
 await test('C302/C306: 体調メモ（cond）は v0.25 では受け付けない',async()=>{await tseed(T('Cond'));await assertFails(post(anon,T('Cond'),'p',{body:'x',cond:{d:'2026-10-12',s:4}}));});
 await test('TALK: 空・501文字は不可',async()=>{await tseed(T('Len'));await assertFails(post(anon,T('Len'),'p',{body:''}));await assertFails(post(anon,T('Len'),'p',{body:'あ'.repeat(501)}));});
 await test('TALK: 選手は先生のふり（from:t）不可・顧問本人は可・他人は不可',async()=>{await tseed(T('From'));await assertFails(post(anon,T('From'),'t'));await assertFails(post(bob,T('From'),'t'));await assertSucceeds(post(alice,T('From'),'t'));});
 await test('TALK: ないIDには書けない',()=>assertFails(rawMsg(anon,T('None'),'m1',{from:'p',body:'x',createdAt:serverTimestamp(),purgeAt:fut(DAY)},{n:1,lastAt:serverTimestamp()})));
 await test('TALK: メッセージは直せない・選手と他人は消せない・本体は誰も消せない',async()=>{await assertFails(updateDoc(doc(alice,'talks/'+TID+'/msgs/m1'),{body:'x'}));await assertFails(deleteDoc(doc(anon,'talks/'+TID+'/msgs/m1')));await assertFails(deleteDoc(doc(bob,'talks/'+TID+'/msgs/m1')));await assertFails(deleteDoc(doc(alice,'talks/'+TID)));});
 await test('TALK: ひとこと（500文字まで）・名前/期限/持ち主/数は顧問も変えられない',async()=>{await assertSucceeds(updateDoc(doc(alice,'talks/'+TID),{note:'次はスタート',noteAt:serverTimestamp()}));await assertFails(updateDoc(doc(alice,'talks/'+TID),{note:'あ'.repeat(501),noteAt:serverTimestamp()}));for(const p of [{name:'別'},{expiresAt:fut(119*DAY)},{ownerUid:'bob'},{n:0}])await assertFails(updateDoc(doc(alice,'talks/'+TID),p)).catch(e=>{throw new Error(JSON.stringify(p)+e.message)});await assertFails(updateDoc(doc(bob,'talks/'+TID),{note:'x',noteAt:serverTimestamp()}));await assertFails(updateDoc(doc(anon,'talks/'+TID),{active:false}));});
 await test('TALK: 停止中は選手が読めず書けない・顧問は読める・期限切れ/120日超も不可',async()=>{await tseed(T('Off'),{active:false});await seedMsg(T('Off'),'m1');await assertFails(getDoc(doc(anon,'talks/'+T('Off'))));await assertFails(getDocs(query(collection(anon,'talks/'+T('Off')+'/msgs'),limit(50))));await assertSucceeds(getDocs(query(collection(alice,'talks/'+T('Off')+'/msgs'),limit(50))));await tseed(T('Old'),{createdAt:past(130*DAY)});await assertFails(getDoc(doc(anon,'talks/'+T('Old'))));await tseed(T('Exp'),{expiresAt:past(1000)});await assertFails(post(anon,T('Exp')));});
 await test('C302: 旧形式（v0.24・v なし）の会話は選手が読めず書けない（顧問は読める）',async()=>{await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'talks/'+T('V1')),{ownerUid:'alice',name:'架空',note:'',noteAt:Timestamp.now(),active:true,createdAt:Timestamp.now(),expiresAt:fut(DAY)}));await assertFails(getDoc(doc(anon,'talks/'+T('V1'))));await assertSucceeds(getDoc(doc(alice,'talks/'+T('V1'))));});
 await test('C304（T01）: チーム全体をオフにすると選手は読めず書けない・オンで戻る',async()=>{await tseed(T('Team'));await setTeam('alice',false);await assertFails(getDoc(doc(anon,'talks/'+T('Team'))));await assertFails(post(anon,T('Team')));await env.withSecurityRulesDisabled(c=>deleteDoc(doc(c.firestore(),'users/alice/settings/talk')));await assertFails(getDoc(doc(anon,'talks/'+T('Team'))));await setTeam('alice',true);await assertSucceeds(getDoc(doc(anon,'talks/'+T('Team'))));});
 await test('C301（T04・T05）: 閉じる→投稿が止まる→メッセージを消せる→同じIDは誰も作り直せない',async()=>{const X=T('Del');await tseed(X);await seedMsg(X,'m1');
   await assertFails(updateDoc(doc(bob,'talks/'+X),{closed:true,active:false,name:'',note:''}));
   await assertFails(updateDoc(doc(alice,'talks/'+X),{closed:true,active:true,name:'',note:''}));
   await assertFails(updateDoc(doc(alice,'talks/'+X),{closed:true,active:false}));
   await assertSucceeds(updateDoc(doc(alice,'talks/'+X),{closed:true,active:false,name:'',note:''}));
   await assertFails(post(anon,X));await assertFails(post(alice,X,'t'));
   await assertSucceeds(deleteDoc(doc(alice,'talks/'+X+'/msgs/m1')));
   await assertFails(setDoc(doc(bob,'talks/'+X),mkTalk('bob')));
   await assertFails(setDoc(doc(alice,'talks/'+X),mkTalk('alice')));
   await assertFails(updateDoc(doc(alice,'talks/'+X),{closed:false,active:true}));
   await assertFails(updateDoc(doc(alice,'talks/'+X),{note:'x',noteAt:serverTimestamp()}));
   await assertFails(getDoc(doc(anon,'talks/'+X)));
   await assertFails(getDocs(query(collection(bob,'talks/'+X+'/msgs'),limit(50))));});
 await test('C301: 閉じたあとに残ったメッセージ（競合の残り）も顧問が後から消せる',async()=>{const X=T('Race');await tseed(X,{closed:true,active:false,name:'',note:''});await seedMsg(X,'m9');await assertSucceeds(deleteDoc(doc(alice,'talks/'+X+'/msgs/m9')));});
 await test('TALK: 顧問の設定と一覧（settings/talk・talkIndex）は本人だけ',async()=>{await assertSucceeds(setDoc(doc(alice,'users/alice/settings/talk'),{enabled:true}));await assertSucceeds(setDoc(doc(alice,'users/alice/talkIndex/'+TID),{name:'架空',closed:true,purged:false}));await assertFails(getDocs(collection(bob,'users/alice/talkIndex')));await assertFails(setDoc(doc(bob,'users/alice/settings/talk'),{enabled:false}));});
} finally { await env.cleanup(); }
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed?1:0);
