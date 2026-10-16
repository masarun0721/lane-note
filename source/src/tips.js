/* v0.27（案）説明は「？」の中へ（ボタンを先に見せる）
   ・説明の要素に data-xp="ラベル"（空でもよい）をつける。data-xp-at="セレクタ" があれば、「？」をその見出しなどの中に置く（なければその場所）
   ・パソコン（マウス）：「？」にマウスを乗せる／Tab で選ぶと、四角い吹き出しで説明が出る。押すと出したまま（もう一度押す・外を押す・Esc で閉じる）
   ・スマホ（タッチ）：「？」を押すと、その場で説明が開く（はじめは閉じている）
   ・要素は動かすだけで、作り直さない（id・中身を変える今までの処理はそのまま動く）。あとから出る説明（画面の書き換え）にも自動でつける */
(function () {
  if (window.LaneTips) return;
  var n = 0, fine = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : { matches: false };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function side(w) {   // 画面の右にはみ出すときは右寄せ、下にはみ出すときは上に出す
    var p = w.querySelector(':scope > .xp'); if (!p || !fine.matches) return;
    w.classList.remove('xp-r', 'xp-up');
    var r = w.getBoundingClientRect(), pw = Math.min(380, window.innerWidth - 24);
    if (r.left + pw > window.innerWidth - 8) w.classList.add('xp-r');
    var ph = p.offsetHeight || 0; if (ph && r.bottom + ph + 12 > window.innerHeight && r.top > ph + 12) w.classList.add('xp-up');
  }
  function set(w, on) { w.classList.toggle('open', on); if (on) w.classList.remove('xp-shut'); var b = w.querySelector(':scope > .tipq'); if (b) b.setAttribute('aria-expanded', on ? 'true' : 'false'); if (on) side(w); }
  function emptyParent(par) {
    if (!par || par === document.body) return;
    var t = Array.prototype.some.call(par.childNodes, function (c) { return c.nodeType === 1 || (c.nodeType === 3 && c.textContent.trim()); });
    if (!t) par.hidden = true;
  }
  function wrap(el) {
    if (el.__xp || !el.parentNode) return; el.__xp = 1;
    var lab = el.getAttribute('data-xp') || '', at = el.getAttribute('data-xp-at'), host = at ? (el.closest('section, .dlg-in, .pps-body, details, form, body') || document).querySelector(at) || document.querySelector(at) : null;
    if (!el.id) el.id = 'xp' + (++n) + '_' + Math.random().toString(36).slice(2, 6);
    var w = document.createElement('span'); w.className = 'xpw' + (lab ? ' xp-lab' : '');
    var b = document.createElement('button'); b.type = 'button'; b.className = 'tipq';
    b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', el.id); b.setAttribute('aria-label', (lab || '説明') + '（説明を見る）');
    b.innerHTML = '<span class="tipi" aria-hidden="true">?</span>' + (lab ? '<span class="tipl">' + esc(lab) + '</span>' : '');
    var par = el.parentNode;
    if (host) host.appendChild(w); else par.insertBefore(w, el);
    w.appendChild(b); w.appendChild(el); el.classList.add('xp'); el.setAttribute('role', 'note');
    if (host) emptyParent(par);
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); set(w, !w.classList.contains('open')); });
    w.addEventListener('mouseenter', function () { side(w); }); w.addEventListener('mouseleave', function () { w.classList.remove('xp-shut'); }); w.addEventListener('focusout', function (e) { if (!w.contains(e.relatedTarget)) w.classList.remove('xp-shut'); }); b.addEventListener('focus', function () { side(w); });
  }
  function scan(root) { (root || document).querySelectorAll('[data-xp]:not(.xp)').forEach(wrap); }
  document.addEventListener('click', function (e) { if (!fine.matches) return; document.querySelectorAll('.xpw.open').forEach(function (w) { if (!w.contains(e.target)) set(w, false); }); });
  document.addEventListener('keydown', function (e) { if (e.key !== 'Escape') return; document.querySelectorAll('.xpw.open, .xpw:hover, .xpw:focus-within').forEach(function (w) { set(w, false); w.classList.add('xp-shut'); var b = w.querySelector('.tipq'); if (w.contains(document.activeElement) && b) b.focus(); }); });
  var pend = false;
  function later() { if (pend) return; pend = true; setTimeout(function () { pend = false; scan(); }, 0); }   // rAF は裏のタブで止まるので setTimeout
  function start() { scan(); if (window.MutationObserver) new MutationObserver(later).observe(document.body, { childList: true, subtree: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.LaneTips = { scan: scan };
})();
