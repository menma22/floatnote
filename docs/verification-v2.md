# Floatnote 実装照合・検証 v2

検証日: 2026-11-01。前版: [v1](verification-v1.md)。機能の実装と実機検証結果は引き継ぎ、公開後に判明したビルド条件を追加する。

初回 GitHub Actions では、静的検査・単体32件・Electron操作3件は成功した。インストーラーも生成されたが、electron-builder 26.18.0 が CI を検出して暗黙の公開を試み、`GH_TOKEN` がないためジョブが失敗した。[初回ログ](https://github.com/menma22/floatnote/actions/runs/41309021276)

## ビルドの条件と修正

- `npm run package` はローカル配布物の生成だけを行い、外部へ公開しない。
- electron-builder に `--publish never` を明示する。公開用の権限やトークンを CI へ追加しない。
- Release の公開は、確認済みコミットとインストーラーを指定した明示的な操作で行う。
- 修正後の Windows ジョブで、インストーラー生成・配布実行ファイルの操作テスト・artifact 保存まで確認する。結果は [Actions](https://github.com/menma22/floatnote/actions) から辿れる。

この修正はビルドコマンドだけで、付箋の本文・保存・再表示・UI のコードは変更しない。
