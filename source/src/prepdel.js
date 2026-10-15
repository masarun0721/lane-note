/* v0.26.46（監査 C801・C702）：大会準備のPDF（meets/{大会}/pdf/{かけら}）を消す共通の手順。大会準備のページ（app.js の「保存を消す」）と
   記録・大会予定のページ（records_app.js の予定を消す・期限切れの片づけ・クラウドのデータをすべて消す）で同じものを使う。
   1) 最新の親（大会の印 meets/{大会}）を読み直す → 2) そこが指している版のかけらを消す（1つでも失敗した種類は印を残す）
   → 3) トランザクションの中でもう一度親を読み、版（v・n・保存日時・URL）が同じ種類だけ印を外す。
      全部外せたときだけ、呼び出し元の onEmpty で親を消す・置き換える。版が変わった種類は印もかけらも残し、changed に入れて返す（成功とは言わない） */
var LanePrepDel = (function () {
  function same(a, b) { return !!a && !!b && (a.v || '') === (b.v || '') && (+a.n || 0) === (+b.n || 0) && (a.at || '') === (b.at || '') && (a.url || '') === (b.url || ''); }
  // かけらのID：版つき（種類_版ID_番号）と古い形（種類_番号）。n は10まで（ルールと同じ）
  function chunkIds(k, d) { var out = []; if (!d || !/^(yoko|sl|tt|note)$/.test(k)) return out; var n = Math.min(+d.n || 0, 10), v = /^[a-z0-9]{8}$/.test(d.v || '') ? d.v : ''; for (var i = 0; i < n; i++) out.push(v ? k + '_' + v + '_' + i : k + '_' + i); return out; }
  // o = { F, fs, ref, chunkRef(kind, id), only(kind, d)（省略＝全部）, check()（ログインが変わったら投げる）, isAbort(e), onEmpty(now)（印が全部外れたとき：{del:true}・{set:文書}・null）, read(ref)（省略可） }
  async function erase(o) {
    var F = o.F, check = o.check || function () { }, read = o.read || function (r) { return F.getDoc(r); };
    var s = await read(o.ref); check();
    var cur = s.exists() ? s.data() || {} : null, cd = cur && cur.prep && cur.prep.docs || {}, left = {}, ng = 0, last = null;
    var target = function (x, d) { return !o.only || (!!d && o.only(x, d)); };
    var kinds = Object.keys(cd).filter(function (x) { return cd[x] && target(x, cd[x]); });
    for (var j = 0; j < kinds.length; j++) {
      var k = kinds[j], ids = chunkIds(k, cd[k]);
      for (var i = 0; i < ids.length; i++) { check(); try { await F.deleteDoc(o.chunkRef(k, ids[i])); } catch (e) { if (o.isAbort && o.isAbort(e)) throw e; left[k] = 1; ng++; last = e; } }
    }
    check();
    if (!cur) return { gone: true, keep: {}, changed: [], ng: 0, last: null, left: {}, data: null, op: '' };
    // v0.26.47（監査 C901）：トランザクションの中でも、読む前・読んだ直後・書く前（やり直しのたびに）保存先を確かめる。読み取りを待つ間にチームを切り替えたら、親は書かない
    var settle = async function (get, set, upd, del) {
      check();
      var s2 = await get(o.ref); check(); if (!s2.exists()) return { gone: true, keep: {}, changed: [], data: null, op: '' };
      var now = s2.data() || {}, nd = now.prep && now.prep.docs || {}, keep = {}, changed = [], drop = [];
      Object.keys(nd).forEach(function (x) {
        if (kinds.indexOf(x) >= 0 && !left[x] && same(nd[x], cd[x])) drop.push(x);
        else { keep[x] = nd[x]; if (target(x, nd[x]) && !left[x] && !same(nd[x], cd[x])) changed.push(x); }
      });
      var empty = !Object.keys(keep).length, r = empty && o.onEmpty ? o.onEmpty(now) : null, data;
      check();
      if (r && r.del) { await del(o.ref); data = null; }
      else if (r && r.set) { await set(o.ref, r.set); data = r.set; }
      else {
        data = JSON.parse(JSON.stringify(now));
        if (empty) { if (now.prep) { await upd(o.ref, ['prep', F.deleteField()]); delete data.prep; } }
        else if (drop.length) { var a = []; drop.forEach(function (x) { a.push('prep.docs.' + x, F.deleteField()); delete data.prep.docs[x]; }); await upd(o.ref, a); }
      }
      return { keep: keep, changed: changed, data: data, op: r && r.del ? 'del' : r && r.set ? 'set' : 'upd' };
    };
    var res;
    if (F.runTransaction) res = await F.runTransaction(o.fs, function (tx) { return settle(function (r) { return tx.get(r); }, function (r, d) { tx.set(r, d); }, function (r, a) { tx.update.apply(tx, [r].concat(a)); }, function (r) { tx.delete(r); }); });
    else res = await settle(read, function (r, d) { return F.setDoc(r, d); }, function (r, a) { return F.updateDoc.apply(null, [r].concat(a)); }, function (r) { return F.deleteDoc(r); });   // トランザクションがない環境（古いテスト用）：読み直して確かめてから書く
    check();
    res.ng = ng; res.last = last; res.left = left; res.cur = cur;
    return res;
  }
  // 1つの大会の結果から、未完了の理由を作る（changed＝ほかの画面が保存し直した・ng＝消せなかった）
  function incomplete(res, label) {
    if (res.changed && res.changed.length) { var e = new Error('消し終わっていません：消している間に、ほかの画面で' + (label || '大会準備のPDF') + 'が保存し直されました。新しい保存は残しています。もう一度押すと、続きを消します'); e.code = 'prep-changed'; return e; }
    if (res.ng) { var e2 = new Error('一部未削除：大会準備のPDFのかけら ' + res.ng + '件を消せませんでした（' + (res.last && (res.last.code || res.last.message) || '不明') + '）。もう一度押すと、残りを消します'); e2.code = 'prep-partial'; e2.n = res.ng; e2.cause = res.last; return e2; }
    return null;
  }
  return { same: same, chunkIds: chunkIds, erase: erase, incomplete: incomplete };
})();
if (typeof module !== 'undefined') module.exports = LanePrepDel;
