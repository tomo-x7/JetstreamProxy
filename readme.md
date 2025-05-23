## 概要
Jetstreamをプロキシするサーバーです。  
ローカル内に複数のフィードジェネレーターを建てる場合に、通信量を抑えることができます。
# 使い方
1. [リリースページ](https://github.com/tomo-x7/Jetstreamproxy/releases)から最新版をダウンロードする
1. 展開する
1. `jetstreamproxy`という名前のファイルを直接実行する(引数を任意でつけてください)
1. `ws://localhost:8000`に接続する
## 設定
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
## 対応しているクエリパラメータ
- wantedCollections
	- Jetstreamの挙動を模倣しています
<!-- - compress
	- Jetstreamと同様の、カスタム辞書を用いたzstd圧縮をします -->
- onlyCommit
	- 独自拡張の引数です
	- これをtrueに設定するとAccount EventとIdentity Eventを無視します。  
それ以外の引数をURLに含めても何も起こりません。  
また、サーバーに対し何かを送っても何も起こりません。
## 環境
配布バイナリはLinuxのみ  
ubuntu 24.04で動作確認済み