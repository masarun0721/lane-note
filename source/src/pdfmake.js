/* v0.23 「📄 PDF作成」：印刷ダイアログを出さず、PDFファイルを作ってそのまま保存する。
   ・印刷と同じHTMLを、画面の外の A4 幅の枠（iframe）に描き、html2canvas で画像にして jsPDF でページにする。
   ・部品は押したときに CDN から読む（版を固定し、ハッシュで確認。確認できないときは読み込まない）。
   ・ページの切れ目は、印刷の改ページ指定（break-before など）と、切ってはいけない箱（表の行・カードなど）を避けて決める。
   ・canvas に描くので、日本語の文字もそのまま出る（PDF の中は画像。文字は選べない）。 */
var LanePdf = (function () {
  'use strict';
  var LIB = {
    h2c: { src: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', sri: 'sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H', ok: function () { return typeof window.html2canvas === 'function'; } },
    jspdf: { src: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js', sri: 'sha384-en/ztfPSRkGfME4KIm05joYXynqzUgbsG5nMrj/xEFAHXkeZfO3yMK8QQ+mP7p1/', ok: function () { return !!(window.jspdf && window.jspdf.jsPDF); } }
  };
  var loading = {};
  // html2canvas 1.4.1 は幅0の要素のグラデーションで非有限値を渡して止まるので、その色止めだけ無視する
  function guardGradient() {
    var G = window.CanvasGradient && CanvasGradient.prototype; if (!G || G.__laneSafe) return;
    var orig = G.addColorStop; G.addColorStop = function (o, c) { if (!isFinite(o)) return; try { orig.call(this, o, c); } catch (e) {} }; G.__laneSafe = 1;
  }
  function load(k) {
    guardGradient();
    var L = LIB[k]; if (L.ok()) return Promise.resolve();
    if (loading[k]) return loading[k];
    loading[k] = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = L.src; s.integrity = L.sri; s.crossOrigin = 'anonymous'; s.async = true;
      s.onload = function () { L.ok() ? res() : rej(new Error('PDFを作る部品を読み込めませんでした')); };
      s.onerror = function () { delete loading[k]; s.remove(); rej(new Error('PDFを作る部品を読み込めませんでした（インターネット接続を確認してください）')); };
      document.head.appendChild(s);
    });
    return loading[k];
  }
  var MM = 96 / 25.4;
  // 印刷用のCSSを「いつも」にし、画面用のCSSは使わない
  function printify(html) { return String(html).replace(/@media\s+print\b/g, '@media all').replace(/@media\s+screen\b/g, '@media not all'); }
  /* ---- 進み具合の表示 ---- */
  var toast = null;
  function progress(msg) {
    if (!toast) { toast = document.createElement('div'); toast.className = 'lpdf-toast'; toast.setAttribute('role', 'status'); toast.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:3000;background:#14213d;color:#fff;font-weight:700;padding:10px 16px;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,.3);font-size:14px;max-width:92vw'; document.body.appendChild(toast); }
    if (msg == null) { toast.remove(); toast = null; return; }
    toast.textContent = msg;
  }
  /* ---- ページの切れ目 ---- */
  function cuts(doc, total, pageH) {
    var win = doc.defaultView, top0 = doc.body.getBoundingClientRect().top, forced = [], avoid = [];
    Array.prototype.forEach.call(doc.body.querySelectorAll('*'), function (el) {
      var cs = win.getComputedStyle(el); if (cs.display === 'none' || cs.position === 'fixed') return;
      var r = el.getBoundingClientRect(); if (!r.height) return;
      var t = r.top - top0, b = r.bottom - top0;
      if (/page|always/.test(cs.breakBefore + cs.pageBreakBefore) && t > 2) forced.push(t);
      if (/page|always/.test(cs.breakAfter + cs.pageBreakAfter) && b < total - 2) forced.push(b);
      if (/avoid/.test(cs.breakInside + cs.pageBreakInside) || /^(TR|LI|IMG|SVG|H1|H2|H3|H4|FIGURE)$/i.test(el.tagName)) avoid.push([t, b]);
    });
    forced.sort(function (a, b) { return a - b; });
    var out = [], start = 0, guard = 0;
    while (start < total - 1 && guard++ < 500) {
      var lim = start + pageH, f = forced.filter(function (x) { return x > start + 2 && x <= lim + 0.5; })[0];
      var c = f != null ? f : Math.min(lim, total);
      if (f == null && c < total) {   // 箱の途中で切らない（ページの半分より上には戻さない）
        for (var k = 0; k < 20; k++) { var moved = false; avoid.forEach(function (a) { if (a[0] < c - 0.5 && a[1] > c + 0.5 && a[0] > start + pageH * 0.4) { c = a[0]; moved = true; } }); if (!moved) break; }
      }
      out.push([start, c]); start = c;
    }
    return out;
  }
  function isIOS() { return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  async function save(blob, filename) {
    if (isIOS() && navigator.canShare && typeof File === 'function') {
      try { var f = new File([blob], filename, { type: 'application/pdf' }); if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: filename }); return 'share'; } } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
    }
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
    if (isIOS() && !('download' in a)) window.open(url, '_blank');
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    return 'download';
  }
  function safeName(s) { return String(s || 'LANE_NOTE').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, '').slice(0, 120) + (/\.pdf$/i.test(s) ? '' : '.pdf'); }
  /* o: { html: 文書のHTML（<!doctype>から）, filename, margin: 余白mm（既定10）, onePage: 1枚に縮める, footer: 'LANE NOTE' など（英数字のみ）, scale } */
  async function make(o) {
    var margin = o.margin == null ? 10 : o.margin, cw = (210 - 2 * margin) * MM, ch = (297 - 2 * margin) * MM, frame = null;
    progress('📄 PDFを作っています…');
    try {
      await Promise.all([load('h2c'), load('jspdf')]);
      frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
      frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + Math.ceil(cw) + 'px;height:' + Math.ceil(ch) + 'px;border:0;visibility:hidden';
      document.body.appendChild(frame);
      var html = printify(o.html).replace(/<\/head>/i, '<style>html,body{margin:0!important;padding:0!important;background:#fff!important;box-shadow:none!important;min-height:0!important;width:auto!important;max-width:none!important}' +
        // v0.23.1：html2canvas は CSS の zoom（画面の「1枚にまとめる」縮小）と position:sticky（画面の表の見出し）を正しく描けない
        // （行が箱の下で切れる・見出しの上に空きができる）。PDFでは使わず、1枚に縮めるのはこちらで画像ごと行う
        '*{zoom:1!important}th,thead{position:static!important}' + (o.css || '') + '</style></head>');
      await new Promise(function (res) { frame.onload = res; frame.srcdoc = html; setTimeout(res, 4000); });
      var doc = frame.contentDocument; if (doc.fonts && doc.fonts.ready) { try { await doc.fonts.ready; } catch (e) { } }
      await new Promise(function (r) { setTimeout(r, 60); });
      var body = doc.body, total = Math.max(body.scrollHeight, doc.documentElement.scrollHeight);
      if (o.trim) { var lastEl = body.lastElementChild; if (lastEl) total = Math.min(total, Math.ceil(lastEl.getBoundingClientRect().bottom - body.getBoundingClientRect().top) + 4); }   // v0.28.9 下の空白（JPEGでうっすら灰色）を描かない
      frame.style.height = Math.ceil(total + 10) + 'px';
      var zoom = 1;
      if (o.onePage && total > ch) { zoom = ch / total; }
      var pages = o.onePage ? [[0, total]] : cuts(doc, total, ch);
      var jsPDF = window.jspdf.jsPDF, pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      var scale = o.scale || 2;
      for (var i = 0; i < pages.length; i++) {
        progress('📄 PDFを作っています…（' + (i + 1) + '／' + pages.length + 'ページ）');
        var y0 = pages[i][0], h = Math.max(1, pages[i][1] - y0);
        var cv = await window.html2canvas(body, { scale: scale, backgroundColor: '#ffffff', useCORS: true, logging: false, x: 0, y: y0, width: Math.ceil(cw), height: Math.ceil(h), windowWidth: Math.ceil(cw), windowHeight: Math.ceil(total), scrollX: 0, scrollY: 0 });
        if (i) pdf.addPage('a4', 'portrait');
        var wmm = (210 - 2 * margin) * (o.onePage ? Math.min(1, zoom) : 1), hmm = h / MM * (o.onePage ? zoom : 1);
        pdf.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', margin + ((210 - 2 * margin) - wmm) / 2, margin, wmm, hmm, undefined, 'FAST');
        if (o.footer) { pdf.setFontSize(7); pdf.setTextColor(120); pdf.text(o.footer + (pages.length > 1 ? '   ' + (i + 1) + ' / ' + pages.length : ''), 210 - margin, 297 - Math.max(3, margin / 2), { align: 'right' }); }
        cv.width = cv.height = 0;
      }
      var name = safeName(o.filename), blob = pdf.output('blob');
      progress('✔ PDFを作りました（' + pages.length + 'ページ）');
      var how = await save(blob, name);
      setTimeout(function () { progress(null); }, 2500);
      return { pages: pages.length, filename: name, blob: blob, how: how };
    } catch (e) {
      progress('✖ ' + (e && e.message || 'PDFを作れませんでした') + '。「🖨 印刷」から「PDFに保存」もできます。');
      setTimeout(function () { progress(null); }, 7000);
      throw e;
    } finally { if (frame) frame.remove(); }
  }
  // いまのページの style をまとめて、本文（box の中身）だけの文書にする（記録・照合の印刷画面用）
  // 注意：body に printing を付けると「body.printing>*:not(#…)」で html2canvas の複製が真っ白になるので付けない
  function pageDoc(bodyHtml, bodyClass) {
    bodyClass = String(bodyClass || '').replace(/\bprinting\b/g, '').trim();
    var css = Array.prototype.map.call(document.querySelectorAll('style'), function (s) { return s.textContent; }).join('\n');
    return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>' + css + '</style></head><body class="' + (bodyClass || '') + '">' + bodyHtml + '</body></html>';
  }
  return { make: make, pageDoc: pageDoc, printify: printify, cuts: cuts, safeName: safeName, load: load, LIB: LIB };
})();
