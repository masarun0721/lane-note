/* ===== ナンバーカード（ゼッケン・腰番）docx 生成：テンプレートの文字だけ差し替え ===== */
var Zekken = (function () {
  'use strict';
  var KINDS = {
    koshi: { label: '腰番', digit_em: 0.6 },
    mune: { label: 'ゼッケン', digit_em: 0.5, target_pt: 380 }
  };
  var FIT = 0.92, EMU_PER_PT = 12700;
  var AC_RE = /<mc:AlternateContent>[\s\S]*?<\/mc:AlternateContent>/g;
  var TXBX_RE1 = /(<w:txbxContent>)([\s\S]*?)(<\/w:txbxContent>)/;
  var TXBX_REG = /(<w:txbxContent>)([\s\S]*?)(<\/w:txbxContent>)/g;
  var PARA_RE = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
  function findAll(re, s) { re.lastIndex = 0; var out = [], m; while ((m = re.exec(s))) out.push(m); return out; }
  function paraText(p) { return findAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g, p).map(function (m) { return m[1]; }).join(''); }
  function paras(s) { return findAll(PARA_RE, s).map(function (m) { return m[0]; }); }

  function analyze(doc) {
    var m = /(<w:body>)([\s\S]*?)(<w:sectPr\b[\s\S]*<\/w:body>)/.exec(doc);
    if (!m) throw new Error('テンプレートの構造が想定外です');
    var b0 = m.index + m[1].length, body = m[2], b1 = b0 + body.length;
    if (!(body.indexOf('<w:p') === 0 && body.slice(-6) === '</w:p>')) throw new Error('テンプレートの構造が想定外です（本文が1段落ではない）');
    var slots = [];
    findAll(AC_RE, body).forEach(function (ac, i) {
      var blk = ac[0], inner = TXBX_RE1.exec(blk)[2];
      var txt = paras(inner).map(paraText);
      if (!txt.some(function (t) { return t.trim(); })) return;
      var cx = parseInt(/<wp:extent cx="(\d+)"/.exec(blk)[1], 10);
      var posv = /<wp:positionV[^>]*>[\s\S]*?<wp:posOffset>(-?\d+)<\/wp:posOffset>/.exec(blk);
      var firstP = paras(inner).filter(function (p) { return paraText(p).trim(); })[0];
      var sz = parseInt(/<w:sz w:val="(\d+)"/.exec(firstP)[1], 10);
      slots.push({ index: i, width_pt: cx / EMU_PER_PT, posv: posv ? parseInt(posv[1], 10) : 0, sz: sz });
    });
    slots = slots.map(function (s, k) { s._k = k; return s; }).sort(function (a, b) { return a.posv - b.posv || a._k - b._k; });
    return { b0: b0, b1: b1, body: body, slots: slots };
  }
  function setNumberInTxbx(inner, number, newSz) {
    var target = paras(inner).filter(function (p) { return paraText(p).trim(); })[0];
    var runs = findAll(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g, target).map(function (m) { return m[0]; });
    var textRuns = runs.filter(function (r) { return r.indexOf('<w:t') >= 0; });
    var first = textRuns[0];
    var rpr = /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(first); rpr = rpr ? rpr[0] : '';
    var nt = target.replace(/<w:bookmark(Start|End)\b[^>]*\/>/g, '');
    var PH = '\u0000RUN\u0000';
    nt = nt.replace(first, function () { return PH; });
    textRuns.slice(1).forEach(function (r) { nt = nt.replace(r, function () { return ''; }); });
    var newRun = number ? '<w:r>' + rpr + '<w:t>' + number + '</w:t></w:r>' : '';
    nt = nt.split(PH).join(newRun);
    if (newSz != null) nt = nt.replace(/(<w:sz(?:Cs)? w:val=")\d+(")/g, function (_, a, b) { return a + newSz + b; });
    return inner.replace(target, function () { return nt; });
  }
  function fillPage(body, slots, numbers, cfg, report, pageNo, uid) {
    var acs = findAll(AC_RE, body), byIndex = {};
    slots.forEach(function (s, k) { if (k < numbers.length) byIndex[s.index] = [s, numbers[k]]; });
    var out = [], last = 0;
    acs.forEach(function (ac, i) {
      var blk = ac[0];
      if (byIndex[i]) {
        var s = byIndex[i][0], num = byIndex[i][1], tplPt = s.sz / 2, newSz = null;
        if (cfg.target_pt) { tplPt = cfg.target_pt; newSz = Math.trunc(tplPt * 2); }
        if (num) {
          var maxPt = FIT * s.width_pt / (num.length * cfg.digit_em);
          if (tplPt > maxPt) { newSz = Math.trunc(maxPt * 2); report.push(num + ': ' + num.length + '桁のため文字サイズ ' + tplPt + 'pt → ' + (newSz / 2) + 'pt に縮小'); }
        }
        blk = blk.replace(TXBX_REG, function (_, a, inner, c) { return a + setNumberInTxbx(inner, num, newSz) + c; });
      }
      out.push(body.slice(last, ac.index)); out.push(blk); last = ac.index + ac[0].length;
    });
    out.push(body.slice(last));
    var page = out.join('');
    page = page.replace(/\s(?:o:gfxdata)="[^"]*"/g, '');
    if (pageNo > 0) {
      page = page.replace(/<v:shapetype\b[\s\S]*?<\/v:shapetype>/g, '');
      page = page.replace(/<w:bookmark(Start|End)\b[^>]*\/>/g, '');
      page = page.replace(/\sw14:(paraId|textId)="[^"]*"/g, '');
      page = page.replace(/^(<w:p\b[^>]*>)<w:pPr>/, function (_, a) { return a + '<w:pPr><w:pageBreakBefore/>'; });
      if (page.indexOf('<w:pageBreakBefore/>') < 0) page = page.replace(/^(<w:p\b[^>]*>)/, function (_, a) { return a + '<w:pPr><w:pageBreakBefore/></w:pPr>'; });
    }
    page = page.replace(/(<wp:docPr id=")\d+"/g, function (_, a) { uid[0] += 1; return a + uid[0] + '"'; });
    page = page.replace(/o:spid="[^"]*"/g, function () { uid[0] += 1; return 'o:spid="_x0000_s' + (1025 + uid[0]) + '"'; });
    var amap = {}, n = 0;
    page = page.replace(/((?:wp14|w14):anchorId=")([0-9A-F]{8})"/g, function (m0, a, old) {
      if (pageNo === 0) return m0;
      if (!(old in amap)) { var v = ((0x10000000 + pageNo * 16 + (n++)) & 0x7FFFFFFF).toString(16).toUpperCase(); amap[old] = ('00000000' + v).slice(-8); }
      return a + amap[old] + '"';
    });
    if (pageNo > 0) page = page.replace(/\swp14:editId="[^"]*"/g, '');
    return page;
  }
  // numbers: 文字列の配列（腰番は上下2枠に順に入る、ゼッケンは1枠/ページ）
  function buildDocumentXml(doc, kind, numbers, copies) {
    var cfg = KINDS[kind], a = analyze(doc), per = a.slots.length;
    var seq = []; numbers.forEach(function (n) { for (var c = 0; c < (copies || 1); c++) seq.push(String(n)); });
    var pages = []; for (var i = 0; i < seq.length; i += per) pages.push(seq.slice(i, i + per));
    if (!pages.length) pages.push([]);
    while (pages[pages.length - 1].length < per) pages[pages.length - 1].push('');
    var report = [], uid = [0];
    var newBody = pages.map(function (p, i) { return fillPage(a.body, a.slots, p, cfg, report, i, uid); }).join('');
    return { xml: doc.slice(0, a.b0) + newBody + doc.slice(a.b1), pages: pages.length, perPage: per,
      report: report.filter(function (r, i) { return report.indexOf(r) === i; }) };
  }
  function outName(kind, numbers, copies) {
    var nums = numbers.map(function (n) { return parseInt(n, 10); }), core;
    var consecutive = nums.every(function (v, i) { return v === nums[0] + i; });
    if (nums.length === 1) core = numbers[0];
    else if (consecutive) core = numbers[0] + '-' + numbers[numbers.length - 1];
    else if (nums.length <= 5) core = numbers.join('_');
    else core = numbers[0] + 'ほか' + nums.length + '件';
    if (copies > 1) core += '_各' + copies + '枚';
    return KINDS[kind].label + '_' + core;
  }
  // JSZip でテンプレートを開き、document.xml だけ差し替えた docx(Blob/Uint8Array) を返す
  async function makeDocx(JSZip, templateData, kind, numbers, copies, outType) {
    var zip = await JSZip.loadAsync(templateData, { createFolders: false });
    var doc = await zip.file('word/document.xml').async('string');
    var r = buildDocumentXml(doc, kind, numbers, copies);
    zip.file('word/document.xml', r.xml, { createFolders: false });
    var data = await zip.generateAsync({ type: outType || 'blob', compression: 'DEFLATE',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    return { data: data, pages: r.pages, report: r.report, name: outName(kind, numbers.map(String), copies || 1) + '.docx' };
  }
  return { analyze: analyze, buildDocumentXml: buildDocumentXml, makeDocx: makeDocx, outName: outName };
})();
if (typeof module !== 'undefined') module.exports = Zekken;
