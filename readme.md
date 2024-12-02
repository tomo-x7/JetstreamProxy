## 概要
Jetstreamをプロキシするサーバーです。  
ローカル内に複数のフィードジェネレーターを建てる場合に、通信量を抑えることができます。
# 使い方
1. `.env.example`をコピーし、名前を`.env`に変更する
1. `pnpm install --frozen-lockfile`する
1. `pnpm run build`する
1. `pnpm run start`する
1. `ws://localhost:8000`に接続する
## 設定
`.env`ファイルに書く
|項目|説明|
|-|-|
|`wantedCollection`|必要な`collection`をJSON配列形式で記述|
|`wsURL`|`Jetstream`のURL|
|`port`|サーバーを建てるポート番号|
## 対応しているJetstream引数
- wantedCollection
    - .`env`で指定した`wantedCollection`に含まれるもののみ使用可能
    - それ以外が含まれる場合はエラーを返します
    - 接続URLで指定しない場合はサーバー側で設定したすべてになります
それ以外の引数をURLに含めても何も起こりません。また、サーバーに対し何かを送っても何も起こりません。
## 環境
node20.18.1で動作確認済み  
pnpm使用