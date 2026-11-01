# Floatnote のインストール v1

Floatnote は、公開している Windows 用インストーラーから利用できます。利用するだけなら Node.js・Git・開発環境は不要です。対応環境は **Windows 10/11 の x64（64bit）版**です。

- [公開リポジトリ](https://github.com/menma22/floatnote)
- [最新版のダウンロード](https://github.com/menma22/floatnote/releases/latest)

## 自分でインストールする

1. 最新版のページを開き、同じ Release の Assets から `Floatnote-Setup-<バージョン>.exe` と `SHA256SUMS.txt` をダウンロードします。
2. PowerShell の `Get-FileHash -Algorithm SHA256 -LiteralPath '<保存したインストーラーのパス>'` で SHA256 を計算し、`SHA256SUMS.txt` の同じファイル名の値と一致することを確認します。一致しなければ実行しません。
3. インストーラーを実行し、現在のユーザー向けにインストールします。
4. インストール完了後、Floatnote を起動します。スタートメニューからも開けます。

配布物は未署名です。Windows の警告や発行元の確認が表示される場合があります。表示内容と配布元を本人が確認してください。

## 自分の AI に頼む

以下を、Windows PC でダウンロード・ファイル確認・アプリの操作ができる AI に渡せます。対応する操作や本人の操作が必要な場面は、利用する AI と PC の設定によって異なります。

```text
この Windows PC に Floatnote をインストールして起動してください。

配布元: https://github.com/menma22/floatnote
最新版: https://github.com/menma22/floatnote/releases/latest

1. この PC が Windows 10/11 の x64 版か確認してください。
2. 配布元の最新の正式 Release を一度特定し、その同じ Release から
   Floatnote-Setup-<バージョン>.exe と SHA256SUMS.txt をダウンロードしてください。
3. ダウンロードした exe の SHA256 を計算し、SHA256SUMS.txt 内の
   同じファイル名の値と照合してください。不一致・確認不能なら実行せず知らせてください。
4. 通常のインストーラーで、現在のユーザー向けにインストールしてください。
5. Floatnote を起動し、付箋ウィンドウが表示されることを確認してください。

Node.js・Git・開発環境の導入や、ソースコードからのビルドは不要です。
配布物は未署名です。Windows や AI の仕組みが本人の確認・操作を求めた場合は、
必要な内容を説明してそこで待ってください。セキュリティ機能を無効にしないでください。
```

## ソースコードを変更したい場合

開発環境が必要なのは、ソースコードから起動・変更・ビルドする場合です。[README の開発手順](../README.md#開発)を参照してください。
