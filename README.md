# Floatnote

Windows のための、定期的に手前へ戻る小さな付箋アプリ。

付箋ごとに周期を設定でき、初期値は **30 分**。手前に戻るときも、作業中のアプリから文字入力を奪いません。

![Floatnote の付箋](docs/images/floatnote.png)

## インストール

[Windows 版をダウンロード](https://github.com/menma22/floatnote/releases/latest)して、`Floatnote-Setup-0.1.0.exe` を実行します。Windows 10/11 の 64bit 版に対応。配布物は未署名です。

## 使い方

- `＋` で付箋を増やす。一覧ボタンで保存済みの付箋を開く。
- ヘッダーのスライダーで周期を **5〜120 分**の間で調整する。
- 色ボタンで付箋の色を選ぶ。
- `**太字**`、`- 箇条書き`、`1. 番号付きリスト` を入力して Enter で整形する。太字は `Ctrl+B` でも操作できる。
- `×` は付箋を閉じ、その付箋の周期を止める。本文は残り、一覧から開き直せる。
- 最小化した付箋は周期が来ると戻る。すべて閉じても、通知領域のアイコンから一覧を開ける。
- 完全に終了するには、通知領域アイコンのメニューで「終了」を選ぶ。

保存先は Windows の `%APPDATA%/Floatnote/notes.json`。メモは PC 内に保存し、外部へ送信しません。クラウド同期・ログインはありません。OS にログインしたときの自動起動は行いません。

## 開発

Windows 10/11、Node.js 22.12 以上が必要です。

```powershell
npm ci
npm start
```

```powershell
npm test          # 保存・モデル・周期の単体テスト
npm run test:e2e # 実際の Electron ウィンドウで操作確認
npm run check    # 書式と静的検査
npm run package  # release/ に Windows インストーラーを生成
```

Electron の main が保存・ウィンドウ・タイマーを管理し、Tiptap が本文を編集します。検証は一時データを使い、普段の付箋へ影響しません。ロック画面や Windows のセキュアデスクトップなどでは手前への表示を保証できません。

- [現在の要件・設計 v5](docs/spec-v5.md) — Windows の表示倍率と寸法復元
- [実装照合・検証 v2](docs/verification-v2.md) — 要件とコード、確認結果、CI ビルド条件
- [要件・設計 v4](docs/spec-v4.md) — 小さい初期サイズと淡い黄緑を反映
- [要件・設計 v3](docs/spec-v3.md) — 初期サイズを約半分へ変更
- [要件・設計 v2](docs/spec-v2.md) — 色選択とフォーカス方針
- [当初の要件・設計 v1](docs/spec-v1.md) — 実装前の基準と API 契約

MIT License
