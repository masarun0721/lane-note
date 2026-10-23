// v0.29.0 JAAFの大会エントリー画面の「形だけ」の見本。名前・ID・登録番号はすべて架空（本物の画面のファイルは使わない）
export const MOCK_ATHLETES = [
  { id: '00900000001', reg: '90001', name: '架空　一郎', kana: 'カクウ　イチロウ', g: '高校2' },
  { id: '00900000002', reg: '90002', name: '見本　二郎', kana: 'ミホン　ジロウ', g: '高校2' },
  { id: '00900000003', reg: '90003', name: '試験　三太', kana: 'シケン　サンタ', g: '高校1' },
  { id: '00900000004', reg: '90004', name: '例題　四郎', kana: 'レイダイ　シロウ', g: '高校1' },
  { id: '00900000005', reg: '90005', name: '仮名　五月', kana: 'カメイ　サツキ', g: '高校1' },
  { id: '00900000006', reg: '90006', name: '模擬　六太', kana: 'モギ　ロクタ', g: '高校2' }
];
export const MOCK_EVENTS = [
  [91001, '男子100m'], [91002, '男子200m'], [91003, '男子400m'], [91004, '男子110mH(106.7cm_9.14m)'],
  [91005, '男子4×100mR'], [91006, '男子4×400mR'], [91007, '男子走幅跳'], [91008, '男子砲丸投(6.000kg)']
];
const TEAM = '1009999';
export function mockHtml(o = {}) {
  const grey = o.grey || {}, dis = o.disabled || {}, pre = o.pre || {};
  const sec = ([eid, label]) => {
    const relay = /R$/.test(label), rows = MOCK_ATHLETES.map(a => {
      const k = eid + '_' + a.id, g = grey[k] ? '#cccccc' : '';
      return `<tr class="tr_checkbox" id="tr_checkbox_${eid}_${a.id}_${TEAM}" style="background-color:${g};"><td class="text-center"><input type="checkbox" class="checkbox_ids${relay ? '' : ' checkbox_member_check'}" name="input[${eid}][${a.id}_${TEAM}][id]" value="${a.id}" title="${a.name}"${dis[k] ? ' disabled' : ''}${pre[k] ? ' checked' : ''}></td><td>架空高等学校</td><td>${a.name}</td><td>${a.kana}</td><td>2009/04/01</td><td>${a.g}</td><td>東京</td><td>${a.reg}</td><td>登録済</td><td></td></tr>`;
    }).join('');
    return `<div class="card card-gray"><div class="card-header"><h3 class="card-title" id="h3_${eid}">${label}</h3></div><div class="card-body"><div>公認最高記録は自動入力されます。</div><table class="table1 dataTable"><thead><tr><th>登録</th><th>所属</th><th>会員名</th><th>会員名カナ</th><th>生年月日</th><th>学年</th><th>都道府県</th><th>登録番号</th><th>状態</th><th>備考</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  };
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>架空のエントリー画面（見本）</title>
<style>body{font-family:sans-serif;margin:0;background:#f4f6f9;font-size:13px}.wrap{max-width:980px;margin:0 auto;padding:12px}.card{background:#fff;border-radius:6px;margin:10px 0;box-shadow:0 1px 3px rgba(0,0,0,.15)}.card-header{background:#6c757d;color:#fff;padding:6px 12px}.card-title{margin:0;font-size:15px}.card-body{padding:8px 12px;max-height:300px;overflow:auto}table{border-collapse:collapse;width:100%}th,td{border:1px solid #dee2e6;padding:3px 6px;text-align:left}.btn{padding:8px 14px;border:0;border-radius:4px}.btn-warning{background:#ffc107}.btn-info{background:#17a2b8;color:#fff}</style></head>
<body><div class="wrap"><div class="card"><div class="card-header"><h3 class="card-title">架空 秋季競技会（見本）</h3></div></div>
<form action="https://example.invalid/user/competition/" method="post" id="form-1"><input type="hidden" name="mode" value="" id="hidden-mode"><input type="hidden" name="competition_id" value="9999">
${MOCK_EVENTS.map(sec).join('')}
<div class="card"><div class="card-header"><h3 class="card-title">申し込み担当者情報（連絡先）</h3></div><div class="card-body"><table><tr><th>担当者名</th><td><input type="text" class="form-control input-must" name="contact[name]" value=""></td></tr><tr><th>電話番号</th><td><input type="text" class="form-control input-must" name="contact[tel]" value=""></td></tr><tr><th>メールアドレス</th><td><input type="text" class="form-control input-must" name="contact[email]" value=""></td></tr></table></div></div>
<button type="button" class="btn btn-warning button-save">一時保存する</button> <button type="button" class="btn btn-info button-next">出場選手の記録入力に進む</button>
</form></div></body></html>`;
}
// LANE NOTE の「JAAF用にコピー」と同じ形の架空データ
export function mockData() {
  return { v: 1, app: 'LANE NOTE', meet: '架空 秋季競技会', entries: [
    { regNo: '90001', jaafId: '00900000001', name: '架空 一郎', event: '男子100m', record: '11.50', recMeet: '架空記録会', recDate: '2026-09-01' },
    { regNo: '90001', jaafId: '00900000001', name: '架空 一郎', event: '男子200m', record: '23.40', recMeet: '架空記録会', recDate: '2026-09-01' },
    { regNo: '90001', jaafId: '00900000001', name: '架空 一郎', event: '男子400m', record: '', recMeet: '', recDate: '' },
    { regNo: '90002', jaafId: '', name: '見本 二郎', event: '男子110mH', record: '15.80', recMeet: '架空大会', recDate: '2026-08-10' },
    { regNo: '', jaafId: '', name: '試験 三太', event: '男子走幅跳', record: '6m10', recMeet: '', recDate: '' },
    { regNo: '90004', jaafId: '', name: '例題 四郎', event: '男子砲丸投', record: '', recMeet: '', recDate: '' },
    { regNo: '90005', jaafId: '', name: '仮名 五月', event: '男子100m', record: '', recMeet: '', recDate: '' },
    { regNo: '99999', jaafId: '', name: '不在 太郎', event: '男子200m', record: '', recMeet: '', recDate: '' },
    { regNo: '90006', jaafId: '', name: '模擬 六太', event: '男子三段跳', record: '', recMeet: '', recDate: '' }
  ], relays: [
    { event: '男子4×100mR', team: 'A', members: [{ regNo: '90001', jaafId: '00900000001', name: '架空 一郎' }, { regNo: '90002', jaafId: '', name: '見本 二郎' }, { regNo: '90003', jaafId: '', name: '試験 三太' }, { regNo: '90006', jaafId: '', name: '模擬 六太' }] }
  ] };
}
// 仮名 五月の100mはグレー（ほかでエントリー済み）・例題 四郎の砲丸投はえらべない（disabled）
export const MOCK_OPTS = { grey: { '91001_00900000005': 1 }, disabled: { '91008_00900000004': 1 } };
