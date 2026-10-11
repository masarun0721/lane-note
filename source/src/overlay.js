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
