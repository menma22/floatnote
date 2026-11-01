# Floatnote のインストール v2

Floatnote は配布ファイルからインストールでき、Node.js・Git・開発環境は不要です。2026-11-01 の本ガイド作成時点では、公開版は Windows 向け v0.1.0 で、Mac 版は v0.1.1 での公開準備中です。公開後は以下の同じ最新版リンクから取得できます。

作成日: 2026-11-01。前版: [v1](install-v1.md)。Mac の Universal 版と、OS に応じた AI 用の依頼文を追加しました。

- [公開リポジトリ](https://github.com/menma22/floatnote)
- [最新版のダウンロード](https://github.com/menma22/floatnote/releases/latest)

## 配布ファイルを選ぶ

最新版のページの Assets から、利用する OS に合うファイルを選びます。同じ Release の `SHA256SUMS.txt` もダウンロードしてください。

| 環境 | 選ぶファイル |
| --- | --- |
| Windows 10/11 の x64（64bit）版 | `Floatnote-Setup-<バージョン>.exe` |
| macOS 13 Ventura 以降（Apple Silicon・Intel） | `Floatnote-<バージョン>-mac-universal.dmg` または `.zip` |

Mac の Universal 版は Apple Silicon と Intel の両方に対応します。利用する Electron の条件により、[macOS 13 以降が必要](https://www.electronjs.org/blog/electron-44-0#removed-macos-12-support)です。利用する Release の説明も確認し、対象 OS の配布ファイルがない場合は対応版の公開を待ってください。

## Windows にインストールする

1. インストーラーと `SHA256SUMS.txt` をダウンロードします。
2. PowerShell の `Get-FileHash -Algorithm SHA256 -LiteralPath '<保存したインストーラーのパス>'` で SHA256 を計算し、`SHA256SUMS.txt` の同じファイル名の値と照合します。不一致・確認不能なら実行しません。
3. インストーラーを実行し、現在のユーザー向けにインストールします。
4. Floatnote を起動し、付箋ウィンドウが表示されることを確認します。スタートメニューからも開けます。

Windows 版は未署名です。警告や発行元の確認が表示された場合は、表示内容と配布元を本人が確認してください。

## Mac にインストールする

1. Universal 版の DMG または ZIP と、同じ Release の `SHA256SUMS.txt` をダウンロードします。
2. ターミナルの `shasum -a 256 '<保存したDMGまたはZIPのパス>'` で SHA256 を計算し、`SHA256SUMS.txt` の同じファイル名の値と照合します。不一致・確認不能なら開きません。
3. DMG を開くか ZIP を展開し、中の `Floatnote.app` を Applications（アプリケーション）フォルダへコピーします。認証を求められた場合は本人が対応します。
4. コピー先の `Floatnote.app` を開き、付箋ウィンドウが表示されることを確認します。

Mac 版には Developer ID による署名と Apple の公証（notarization）を付けていません。ビルド上のアドホック署名は、Developer ID による発行元の証明とは異なります。

macOS の Gatekeeper により起動が止まる場合があります。その場合は、本人が配布元と警告を確認し、[Apple 公式の案内](https://support.apple.com/en-us/102445)に従って判断してください。PC の設定や管理方針によっては起動を許可できません。セキュリティ機能を無効にする操作は、このインストール手順に含みません。

## 自分の AI に頼む

以下を、この PC でダウンロード・ファイル確認・アプリ操作ができる AI に渡せます。対応する操作や本人の操作が必要な場面は、利用する AI と PC の設定によって異なります。

```text
この PC に Floatnote をインストールして起動してください。

配布元: https://github.com/menma22/floatnote
最新版: https://github.com/menma22/floatnote/releases/latest

1. この PC の OS・バージョン・CPU を確認してください。
2. 配布元の最新の正式 Release を一度特定し、動作条件を確認してください。
   Windows 10/11 x64 なら Floatnote-Setup-<バージョン>.exe、
   macOS 13 以降の Apple Silicon または Intel なら mac-universal の DMG または ZIP を選び、
   同じ Release の SHA256SUMS.txt と一緒にダウンロードしてください。
   対応する配布物がない、または動作条件を満たさない場合は作業を止めて知らせてください。
3. 配布ファイルの SHA256 を計算し、SHA256SUMS.txt 内の同じファイル名の値と
   照合してください。不一致・確認不能なら実行せず知らせてください。
4. Windows なら通常のインストーラーで現在のユーザー向けにインストールしてください。
   Mac なら DMG を開くか ZIP を展開し、Floatnote.app を Applications へコピーしてください。
5. インストール先の Floatnote を起動し、付箋ウィンドウが表示されることを確認してください。

Node.js・Git・開発環境の導入や、ソースコードからのビルドは不要です。
Windows 版は未署名で、Mac 版は Developer ID による署名・Apple の公証がありません。
本人の認証やセキュリティ警告への判断が必要になったら、内容を説明して待ってください。
セキュリティ機能の無効化や、警告を回避するコマンドの実行はしないでください。
```

## ソースコードを変更したい場合

開発環境が必要なのは、ソースコードから起動・変更・ビルドする場合です。[README の開発手順](../README.md#開発)を参照してください。
