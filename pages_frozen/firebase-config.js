/* LANE NOTE（大会準備・記録）：Firebase の設定（プロジェクト lane-note のウェブアプリ firebaseConfig）
 * これらの値は「どのプロジェクトか」を示す公開の識別子で、秘密の鍵ではありません。読み書きできる範囲は firestore.rules で決めています：
 *   ・users/{uid}/**（記録・天気・中学/高校の選択・作った短いリンクの一覧）：本人だけが読み書きできる
 *   ・shares/{id}（短いリンク）：IDを知っていれば、期限内（最長120日）だけ誰でも読める。作れるのはGoogleでログインした本人だけ
 *   ・feedback/{id}（不具合・要望）：Googleでログインした人が書き込むだけ（アプリからは誰も読めない）
 * ※回数の制限（App Check など）はまだ入れていません。 */
window.LANE_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDdgn8Nl4ELiqJAlL6LQrTg0zgTtp0DUGM",
  authDomain: "lane-note.firebaseapp.com",
  projectId: "lane-note",
  storageBucket: "lane-note.firebasestorage.app",
  messagingSenderId: "344200995873",
  appId: "1:344200995873:web:053e99408ade2a4eb96f60"
};
