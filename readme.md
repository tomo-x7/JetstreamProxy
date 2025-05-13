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
|項目|説明|デフォルト値|
|-|-|-|
|`wantedCollections`|必要な`collection`をJSON配列形式で記述※|
|`wsURL`|`Jetstream`のURL|`wss://jetstream2.us-west.bsky.network/subscribe`|
|`port`|サーバーを建てるポート番号|`8000`|  

※:必ず指定してください。空配列は今の所エラーになります。理由は、JetstreamのwantedCollections未指定時に全コレクションが取得される仕様に追従するのが面倒だったからです。要望があれば実装します。PRも歓迎です。
## 対応しているJetstream引数
- wantedCollections
    - .`env`で指定した`wantedCollections`に含まれるもののみ使用可能
    - それ以外が含まれる場合はエラーを返します
    - 接続URLで指定しない場合はサーバー側で設定したすべてになります
それ以外の引数をURLに含めても何も起こりません。また、サーバーに対し何かを送っても何も起こりません。
## 環境
node20.19.1で動作確認済み  
pnpm使用