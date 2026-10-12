/* v0.22.2 全画面の画面（画面で見る・個人表・個人ページ・保護者へのお知らせ など）：
   ・上に「← 戻る」を出す。
   ・開くときに history.pushState。ブラウザ／Android の「戻る」では、ページを離れずにその画面だけを閉じる。 */
var LaneOverlay = (function () {
  'use strict';
  var LIST = [
    { id: 'parentView', close: 'pvClose' }, { id: 'venueView', close: 'vnClose' }, { id: 'docView', close: 'docClose' }, { id: 'shareDlg', close: 'shareClose' }, { id: 'playerDlg', close: 'plClose' },
    { id: 'rbPPScreen', close: 'rbPPBack', noBtn: true }, { id: 'rbPrint', close: 'rbPrintClose' }, { id: 'ckPrint', close: 'ckPrintClose' }];
  var stack = [];
  function closeOv(o) { var b = o.close && document.getElementById(o.close); if (b) b.click(); else o.el.hidden = true; }
  function watch(list) {
    (list || LIST).forEach(function (o) {
      o.el = document.getElementById(o.id); if (!o.el || o.el.dataset.ovWatch) return; o.el.dataset.ovWatch = '1';
      if (!o.noBtn) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'btn sub ov-back'; b.textContent = '← 戻る'; b.setAttribute('aria-label', '戻る（この画面を閉じる）');
        b.addEventListener('click', function () { closeOv(o); });
        var host = o.el.firstElementChild || o.el; host.insertBefore(b, host.firstChild);
      }
      var open = !o.el.hidden;
      new MutationObserver(function () {
        var now = !o.el.hidden; if (now === open) return; open = now;
        if (now) { stack.push(o); try { history.pushState({ laneOv: o.id }, ''); } catch (e) { } }
        else {
          var i = stack.indexOf(o); if (i < 0) return; stack.splice(i, 1);
          if (history.state && history.state.laneOv === o.id) { try { history.back(); } catch (e) { } }
        }
      }).observe(o.el, { attributes: true, attributeFilter: ['hidden'] });
    });
  }
  // 戻った先の履歴に書かれている画面より上のものを閉じる（自分で閉じたあとの history.back() では、もう stack に無いので何もしない）
  window.addEventListener('popstate', function (e) {
    var target = e.state && e.state.laneOv;
    while (stack.length && stack[stack.length - 1].id !== target) closeOv(stack.pop());
  });
  function init() {
    var st = document.createElement('style');
    st.textContent = '.ov-back{font-weight:700;margin:0 8px 0 0;min-height:40px;white-space:nowrap}.dlg .ov-back{margin:0 0 8px}';
    document.head.appendChild(st); watch();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  return { watch: watch, _stack: stack };
})();
/* v0.23：共有ボタンの注意書き。PCはマウスを乗せると出る（title）。スマホは ⓘ を押すか、ボタンを長押しすると出る */
var LaneShareTip = (function () {
  var T = {
    meet: 'リンクを知っている人は誰でもログインなしで見られます。チーム全員の名前と記録が入るので、部員の中だけで共有してください。119日で見られなくなります。大会準備ページの「作った短いリンク」からいつでも止められます。',
    pp: 'リンクを知っている人は誰でもログインなしで見られます。その選手の名前と記録が入るので、本人と保護者だけに渡してください。短いリンクは119日で見られなくなります。大会準備ページの「作った短いリンク」からいつでも止められます。',
    prep: 'リンクを知っている人は誰でもログインなしで見られます。自校の選手の名前と出場種目・時刻が入るので、部員と保護者の中だけで共有してください。短いリンクは119日で見られなくなります。大会準備ページの「作った短いリンク」からいつでも止められます。'
  };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // ⓘ ボタンと、押すと出る説明（ボタンのすぐあとに置く）
  function html(text) { return '<button type="button" class="sh-i" aria-label="共有についての注意" aria-expanded="false" title="' + esc(text) + '">ⓘ</button><span class="sh-tip" role="note" hidden>' + esc(text) + '</span>'; }
  function toggle(i, show) {
    var tip = i && i.nextElementSibling; if (!tip || !tip.classList.contains('sh-tip')) return;
    var on = show == null ? tip.hidden : show; tip.hidden = !on; i.setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  function attach(btn, text) {
    if (!btn || btn.getAttribute('data-shtip')) return;
    btn.setAttribute('data-shtip', '1'); btn.title = text; btn.insertAdjacentHTML('afterend', html(text));
  }
  document.addEventListener('click', function (e) { var i = e.target.closest && e.target.closest('.sh-i'); if (i) { e.preventDefault(); toggle(i); } });
  // 長押し（スマホ）：0.5秒押したままなら説明を出し、そのあとの「押した」扱いは取り消す
  var timer = null, longed = null;
  document.addEventListener('touchstart', function (e) {
    var b = e.target.closest && e.target.closest('[data-shtip]'); if (!b) return;
    clearTimeout(timer); timer = setTimeout(function () { var i = b.nextElementSibling; if (i && i.classList.contains('sh-i')) { toggle(i, true); longed = b; } }, 500);
  }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach(function (t) { document.addEventListener(t, function () { clearTimeout(timer); }, { passive: true }); });
  document.addEventListener('click', function (e) { if (longed && e.target.closest && e.target.closest('[data-shtip]') === longed) { e.preventDefault(); e.stopImmediatePropagation(); } longed = null; }, true);
  document.addEventListener('contextmenu', function (e) { if (e.target.closest && e.target.closest('[data-shtip]')) e.preventDefault(); });
  var st = document.createElement('style');
  st.textContent = '.sh-i{border:1px solid #b9c3d6;background:#fff;color:#1f3a68;border-radius:50%;width:26px;height:26px;min-height:0;padding:0;font-size:14px;line-height:1;cursor:pointer;vertical-align:middle;margin-left:4px;flex:0 0 auto}' +
    '.sh-tip{display:block;flex-basis:100%;background:#fff8e1;border:1px solid #f0d58a;color:#4a3b00;border-radius:8px;padding:8px 10px;font-size:13px;line-height:1.6;margin:6px 0;max-width:640px}.sh-tip[hidden]{display:none}';
  (document.head || document.documentElement).appendChild(st);
  return { T: T, html: html, attach: attach, toggle: toggle };
})();
