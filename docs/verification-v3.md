# Floatnote 実装照合・検証 v3

検証日: 2026-11-02。前版: [v2](verification-v2.md)。対象は [設計 v7](spec-v7.md) と [v6](spec-v6.md)。アプリの検証済みコミットは `5064b4e013d64cb9498a22abd3d430e768a114f3`。

## 結果

[Desktop checks](https://github.com/menma22/floatnote/actions/runs/41363466315) の Windows x64・Apple Silicon Mac・Intel Mac の3ジョブが成功した。

- 単体35件: Windows と macOS で成功。
- Windows: ヘッダー、編集・保存・再起動、別アプリの入力保持、閉じた付箋の復元の4ケースと、配布実行ファイルの起動・編集・最大化・復元が成功。
- Apple Silicon Mac: 上記4ケースに加え、Command編集・新規作成・一覧・ネイティブClose・Dock activationイベント経由の再表示が成功。生成した Universal アプリの起動・編集・最大化・復元も成功。
- Intel Mac: Apple Silicon 上で作った同じ Universal ZIP を取得・展開し、全バイナリの構造・署名と、アプリの起動・編集・最大化・復元を確認した。

## 追加条件の照合

| 条件 | 実装・証拠 | 結果 |
| --- | --- | --- |
| H1 カーソル内外でヘッダー表示を切り替える | [style.css](../src/style.css)、[app.spec.js](../tests/e2e/app.spec.js) | 両OSで成功。非表示時は背景・区切り線・操作をまとめて隠す |
| H2 本文・キャレット・スクロール位置を動かさない | ヘッダーのレイアウトを維持して opacity を切り替え、本文領域の座標・内容・scrollTopを照合 | 両OSで成功。本文の領域を拡大したという意味ではない |
| H3 編集フォーカスだけでは表示せず、キーボード操作を見せる | ヘッダー内の `:focus-visible`、Shift+Tab/Tabでの実操作 | 両OSで成功 |
| H4 パレットの閉鎖と一覧ヘッダーの維持 | [main.js](../src/main.js) の pointerleave、一覧を別クラスで描画 | 両OSで成功 |
| H5 AIに渡せる導入案内 | [インストール v3](install-v3.md) | OS別のファイル選択・SHA256照合・本人操作が必要な場面を記載 |
| M1 Macで既存機能が動く | macOS runnerで5ケースを実行 | 成功 |
| M2 Command操作と標準メニュー | [platform-menu.cjs](../electron/platform-menu.cjs)、Mac専用ケース | コピー・切り取り・貼り付け・Undo/Redo・新規・一覧と、CocoaのClose処理を確認 |
| M3 Universalに両CPUの実行コードを含む | [inspect-mac-package.mjs](../scripts/inspect-mac-package.mjs) | 全物理Mach-Oファイルに arm64 と x86_64 があることを両runnerで確認 |
| M4 Mac配布アプリ自体を使える | [packaged.spec.js](../tests/e2e/packaged.spec.js) | Apple SiliconとIntelの両方で成功 |
| M5 公開ファイルとチェックサムが揃う | [手動公開workflow](../.github/workflows/publish.yml) | 成功済みCIのartifactと両Macの検査結果を照合し、同一ファイルを再ビルドせず公開する構成 |

この記録はアプリの検証完了時点の照合。外部公開工程の結果の正本は [v0.1.1 Release](https://github.com/menma22/floatnote/releases/tag/v0.1.1)、添付の `SHA256SUMS.txt`、および [公開workflowのログ](https://github.com/menma22/floatnote/actions/workflows/publish.yml) とする。

## 実測で修正したMac固有の条件

当初は Windows と同じ `showInactive()` の呼出しで、最小化から戻す Mac の付箋へ入力フォーカスが移った。修正後は native な最小化解除の間だけ `setFocusable(false)` を使い、`restore` 後に一時的な最前面レベルを再適用する。表示後に元の focusable を復元する。反復通知・終了・例外時の後始末も同じ状態を回収する。

検証では別プロセスの入力用アプリを前面に置き、本番スケジューラの期限だけを短縮した。付箋のfocusイベントが0回、入力用アプリのblurイベントが0回で、文字入力が継続することと最前面固定の解除を確認した。Windowsも同じ別プロセスのケースで成功した。

Macの `Meta+W` をCDPから送ることはCocoaメニューの配送と同じではないため、ネイティブCloseは対象ウィンドウのフォーカスを確認して `Menu.sendActionToFirstResponder('performClose:')` から実行した。物理キーボードによるOSのCmd+W配送を試したという意味ではない。

## 配布上の制約

Windows 10/11 x64 と macOS 13 Ventura 以降が対象。Mac は Universal 版で、アドホック署名を検査済みだが、Developer ID署名・Appleの公証は付けていない。Windows版は未署名。インストールや初回起動で本人の確認が必要な場合があり、すべてのPCで無警告に導入できるとは保証しない。

インストーラーの本人PCへの実インストール、インターネット経由で取得したMacアプリへのGatekeeper操作、実際のOSスリープ・ロック・排他フルスクリーンは未実測。これらと、検証済みのアプリ起動・保存・再表示は区別する。起動中の旧版は、データを保存して終了してから更新する。
