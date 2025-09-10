# JetstreamProxy
[![CodeQL](https://github.com/tomo-x7/JetstreamProxy/actions/workflows/codeql.yml/badge.svg)](https://github.com/tomo-x7/JetstreamProxy/actions/workflows/codeql.yml)
[![typecheck and test](https://github.com/tomo-x7/JetstreamProxy/actions/workflows/test.yml/badge.svg)](https://github.com/tomo-x7/JetstreamProxy/actions/workflows/test.yml)
[![lint and format](https://github.com/tomo-x7/JetstreamProxy/actions/workflows/biome.yml/badge.svg)](https://github.com/tomo-x7/JetstreamProxy/actions/workflows/biome.yml)  
Jetstreamをプロキシするサーバーです。  
ローカル内に複数のフィードジェネレーターを建てる場合に、通信量を抑えることができます。
## 機能
### zstd圧縮
Jetstreamとの通信をzstd圧縮することで、帯域幅の消費を56%~削減します。解凍はProxyが行うので、面倒なzstd解凍の実装を行うことなく帯域幅の消費を削減できます。
### リアルタイムコレクション更新
クライアントの接続/切断時にリアルタイムでJetstreamに要求するコレクションを更新します。これにより未接続時の帯域幅の消費を抑えることができます。
## 使い方
1. [リリースページ](https://github.com/tomo-x7/Jetstreamproxy/releases)から最新版をダウンロードする
1. 展開する
1. `jetstreamproxy`という名前のファイルを直接実行する(引数を任意でつけてください)
1. `ws://localhost:8000`に接続する
### 設定
引数で渡す
|項目|説明|デフォルト値|
|-|-|-|
|第一引数|`Jetstream`のURL|`wss://jetstream2.us-west.bsky.network/subscribe`|
|第二引数|JetstreamProxyを起動するポート番号|`8000`|  
|第三引数|ログファイルの場所|本体がある場所と同じディレクトリにlog.txtを作成|  

コマンド例
```SH
./jetstreamproxy wss://jetstream2.us-west.bsky.network/subscribe 8000 ./log.txt
```
### 対応しているクエリパラメータ
- `wantedCollections`
	- Jetstreamの挙動を模倣しています
- `compress`
	- Jetstreamと同様の、カスタム辞書を用いたzstd圧縮をします
	- この設定に関わらずJetstreamとの通信は圧縮されます
- `onlyCommit`
	- 独自拡張の引数です
	- 設定すると`Account`Eventと`Identity`Eventを無視します

例
```URL
ws://localhost:8000?wantedCollections=app.bsky.feed.post&wantedCollections=app.bsky.feed.like&onlyCommit
```
それ以外の引数をURLに含めても何も起こりません。  
また、サーバーに対し何かを送っても何も起こりません。
## 環境
配布バイナリはLinuxのみ  
ubuntu 24.04で動作確認済み  
nodeは22LTSが推奨ですがたぶん20でも動きます
