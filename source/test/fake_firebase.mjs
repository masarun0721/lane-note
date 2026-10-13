// 画面のテスト・スクショ用の「偽の Firebase」（ブラウザの中だけで動く・外には一切つながない）。権限のルールは無い（ルールはエミュレーターで別に確かめる）
// データは localStorage の __fakedb に置く（ページを開き直しても残る）。ログイン中の人は localStorage の __fakeuser
export const FAKE_APP = 'export const getApps=()=>[];export const getApp=()=>({});export const initializeApp=()=>({});';
export const FAKE_AUTH = `
const U=()=>{try{return JSON.parse(localStorage.getItem('__fakeuser')||'null')}catch(e){return null}};
export const getAuth=()=>({get currentUser(){return U()},authStateReady:async()=>{}});
export const onAuthStateChanged=(a,cb)=>{window.__fakeAuthCb=u=>{if(u)localStorage.setItem('__fakeuser',JSON.stringify(u));else localStorage.removeItem('__fakeuser');cb(u)};setTimeout(()=>cb(U()),0);return()=>{}};
export class GoogleAuthProvider{setCustomParameters(){}};
export const signInWithPopup=async()=>{throw Object.assign(new Error('fake'),{code:'auth/popup-closed-by-user'})};
export const signOut=async()=>{localStorage.removeItem('__fakeuser')};
export const getRedirectResult=async()=>null;`;
export const FAKE_FS = `
export class Timestamp{constructor(s,n){this.seconds=s;this.nanoseconds=n||0}toMillis(){return this.seconds*1000+Math.floor(this.nanoseconds/1e6)}toDate(){return new Date(this.toMillis())}static fromMillis(ms){return new Timestamp(Math.floor(ms/1000),(ms%1000)*1e6)}static now(){return Timestamp.fromMillis(Date.now())}}
const SV={sv:1},DEL={del:1};
export const serverTimestamp=()=>SV;export const deleteField=()=>DEL;export const increment=n=>({inc:n});
function enc(v){if(v instanceof Timestamp)return{__ts:v.toMillis()};if(Array.isArray(v))return v.map(enc);if(v&&typeof v==='object'){const o={};for(const k in v)o[k]=enc(v[k]);return o}return v}
function dec(v){if(v&&typeof v==='object'&&'__ts'in v)return Timestamp.fromMillis(v.__ts);if(Array.isArray(v))return v.map(dec);if(v&&typeof v==='object'){const o={};for(const k in v)o[k]=dec(v[k]);return o}return v}
const load=()=>{try{return JSON.parse(localStorage.getItem('__fakedb')||'{}')}catch(e){return{}}};const save=d=>localStorage.setItem('__fakedb',JSON.stringify(d));
function res(v,now,old){if(v===SV)return now;if(v&&v.inc!=null&&Object.keys(v).length===1)return(old||0)+v.inc;if(Array.isArray(v))return v.map(x=>res(x,now));if(v&&typeof v==='object'&&!(v instanceof Timestamp)){const o={};for(const k in v)if(v[k]!==DEL)o[k]=res(v[k],now,old&&old[k]);return o}return v}
const P=a=>a.join('/');
export const getFirestore=()=>({});
export function doc(base,...p){const pre=base&&base.__col?base.path:[];if(base&&base.__col&&!p.length)p=[Math.random().toString(36).slice(2,22)];const path=[...pre,...p].join('/').split('/');return{__doc:1,path,id:path[path.length-1],get parent(){return collection({},...path.slice(0,-1))}}}
export function collection(base,...p){const pre=base&&base.__doc?base.path:[];const path=[...pre,...p].join('/').split('/');return{__col:1,path,id:path[path.length-1]}}
export const orderBy=(f,d)=>({k:'o',f,d:d||'asc'});export const limit=n=>({k:'l',n});export const startAfter=s=>({k:'s',s});export const where=(f,op,v)=>({k:'w',f,op,v});
export function query(c,...q){return{__col:1,path:c.path,q}}
function snap(path,d){const v=d[P(path)];return{id:path[path.length-1],ref:doc({},...path),exists:()=>v!==undefined,data:()=>v===undefined?undefined:dec(v)}}
export async function getDoc(r){return snap(r.path,load())}export const getDocFromServer=getDoc;
export async function getDocs(c){const d=load(),n=c.path.length;let list=Object.keys(d).filter(k=>{const s=k.split('/');return s.length===n+1&&P(s.slice(0,n))===P(c.path)}).map(k=>snap(k.split('/'),d));
 for(const q of c.q||[]){if(q.k==='o')list.sort((a,b)=>{const x=dec(d[P(a.ref.path)])[q.f],y=dec(d[P(b.ref.path)])[q.f];const xv=x&&x.toMillis?x.toMillis():x,yv=y&&y.toMillis?y.toMillis():y;return(xv<yv?-1:xv>yv?1:0)*(q.d==='desc'?-1:1)});if(q.k==='s'){const i=list.findIndex(x=>x.id===q.s.id);list=list.slice(i+1)}if(q.k==='l')list=list.slice(0,q.n)}
 return{docs:list,size:list.length,empty:!list.length,forEach:f=>list.forEach(f),metadata:{fromCache:false}}}
export const getDocsFromServer=getDocs;
function apply(d,ops){const now=Timestamp.now();for(const o of ops){const k=P(o.r.path);if(o.t==='del'){delete d[k];continue}const old=d[k]?dec(d[k]):undefined;if(o.t==='upd'&&!old)throw Object.assign(new Error('not found'),{code:'not-found'});let v=res(o.v,now,old);if(o.t==='upd'||o.m){v=Object.assign({},old||{},v);for(const f in o.v)if(o.v[f]===DEL)delete v[f]}d[k]=enc(v)}}
export async function setDoc(r,v,opt){const d=load();apply(d,[{t:'set',r,v,m:opt&&opt.merge}]);save(d)}
export async function updateDoc(r,v){const d=load();apply(d,[{t:'upd',r,v}]);save(d)}
export async function deleteDoc(r){const d=load();apply(d,[{t:'del',r}]);save(d)}
export function writeBatch(){const ops=[];return{set(r,v,opt){ops.push({t:'set',r,v,m:opt&&opt.merge});return this},update(r,v){ops.push({t:'upd',r,v});return this},delete(r){ops.push({t:'del',r});return this},async commit(){const d=load();apply(d,ops);save(d)}}}
export const enableIndexedDbPersistence=async()=>{};export const initializeFirestore=()=>({});`;
// ページに差し込む：gstatic の firebase-*.js をこの偽物で返し、外への通信は止める
export function install(p, B) {
  const FAKE = { 'firebase-app.js': FAKE_APP, 'firebase-auth.js': FAKE_AUTH, 'firebase-firestore.js': FAKE_FS };
  p.on('request', r => { const u = r.url(), m = /gstatic\.com\/firebasejs\/[^/]+\/(firebase-[a-z]+\.js)$/.exec(u);
    if (m && FAKE[m[1]]) r.respond({ status: 200, contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAKE[m[1]] });
    else if (u.startsWith(B)) r.continue(); else r.abort(); });
}
