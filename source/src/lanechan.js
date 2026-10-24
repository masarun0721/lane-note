/* v0.29.2 レーンちゃん（どのページにも小さく出る。押す所はふさがない・今までの動きは変えない）
   ① 見出しのロゴの横に小さな顔（押すとマニュアル） ② 「まだ〜ありません」の所に小さな顔
   ③ 「✔ 〜しました」などが出たら、右下に数秒だけグッド／すやすや（押せない・自分で消える） */
(function () {
  'use strict';
  if (window.__laneChan) return; window.__laneChan = 1;
  var IMG = { explain: '__LC_explain__', thumbs: '__LC_thumbs__', sleep: '__LC_sleep__' };
  var css = '.lc-av{display:inline-flex;align-items:center;gap:6px;margin-left:8px;padding:2px 10px 2px 2px;border-radius:999px;background:#fff;color:#1f3a68;text-decoration:none;font-size:12px;font-weight:700;line-height:1.2;white-space:nowrap;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .15s,background .15s;vertical-align:middle}.lc-av:hover{transform:translateY(-1px);background:#fff4ec}.lc-av:hover img{transform:rotate(-8deg)}' +
    '.lc-av img{width:30px;height:30px;border-radius:50%;background:#fff;object-fit:cover;flex:none;transition:transform .15s}.lc-av span{position:relative}' +
    '@media (max-width:420px){.lc-av{font-size:11px;padding-right:8px;gap:4px;margin-left:6px}.lc-av img{width:26px;height:26px}}' +
    '.lc-ei{width:26px;height:26px;border-radius:50%;border:1.5px solid #1f3a68;background:#fff;object-fit:cover;vertical-align:middle;margin:0 6px 0 0}' +
    '#lcToast{position:fixed;right:12px;bottom:14px;z-index:9990;display:flex;align-items:center;gap:8px;background:#fff;border:2px solid #1f3a68;border-radius:16px;padding:5px 14px 5px 5px;box-shadow:0 4px 14px rgba(0,0,0,.18);pointer-events:none;opacity:0;transform:translateY(12px);transition:opacity .3s,transform .3s;font-size:13px;font-weight:700;color:#1f3a68;max-width:72vw}' +
    '#lcToast.on{opacity:1;transform:none}#lcToast img{width:44px;height:44px;border-radius:50%;object-fit:cover;flex:none}' +
    '@media (prefers-reduced-motion:reduce){#lcToast,.lc-av{transition:none}}@media print{.lc-av,.lc-ei,#lcToast{display:none!important}}';
  function img(k, cls, alt) { var i = document.createElement('img'); i.src = IMG[k]; i.alt = alt || ''; i.className = cls || ''; i.width = 34; i.height = 34; i.decoding = 'async'; i.setAttribute('draggable', 'false'); return i; }
  function avatar() {
    var b = document.querySelector('header .brand'); if (!b || b.querySelector('.lc-av')) return;
    var a = document.createElement('a'); a.className = 'lc-av'; a.href = 'manual.html'; a.title = 'レーンちゃんのマニュアル'; a.setAttribute('aria-label', 'レーンちゃんのマニュアルを開く');
    a.appendChild(img('explain', '', '')); var t = document.createElement('span'); t.textContent = '使い方はこちら'; a.appendChild(t); b.appendChild(a);
  }
  var EMPTY = /(まだ.{0,30}(ありません|いません)|がありません。?$|はありません。?$|まだ入っていません)/;
  function empties(root) {
    var els = (root || document).querySelectorAll('p.muted, p.small.muted, .muted.small, .empty, p.small');
    for (var i = 0; i < els.length; i++) {
      var e = els[i]; if (e.__lc || e.closest('header, #lcToast, .mb-art, .print, [contenteditable]')) continue;
      var t = (e.textContent || '').trim(); if (!t || t.length > 90 || !EMPTY.test(t) || e.querySelector('input, select, textarea, img')) continue;
      e.__lc = 1; e.insertBefore(img('explain', 'lc-ei', ''), e.firstChild);
    }
  }
  var DONE = /^(✔|✅|📋 コピー|📄|🟦|📥|🗑 削除しました)|PDFを(保存|作り)|保存しました|作りました|コピーしました|読み込みました|入れました/, SLEEP = /漏れ(は)?(ありません|なし)|すべて|全部|全員/;
  var toast, tm, last = '', lastAt = 0;
  function cheer(t) {
    var now = Date.now(); if (t === last && now - lastAt < 8000) return; last = t; lastAt = now;
    if (!toast) { toast = document.createElement('div'); toast.id = 'lcToast'; toast.setAttribute('aria-hidden', 'true'); document.body.appendChild(toast); }
    var sl = SLEEP.test(t); toast.innerHTML = ''; toast.appendChild(img(sl ? 'sleep' : 'thumbs', '', ''));
    toast.appendChild(document.createTextNode(sl ? 'おつかれさま！ 終わったら寝ちゃおう💤' : 'やったね！ その調子✨'));
    clearTimeout(tm); requestAnimationFrame(function () { toast.className = 'on'; }); tm = setTimeout(function () { toast.className = ''; }, 2800);
  }
  function scanDone(n) {
    var el = n.nodeType === 1 ? n : n.parentElement; if (!el || el.closest('#lcToast')) return;
    var s = el.closest('.status, [role="status"], .sv-msg'); if (!s || /\b(ng|err|warn)\b/.test(s.className)) return;
    var t = (s.textContent || '').trim(); if (t && t.length < 400 && DONE.test(t)) cheer(t);
  }
  var q = false, added = [];
  function flush() { q = false; var a = added; added = []; empties(); a.forEach(scanDone); }
  function start() {
    if (!document.getElementById('lcCss')) { var st = document.createElement('style'); st.id = 'lcCss'; st.textContent = css; document.head.appendChild(st); }
    avatar(); empties();
    try {
      new MutationObserver(function (ms) {
        ms.forEach(function (m) { if (m.type === 'characterData') added.push(m.target); else for (var i = 0; i < m.addedNodes.length; i++) { var x = m.addedNodes[i]; if (x.nodeType === 1 && (x.id === 'lcToast' || (x.classList && (x.classList.contains('lc-ei') || x.classList.contains('lc-av'))))) continue; added.push(x); } });
        if (!q && added.length) { q = true; setTimeout(flush, 120); }
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    } catch (e) { }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
