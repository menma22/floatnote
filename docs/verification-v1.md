# Floatnote 実装照合・検証 v1

検証日: 2026-11-01。対象要件: [設計 v5](spec-v5.md) およびそこから参照する v1〜v4。

## 結果

Windows 実機で単体テスト **32 件**、Electron 操作テスト **3 件**、配布用実行ファイルの操作テスト **1 件**が成功。書式・ESLint・本番用依存の npm audit も成功し、本番用依存の既知脆弱性検出は 0 件だった。画面は [配布物の実画面](images/floatnote.png) で確認した。

## 条件と実装の照合

| 条件 | 対応コード・証拠 | 結果 |
| --- | --- | --- |
| A1 初回は小さい付箋 1 枚、＋で独立した付箋を作る | [main.cjs](../electron/main.cjs)、[app.spec.js](../tests/e2e/app.spec.js) | 成功。既定 340×240、ライム |
| A2 30 分が既定、15 分への変更と再起動後の保持 | [main.js](../src/main.js)、[model.cjs](../electron/model.cjs)、app.spec.js | 成功 |
| A3 周期で最小化から戻り、入力を奪わず最前面固定も解除 | main.cjs の `resurfaceNote`、app.spec.js の production timer ケース | 成功。実スケジューラの期限だけ短くして実時間で発火。別ウィンドウへ `before after` と連続入力できることを確認 |
| A4 独立期限・周期変更・閉じる・復帰で連打しない | [scheduler.cjs](../electron/scheduler.cjs)、[scheduler.test.cjs](../tests/unit/scheduler.test.cjs) | 成功 |
| A5 Enter で太字・箇条書き・番号付きリストへ変換、日本語を保持 | [editor.js](../src/editor.js)、app.spec.js | 成功。実際の Windows IME の変換操作は未実測。composition Enter の保護はコード照合 |
| A6 閉じた付箋を保存し、一覧・検索から復元 | main.cjs、main.js、app.spec.js | 成功。すべて閉じて再起動した場合の一覧も確認 |
| A7 最小化・最大化・移動・リサイズと寸法復元 | [window-state.cjs](../electron/window-state.cjs)、[window-state.test.cjs](../tests/unit/window-state.test.cjs)、app.spec.js、[packaged.spec.js](../tests/e2e/packaged.spec.js) | 成功。150% 表示で見つけた復元時の拡大を修正し、保存寸法との一致を再確認 |
| A8 破損データ・保存失敗・不正 IPC でデータを黙って失わない | [store.cjs](../electron/store.cjs)、[preload.cjs](../electron/preload.cjs)、[ipc-policy.cjs](../electron/ipc-policy.cjs)、対応する単体テストと app.spec.js | 成功。実ファイルの保存・復元、置換失敗の注入、未完了／失敗した本文を閉じない境界を検証 |
| A9 開発環境を必要としない Windows 配布物 | electron-builder NSIS、packaged.spec.js | 成功。生成した Floatnote.exe の本文入力・保存・最大化・復元を確認。インストーラー自体の実インストールは未実施 |
| A10 公開 GitHub リポジトリ | [menma22/floatnote](https://github.com/menma22/floatnote) | 公開リポジトリの作成と public 設定を確認。ソースの remote ref 照合と Release 公開は、この文書を含む初回コミットの配信段階で実施 |
| A11 6 色の選択、付箋ごとの独立と再起動後の保持 | main.js、model.cjs、app.spec.js、packaged.spec.js | 成功。既定背景 `#efffc9`、選択したブルーが他の付箋へ移らないことも確認 |
| A12 最小幅でもヘッダーが 1 段に収まる | [style.css](../src/style.css)、app.spec.js の寸法計測 | 成功。320px 幅で横のはみ出しがなく、操作の縦位置も同一行 |

## 実装中に確定した判断

- `×` は削除ではなく閉じる操作。周期を止め、本文を保持する。永久削除機能は設けない。
- 本文は各変更で main へ送信し、main が 180ms の書込まとめと原子的なファイル置換を行う。閉じる・終了では未処理入力を排出して同期的に確定する。保存拒否時はウィンドウを残す。
- 対応する編集文書の構造だけを保存できるように検証する。リッチ HTML の貼り付けはプレーンテキストに変換する。
- Windows の外枠寸法は表示倍率で増分が生じるため、通常位置と本文領域の寸法を保存する。最大化・最小化時は通常寸法を維持する。
- 描画部分の Node.js を無効化し、sandbox・contextIsolation・限定 IPC・CSP を適用する。外部遷移と新規ウィンドウ要求を拒否する。
- この実機では Electron の終了完了を検証側が受け取るまで 30 秒を超える場合があった。付箋コードのない Electron 44/45 の最小構成でも再現し、最終的な終了コード 0 を確認した。根本原因は未特定のため、本体へ強制終了を追加せず E2E の制限時間を 180 秒にした。

## 確認範囲と残る制約

検証環境は Windows 11 系ビルド 26200、表示倍率 150%、Electron 45.2.1、Node.js 22.23.4。30 分待つ試験は行わず、同じ本番スケジューラの期限をテスト内だけで短縮して確認した。スリープ復帰は時刻を進めた単体テストで確認し、実際の OS スリープ・ロック画面・排他フルスクリーンは未実測。

配布物は未署名。Windows 10、別の表示倍率、実際の IME 変換、インストール／アンインストール操作は今回の実機試験の対象外。GitHub Actions の Windows チェックは [Actions](https://github.com/menma22/floatnote/actions) から確認できる。
