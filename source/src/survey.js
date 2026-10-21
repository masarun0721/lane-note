/* ===== v0.28.0：📮 エントリー調査リンク
   ・大会ごとに、顧問が1つの調査リンクを作って LINE などで送る。選手はログインなしで開き、名簿から自分の名前を選び、
     第1・第2希望の種目・リレーに出られるか（可／不可）・ひとこと（100文字まで）を送る。送り直すと新しい答えに置きかわる
   ・Firestore：surveys/{sid}（公開：大会名・締切・名簿の名前と学年・男女・選べる種目とリレーだけ）、
     surveyAdmins/{sid}（非公開：持ち主の uid・チーム・選手のキー）、surveys/{sid}/answers/r<番号>（顧問とチームの顧問だけが読める）
   ・sid は推測できない24文字。締切を過ぎる・止める・消すと、受け付けない（ルールで止める）。expireAt はあとで TTL に使う
   ・記録や連絡先は入れない。名簿は顧問が選んだ名前と学年だけ */
var LaneSurvey = (function () {
  'use strict';
  var FB_VER = '10.14.1', CMMAX = 100, DAYS = 14, KEEP = 30, LKEY = 'lanenote.survey.v1';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function validId(s) { return /^[A-Za-z0-9]{24}$/.test(String(s || '')); }
  function newId() { var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', out = '', b = new Uint8Array(1); while (out.length < 24) { crypto.getRandomValues(b); if (b[0] < 248) out += A[b[0] % 62]; } return out; }
  function base() { if (typeof laneLinkBase === 'function') return laneLinkBase(); return /^https?:$/.test(location.protocol) ? location.origin + location.pathname.replace(/[^\/]*$/, '') : (window.SHARE_BASE || './'); }
  function linkFor(sid) { return base() + '?q=' + sid; }
  function ms(t) { return t && t.toMillis ? t.toMillis() : (typeof t === 'number' ? t : 0); }
  function isDay(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
  function jstDay(msv) { return new Date(msv + 9 * 36e5).toISOString().slice(0, 10); }
  // 締切の日（日本時間）の 23:59:59 まで
  function dayEnd(day) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], 14, 59, 59) : 0; }
  // 既定の締切：大会のエントリー締切（今日より後なら）、なければ今日から14日
  function defaultDeadline(planDeadline, now) {
    now = now || Date.now(); var td = jstDay(now);
    if (isDay(planDeadline) && planDeadline >= td && dayEnd(planDeadline) <= now + 119 * 864e5) return planDeadline;
    return jstDay(now + DAYS * 864e5);
  }
  function when(t) { var m = ms(t); if (!m) return ''; var d = new Date(m + 9 * 36e5); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + d.getUTCHours() + ':' + ('0' + d.getUTCMinutes()).slice(-2); }
  function dayLabel(t) { var m = ms(t); if (!m) return ''; var d = new Date(m + 9 * 36e5); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '（' + '日月火水木金土'[d.getUTCDay()] + '）'; }
  function sexName(s) { return s === 'f' ? '女子' : s === 'm' ? '男子' : ''; }
  function sexOfLabel(s) { return /^女子/.test(s) ? 'f' : /^男子/.test(s) ? 'm' : ''; }
  function evShort(s) { return String(s || '').replace(/^(男子|女子)\s*/, ''); }
  function cut(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n); }

  /* ---------- 調査の中身（純粋な関数・テスト用にも使う） ---------- */
  // o = { meet, team, sexes:'m'|'f'|'mf', roster:[{n,g,s,key}], evs:['男子100m',...], rels:['男子4×100mR'], deadline:'YYYY-MM-DD' }
  function buildDocs(o, now) {
    now = now || Date.now();
    var roster = (o.roster || []).slice(0, 150).map(function (r) { return { n: cut(r.n, 40), g: cut(r.g, 4), s: r.s === 'f' ? 'f' : 'm' }; });
    var akeys = (o.roster || []).slice(0, 150).map(function (r) { return cut(r.key, 200); });
    var uniq = function (l, n) { var seen = {}, out = []; (l || []).forEach(function (x) { x = cut(x, 40); if (x && !seen[x]) { seen[x] = 1; out.push(x); } }); return out.slice(0, n); };
    var evs = uniq(o.evs, 40), rels = uniq(o.rels, 6), dl = dayEnd(o.deadline);
    if (!roster.length) throw new Error('名簿に1人以上入れてください');
    if (!evs.length) throw new Error('選べる種目を1つ以上入れてください');
    if (!dl || dl <= now) throw new Error('締切は今日より後の日にしてください');
    if (dl > now + 119 * 864e5) throw new Error('締切は119日以内にしてください');
    var meet = cut(o.meet, 80); if (!meet) throw new Error('大会名を入れてください');
    var sexes = o.sexes === 'f' || o.sexes === 'mf' ? o.sexes : 'm';
    // v0.28.2 種類：official（希望を聞く・公式戦）／kiroku（出る種目・記録会）。relayAsk：リレーを聞くか（はじめは公式戦は聞く・記録会は聞かない）
    var kind = o.kind === 'kiroku' ? 'kiroku' : 'official', relayAsk = o.relayAsk == null ? kind === 'official' : !!o.relayAsk;
    return { pub: { v: 1, meet: meet, sexes: sexes, roster: roster, n: roster.length, evs: evs, rels: rels, kind: kind, relayAsk: relayAsk, open: true, deadlineMs: dl, expireMs: dl + KEEP * 864e5 },
      admin: { team: cut(o.team, 20), meet: meet, akeys: akeys, expireMs: dl + KEEP * 864e5 } };
  }
  // 選手の答えをきれいにする（ルールと同じ条件。だめなら理由を返す）
  function cleanAnswer(a, s) {
    a = a || {}; var evs = (s && s.evs) || [], rels = (s && s.rels) || [];
    var o = { ev1: cut(a.ev1, 40), ev2: cut(a.ev2, 40), relay: a.relay === 'ok' || a.relay === 'no' ? a.relay : '', rel: cut(a.rel, 40), cm: cut(a.cm, CMMAX) };
    if (o.ev1 && evs.indexOf(o.ev1) < 0) return { err: '第1希望の種目が選べる種目にありません' };
    if (!o.ev1) o.ev2 = '';
    if (o.ev2 && (evs.indexOf(o.ev2) < 0 || o.ev2 === o.ev1)) return { err: '第2希望は第1希望とちがう種目にしてください' };
    if (!rels.length) { o.relay = ''; o.rel = ''; }
    if (o.relay !== 'ok') o.rel = '';
    if (o.rel && rels.indexOf(o.rel) < 0) o.rel = '';
    // v0.28.2 出場する／しない（join）。しないなら希望とリレーは空にして、ひとこと（理由など）だけでも送れる。join の無い古い答えは「出場する」
    if (a.join === false) { o.ev1 = o.ev2 = o.relay = o.rel = ''; o.join = false; return { ok: o }; }
    if (a.join === true) o.join = true;
    if (!o.ev1 && !o.relay && !o.cm) return { err: '種目かリレーのどちらかを選んでください' };
    return { ok: o };
  }

  /* ---------- Firebase ---------- */
  var FBP = null;
  async function fb() {   // 選手側：ログインなしで Firestore だけ使う
    if (FBP) return FBP;
    var CFG = window.LANE_FIREBASE_CONFIG; if (!CFG || !CFG.apiKey || /^YOUR_|^__/.test(CFG.apiKey)) throw new Error('クラウドが設定されていません');
    var b = 'https://www.gstatic.com/firebasejs/' + FB_VER + '/';
    var m = await Promise.all([import(b + 'firebase-app.js'), import(b + 'firebase-firestore.js')]);
    var app = m[0].getApps().length ? m[0].getApp() : m[0].initializeApp(CFG);
    FBP = { F: m[1], fs: m[1].getFirestore(app) };
    return FBP;
  }
  function setFirebase(x) { FBP = x; }   // テスト用

  // 顧問側：FB={F,fs}・uid（Google ログイン）・check() は呼ぶ側の「アカウントが変わっていないか」の確認
  function coach(FB, uid, check) {
    if (!uid) throw new Error('Googleでログインすると使えます');
    var F = FB.F, fs = FB.fs, ok = check || function () { };
    var TS = function (m) { return F.Timestamp.fromMillis(m); };
    async function answers(sid) {
      var s = await F.getDocs(F.collection(fs, 'surveys', sid, 'answers')); ok(); var out = {};
      s.forEach(function (d) { var m = /^r(\d{1,3})$/.exec(d.id); if (!m) return; var v = d.data() || {}; out[+m[1]] = { ev1: String(v.ev1 || ''), ev2: String(v.ev2 || ''), relay: String(v.relay || ''), rel: String(v.rel || ''), cm: String(v.cm || ''), join: v.join !== false, at: ms(v.at) }; });
      return out;
    }
    return {
      create: async function (o) {
        var D = buildDocs(o), sid = newId(), b = F.writeBatch(fs), p = D.pub;
        b.set(F.doc(fs, 'surveys', sid), { v: 1, meet: p.meet, sexes: p.sexes, roster: p.roster, n: p.n, evs: p.evs, rels: p.rels, kind: p.kind, relayAsk: p.relayAsk, open: true, deadline: TS(p.deadlineMs), expireAt: TS(p.expireMs), updatedAt: F.serverTimestamp() });
        b.set(F.doc(fs, 'surveyAdmins', sid), { ownerUid: uid, team: D.admin.team, meet: p.meet, akeys: D.admin.akeys, createdAt: F.serverTimestamp(), expireAt: TS(p.expireMs) });
        ok(); await b.commit(); ok(); return sid;
      },
      // 自分の調査と、チームの調査（teamId があれば）
      list: async function (teamId) {
        var qs = [F.query(F.collection(fs, 'surveyAdmins'), F.where('ownerUid', '==', uid))];
        if (teamId) qs.push(F.query(F.collection(fs, 'surveyAdmins'), F.where('team', '==', teamId)));
        var rs = await Promise.all(qs.map(function (q) { return F.getDocs(q); })); ok();
        var seen = {}, out = [];
        rs.forEach(function (s) { s.forEach(function (d) { if (seen[d.id]) return; seen[d.id] = 1; var v = d.data() || {}; out.push({ id: d.id, meet: String(v.meet || ''), team: String(v.team || ''), mine: v.ownerUid === uid, at: ms(v.createdAt), exp: ms(v.expireAt) }); }); });
        return out.sort(function (a, b) { return b.at - a.at; });
      },
      load: async function (sid) {
        var r = await Promise.all([F.getDoc(F.doc(fs, 'surveys', sid)), F.getDoc(F.doc(fs, 'surveyAdmins', sid))]); ok();
        if (!r[0].exists() || !r[1].exists()) return null;
        var s = r[0].data() || {}, a = r[1].data() || {};
        return { id: sid, meet: String(s.meet || ''), sexes: s.sexes, roster: s.roster || [], evs: s.evs || [], rels: s.rels || [], kind: s.kind === 'kiroku' ? 'kiroku' : 'official', relayAsk: s.relayAsk !== false, open: !!s.open, deadline: ms(s.deadline), expireAt: ms(s.expireAt), akeys: a.akeys || [], team: String(a.team || ''), mine: a.ownerUid === uid };
      },
      answers: answers,
      setOpen: async function (sid, on) { await F.updateDoc(F.doc(fs, 'surveys', sid), { open: !!on, updatedAt: F.serverTimestamp() }); ok(); },
      setDeadline: async function (sid, day) {
        var dl = dayEnd(day); if (!dl || dl <= Date.now()) throw new Error('締切は今日より後の日にしてください');
        if (dl > Date.now() + 119 * 864e5) throw new Error('締切は119日以内にしてください');
        var b = F.writeBatch(fs);
        b.update(F.doc(fs, 'surveys', sid), { deadline: TS(dl), expireAt: TS(dl + KEEP * 864e5), updatedAt: F.serverTimestamp() });
        b.update(F.doc(fs, 'surveyAdmins', sid), { expireAt: TS(dl + KEEP * 864e5) });
        ok(); await b.commit(); ok();
      },
      // 消す：回答 → 調査 → 管理の文書を1回のまとめ書きで（名簿150人＋2で500件の上限より小さい）
      remove: async function (sid) {
        var s = await F.getDocs(F.collection(fs, 'surveys', sid, 'answers')); ok();
        var b = F.writeBatch(fs);
        s.forEach(function (d) { b.delete(d.ref || F.doc(fs, 'surveys', sid, 'answers', d.id)); });
        b.delete(F.doc(fs, 'surveys', sid)); b.delete(F.doc(fs, 'surveyAdmins', sid));
        await b.commit(); ok();
      }
    };
  }
  // 選手側：調査を読む（受付中・締切前だけ読める）・答えを送る（同じ番号に上書き＝新しい答えに置きかわる）
  function student(FB) {
    var F = FB.F, fs = FB.fs;
    return {
      load: async function (sid) {
        if (!validId(sid)) return null;
        var d; try { d = await F.getDoc(F.doc(fs, 'surveys', sid)); } catch (e) { if (e && e.code === 'permission-denied') return null; throw e; }
        if (!d.exists()) return null;
        var s = d.data() || {}; if (!s.open || ms(s.deadline) <= Date.now()) return null;
        return { id: sid, meet: String(s.meet || ''), sexes: s.sexes, roster: (s.roster || []).map(function (r) { return { n: String(r && r.n || ''), g: String(r && r.g || ''), s: r && r.s === 'f' ? 'f' : 'm' }; }), evs: (s.evs || []).map(String), rels: s.relayAsk === false ? [] : (s.rels || []).map(String), kind: s.kind === 'kiroku' ? 'kiroku' : 'official', deadline: ms(s.deadline), expireAt: s.expireAt };
      },
      send: async function (s, idx, a) {
        var c = cleanAnswer(a, s); if (c.err) { var e = new Error(c.err); e.code = 'invalid'; throw e; }
        if (!(idx >= 0 && idx < s.roster.length)) { var e2 = new Error('名前を選んでください'); e2.code = 'invalid'; throw e2; }
        var o = c.ok, w = { ev1: o.ev1, ev2: o.ev2, relay: o.relay, rel: o.rel, cm: o.cm, at: F.serverTimestamp(), expireAt: s.expireAt }; if (o.join != null) w.join = o.join;
        await F.setDoc(F.doc(fs, 'surveys', s.id, 'answers', 'r' + idx), w);
        return o;
      }
    };
  }

  /* ---------- 答えをエントリー下書きに入れる（下書きのルールと警告はそのまま） ---------- */
  // E=LaneEntry, d=E.data(...), plan, sv={roster,akeys,evs,rels}, ans={idx:answer}
  function apply(E, d, plan, sv, ans) {
    var res = { picks: 0, relay: 0, skip: [], out: [] }, maxLeg = (plan.rules && plan.rules.maxLeg) || 6;
    var evKey = function (a, label) {
      var own = a.events.filter(function (e) { return sexName(a.sex || e.sex) + e.label === label; })[0]; if (own) return own.ev;
      var g = d.events.filter(function (e) { return sexName(e.sex) + e.label === label; })[0]; return g ? g.ev : '';
    };
    Object.keys(ans || {}).forEach(function (i) {
      var x = ans[i], k = (sv.akeys || [])[+i], a = k && d.byKey[k], nm = ((sv.roster || [])[+i] || {}).n || '';
      if (x.join === false) { res.out.push(nm); return; }   // v0.28.2 出場しない人は下書きに入れない（参加料にも数えない）
      if (!a) { res.skip.push(nm + '：記録帳に見つかりません'); return; }
      [x.ev1, x.ev2].forEach(function (lb) {
        if (!lb) return; var ev = evKey(a, lb);
        if (!ev) { res.skip.push(nm + '：' + evShort(lb) + 'は記録帳に無い種目です（手で入れてください）'); return; }
        var pk = plan.picks[a.key] || (plan.picks[a.key] = []); if (pk.indexOf(ev) < 0) { pk.push(ev); res.picks++; }
      });
      if (x.relay !== 'ok') return;
      var rl = d.relays.filter(function (r) { return x.rel ? sexName(r.sex) + r.label === x.rel : r.sex === a.sex; });
      if (rl.length !== 1) { res.skip.push(nm + '：リレー（' + (x.rel ? evShort(x.rel) : 'どのリレーか未定') + '）は手で入れてください'); return; }
      var ts = plan.relays[rl[0].ev] || (plan.relays[rl[0].ev] = []);
      if (ts.some(function (t) { return (t.members || []).indexOf(a.key) >= 0; })) return;
      var t = ts.filter(function (t) { return (t.members || []).filter(Boolean).length < maxLeg; })[0];
      if (!t) { t = { label: String.fromCharCode(65 + ts.length), members: [] }; ts.push(t); }
      var j = t.members.indexOf(''); if (j >= 0 && j < maxLeg) t.members[j] = a.key; else t.members.push(a.key);
      res.relay++;
    });
    return res;
  }

  /* ---------- 選手の画面（index.html?q=<sid>） ---------- */
  function lsGet() { try { var o = JSON.parse(localStorage.getItem(LKEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function lsSet(sid, i) { try { var o = lsGet(); o[sid] = { i: i, at: Date.now() }; Object.keys(o).forEach(function (k) { if (!validId(k) || Date.now() - (o[k].at || 0) > 120 * 864e5) delete o[k]; }); localStorage.setItem(LKEY, JSON.stringify(o)); } catch (e) { } }
  function renderStudent(box, s, st) {
    var me = st.i != null ? s.roster[st.i] : null, sx = me ? me.s : '', h = '';
    h += '<div class="ph-hero sv-hero"><small>LANE NOTE ・ エントリー調査</small><h2>' + esc(s.meet) + '</h2><p>締切 ' + esc(dayLabel(s.deadline)) + ' ' + esc(when(s.deadline)) + 'まで <button type="button" class="sv-q" data-sv="help" aria-expanded="' + !!st.help + '" title="使い方">?</button></p></div>';
    if (st.help) h += '<div class="sv-help">自分の名前を選んで、出たい種目（第1・第2希望）とリレーに出られるかを送ります。ログインは要りません。送り直すと、新しい答えに置きかわります。最後は先生が決めます。答えは先生だけが見られます。</div>';
    if (st.msg) h += '<div class="sv-msg ' + (st.cls || '') + '" role="status">' + esc(st.msg) + '</div>';
    h += '<section class="sv-card"><h3><span class="sv-n">1</span>名前</h3>';
    if (s.sexes === 'mf') h += '<div class="sv-sex">' + ['m', 'f'].map(function (x) { return '<button type="button" class="sv-tab" data-svsex="' + x + '" aria-pressed="' + ((st.sex || 'm') === x) + '">' + sexName(x) + '</button>'; }).join('') + '</div>';
    var showSex = s.sexes === 'mf' ? (st.sex || 'm') : s.sexes;
    h += '<div class="sv-names">' + s.roster.map(function (r, i) { return r.s !== showSex ? '' : '<button type="button" class="sv-name" data-svme="' + i + '" aria-pressed="' + (st.i === i) + '">' + esc(r.n) + (r.g ? '<small>' + esc(r.g) + '年</small>' : '') + '</button>'; }).join('') + '</div></section>';
    if (me) {
      var so = typeof ResultParser !== 'undefined' && ResultParser.sortEvents ? ResultParser.sortEvents : function (l) { return l; };   // v0.28.5 前に作った調査も標準の順で
      var evs = so(s.evs.filter(function (e) { return !sexOfLabel(e) || sexOfLabel(e) === sx; })), rels = s.rels.filter(function (e) { return !sexOfLabel(e) || sexOfLabel(e) === sx; });
      var chips = function (k, cur, dis) { return '<div class="sv-chips">' + evs.map(function (e) { return '<button type="button" class="sv-chip" data-sv' + k + '="' + esc(e) + '" aria-pressed="' + (cur === e) + '"' + (dis === e ? ' disabled' : '') + '>' + esc(evShort(e)) + '</button>'; }).join('') + '</div>'; };
      h += '<section class="sv-card sv-join"><h3><span class="sv-n">2</span>出場</h3><div class="sv-chips">' + [[true, '出場する'], [false, '出場しない']].map(function (x) { return '<button type="button" class="sv-chip" data-svjoin="' + (x[0] ? '1' : '0') + '" aria-pressed="' + (st.join === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div></section>';
      if (st.join === true) {
      var kr = s.kind === 'kiroku';   // v0.28.2 記録会は「1種目目・2種目目」
      h += '<section class="sv-card"><h3><span class="sv-n">3</span>' + (kr ? '1種目目' : '第1希望') + '</h3>' + chips('ev1', st.ev1) + '</section>';
      if (st.ev1) h += '<section class="sv-card"><h3><span class="sv-n">4</span>' + (kr ? '2種目目' : '第2希望') + ' <small>（なければ空のまま）</small></h3>' + chips('ev2', st.ev2, st.ev1) + '</section>';
      if (rels.length) {
        h += '<section class="sv-card"><h3><span class="sv-n">' + (st.ev1 ? 5 : 4) + '</span>リレー</h3><div class="sv-chips">' + [['ok', '出られる（可）'], ['no', '出られない（不可）']].map(function (x) { return '<button type="button" class="sv-chip" data-svrelay="' + x[0] + '" aria-pressed="' + (st.relay === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
        if (st.relay === 'ok' && rels.length > 1) h += '<div class="sv-chips sv-sub">' + rels.map(function (e) { return '<button type="button" class="sv-chip" data-svrel="' + esc(e) + '" aria-pressed="' + (st.rel === e) + '">' + esc(evShort(e)) + '</button>'; }).join('') + '</div>';
        h += '</section>';
      }
      }
      if (st.join != null) h += '<section class="sv-card"><h3>ひとこと <small>（なくてOK・' + CMMAX + '文字まで）</small></h3><textarea id="svCm" maxlength="' + CMMAX + '" rows="2" placeholder="' + (st.join ? '例：800mも考えています' : '理由など（なくてOK）') + '">' + esc(st.cm || '') + '</textarea><div class="sv-cnt"><span id="svCnt">' + (st.cm || '').length + '</span>/' + CMMAX + '</div></section>';
      if (st.join != null) h += '<button type="button" class="btn sv-send" data-sv="send"' + (st.busy ? ' disabled' : '') + '>' + (st.sent ? '📮 送り直す' : '📮 送る') + '</button>';
    }
    box.innerHTML = h;
  }
  function initLink() {
    var m = /[?&]q=([A-Za-z0-9]{24})(?:&|$)/.exec(location.search), sec = document.getElementById('surveyView');
    if (!m || !sec) return false;
    var sid = m[1], box = document.getElementById('svBody'), st = { help: false }, S = null;
    document.body.classList.add('survey-mode'); sec.hidden = false; document.title = 'エントリー調査';
    box.innerHTML = '<p class="sv-wait">読み込んでいます…</p>';
    var gone = function () { box.innerHTML = '<div class="sv-gone"><b>この調査は今は受け付けていません。</b><br>締切を過ぎたか、先生が止めたか、削除されました。必要なら先生に聞いてください。</div>'; };
    var draw = function () { renderStudent(box, S, st); };
    (async function () {
      try { var api = student(await fb()); S = await api.load(sid); if (!S) { gone(); return; } var keep = lsGet()[sid]; if (keep && keep.i >= 0 && keep.i < S.roster.length) { st.i = keep.i; st.sex = S.roster[keep.i].s; } draw(); sec.__api = api; }
      catch (e) { box.innerHTML = '<div class="sv-gone"><b>読み込めませんでした。</b><br>電波のよいところで、もう一度開いてください。</div>'; }
    })();
    box.addEventListener('input', function (e) { if (e.target.id === 'svCm') { st.cm = e.target.value.slice(0, CMMAX); var c = document.getElementById('svCnt'); if (c) c.textContent = st.cm.length; } });
    box.addEventListener('click', async function (e) {
      var t = e.target.closest ? e.target.closest('button') : null; if (!t || !S) return;
      var g = function (k) { return t.getAttribute(k); };
      if (g('data-sv') === 'help') { st.help = !st.help; draw(); return; }
      if (g('data-svsex')) { st.sex = g('data-svsex'); draw(); return; }
      if (g('data-svme') != null) { var i = +g('data-svme'); if (st.i !== i) { st.i = i; st.ev1 = st.ev2 = st.relay = st.rel = ''; st.join = null; st.sent = false; } st.msg = ''; draw(); return; }
      if (g('data-svjoin') != null) { st.join = g('data-svjoin') === '1'; if (!st.join) st.ev1 = st.ev2 = st.relay = st.rel = ''; st.msg = ''; draw(); return; }
      if (g('data-svev1') != null) { st.ev1 = st.ev1 === g('data-svev1') ? '' : g('data-svev1'); if (st.ev2 === st.ev1 || !st.ev1) st.ev2 = ''; draw(); return; }
      if (g('data-svev2') != null) { st.ev2 = st.ev2 === g('data-svev2') ? '' : g('data-svev2'); draw(); return; }
      if (g('data-svrelay')) { st.relay = st.relay === g('data-svrelay') ? '' : g('data-svrelay'); if (st.relay !== 'ok') st.rel = ''; draw(); return; }
      if (g('data-svrel') != null) { st.rel = st.rel === g('data-svrel') ? '' : g('data-svrel'); draw(); return; }
      if (g('data-sv') === 'send') {
        st.busy = true; st.msg = ''; draw();
        try { if (st.join == null) { var je = new Error('出場するかどうかを選んでください'); je.code = 'invalid'; throw je; }
          await sec.__api.send(S, st.i, { join: st.join, ev1: st.ev1, ev2: st.ev2, relay: st.relay, rel: st.rel, cm: st.cm }); lsSet(sid, st.i); st.sent = true; st.msg = '✔ 送りました（' + when(Date.now()) + '）。直したいときは、もう一度送ると新しい答えに置きかわります。'; st.cls = 'ok'; }
        catch (er) { st.msg = er && er.code === 'invalid' ? er.message : er && er.code === 'permission-denied' ? '送れませんでした。締切を過ぎたか、続けて送りすぎです（5秒あけてください）。' : '送れませんでした。電波のよいところで、もう一度押してください。'; st.cls = 'err'; }
        st.busy = false; draw(); var mm = box.querySelector('.sv-msg'); if (mm && mm.scrollIntoView) mm.scrollIntoView({ block: 'nearest' });
      }
    });
    return true;
  }
  return { validId: validId, newId: newId, linkFor: linkFor, buildDocs: buildDocs, cleanAnswer: cleanAnswer, coach: coach, student: student, apply: apply, fb: fb, setFirebase: setFirebase, initLink: initLink, renderStudent: renderStudent,
    defaultDeadline: defaultDeadline, dayEnd: dayEnd, jstDay: jstDay, when: when, dayLabel: dayLabel, sexName: sexName, evShort: evShort, esc: esc, CMMAX: CMMAX, KEEP: KEEP };
})();
if (typeof module !== 'undefined') module.exports = LaneSurvey;
