/* ===== v0.26.64 管理（admin.html）：作成者がチームの「名前だけ」を確かめる =====
   ・管理者かどうかは Firebase Auth の UID で決める（admins/{UID} の文書があるか。admins は Firebase コンソールでだけ作る。
     公開のコード・ルールには UID もメールアドレスも書かない）。
   ・チームの一覧（teams）はルールで管理者だけが読める。中の members・records・codes などは管理者でも読めない。
   ・画面に出すのはチーム名と件数だけ。ほかの欄（ownerUid・createdAt など）はすぐ捨てて、表示も保存もしない。 */
var LaneAdmin = (function () {
  var FB_VER = '10.14.1', FB = null, CFG = (typeof window !== 'undefined' && window.LANE_FIREBASE_CONFIG) || null;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // チームの文書から名前だけを取り出す（空・文字でないものは「（名前なし）」）。並びは名前の順（日本語の順）
  function teamNames(docs) {
    var names = (docs || []).map(function (d) { var n = d && d.name; return (typeof n === 'string' && n.trim()) ? n.trim() : '（名前なし）'; });
    return names.sort(function (a, b) { return a.localeCompare(b, 'ja'); });
  }
  function listHtml(names) {
    return '<p class="ad-count" id="adCount">登録チーム ' + names.length + '件</p>'
      + (names.length ? '<ol class="ad-list" id="adList">' + names.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ol>' : '<p>まだチームはありません。</p>');
  }
  async function loadFirebase() {
    if (FB) return FB;
    var base = 'https://www.gstatic.com/firebasejs/' + FB_VER + '/';
    var m = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
    var app = m[0].getApps().length ? m[0].getApp() : m[0].initializeApp(CFG);
    FB = { A: m[1], F: m[2], auth: m[1].getAuth(app), fs: m[2].getFirestore(app) };
    return FB;
  }
  function uidHtml(u) { return '<p>あなたのUID：</p><p class="ad-uid" id="adUid">' + esc(u.uid) + '</p>'; }
  async function show(u) {
    var out = $('adOut');
    $('adIn').hidden = !!u; $('adOut2').hidden = !u;
    if (!u) { out.innerHTML = '<p>Google でログインすると、あなたのUIDが出ます。管理者なら、登録チームの名前の一覧が出ます。</p>'; return; }
    var h = uidHtml(u);
    out.innerHTML = h + '<p>確かめています…</p>';
    var F = FB.F, admin = false;
    try { admin = (await F.getDoc(F.doc(FB.fs, 'admins', u.uid))).exists(); } catch (e) { admin = false; }
    if (!admin) {
      out.innerHTML = h + '<p id="adNot">このアカウントは管理者ではないため、チームの一覧は出ません。</p>'
        + '<p class="ad-note">管理者にするには、Firebase コンソールの Firestore で <code>admins</code> コレクションに、上のUIDを文書IDにした文書を作ってください（中身は空でかまいません）。</p>';
      return;
    }
    try {
      var snap = await F.getDocs(F.collection(FB.fs, 'teams')), docs = [];
      snap.forEach(function (d) { var v = d.data() || {}; docs.push({ name: v.name }); });   // 名前だけを残す
      out.innerHTML = h + listHtml(teamNames(docs));
    } catch (e) {
      out.innerHTML = h + '<p class="ad-err" id="adErr">チームの一覧を読めませんでした（' + esc((e && e.code) || (e && e.message) || e) + '）。Firestore のルールが v0.26.64 のものか確かめてください。</p>';
    }
  }
  async function start() {
    if (!CFG) { $('adOut').innerHTML = '<p class="ad-err">Firebase の設定（firebase-config.js）が読み込めませんでした。</p>'; return; }
    try { await loadFirebase(); } catch (e) { $('adOut').innerHTML = '<p class="ad-err">通信できませんでした。電波の良いところで開き直してください。</p>'; return; }
    $('adIn').onclick = async function () {
      try { await LaneAuth.signIn(FB); } catch (e) { $('adOut').innerHTML = '<p class="ad-err">' + esc(LaneAuth.errorText(e)) + '</p>'; }
    };
    $('adOut2').onclick = async function () { try { await FB.A.signOut(FB.auth); } catch (e) { } show(null); };
    FB.A.onAuthStateChanged(FB.auth, function (u) { show(u || null); });
  }
  if (typeof document !== 'undefined' && document.getElementById('adOut')) start();
  return { teamNames: teamNames, listHtml: listHtml, esc: esc };
})();
if (typeof module !== 'undefined') module.exports = LaneAdmin;
