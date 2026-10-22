# JetstreamProxy
[![CodeQL](https://github.com/tomo-x7/JetstreamProxy/actions/workflows/codeql.yml/badge.svg)](https://github.com/tomo-x7/JetstreamProxy/actions/workflows/codeql.yml)
[![typecheck and test](https://github.com/tomo-x7/JetstreamProxy/actions/workflows/test.yml/badge.svg)](https://github.com/tomo-x7/JetstreamProxy/actions/workflows/test.yml)
[![lint and format](https://github.com/tomo-x7/JetstreamProxy/actions/workflows/biome.yml/badge.svg)](https://github.com/tomo-x7/JetstreamProxy/actions/workflows/biome.yml)  
Jetstreamをプロキシするサーバーです。  
ローカル内に複数のフィードジェネレーターを建てる場合に、通信量を抑えることができます。
## 機能
### zstd圧縮
Jetstreamとの通信をzstd圧縮することで、帯域幅の消費を56%~削減します。解凍はProxyが行うので、面倒なzstd解凍の実装を行うことなく帯域幅の消費を削減できます。  
v2では、起動時にJetstreamからダウンロードした辞書を使って圧縮します。
### リアルタイムコレクション更新
クライアントの接続/切断時にリアルタイムでJetstreamに要求するコレクションを更新します。これにより未接続時の帯域幅の消費を抑えることができます。  
この機能はv2でも動作します。v2では接続中にフィルタを変更できないため、接続しているクライアントが変わるとカーソルを指定してJetstreamに再接続します。再接続の間に既存のクライアントがイベントを取りこぼしたり、重複して受け取ったりしないようにしています。
### Jetstream v2対応
[Jetstream v2](https://github.com/bluesky-social/jetstream/blob/main/docs/README.md)に対応しています。  
v1とv2のどちらを使うかは`--jetstream-version`で選びます。起動した1つのインスタンスが扱うのは1つのバージョンだけですが、同じバイナリで両方に対応しています。  
v2モードでは、公式のJetstream v2エンドポイント(`network.bsky.jetstream.subscribeEvents`)に接続します。
## 使い方
1. [リリースページ](https://github.com/tomo-x7/Jetstreamproxy/releases)から最新版をダウンロードする
1. 展開する
1. `jetstreamproxy`という名前のファイルを直接実行する(オプションを任意でつけてください)
1. 接続する
	- v1: `ws://localhost:8000`
	- v2: `ws://localhost:8000/xrpc/network.bsky.jetstream.subscribeEvents`
### 設定
コマンドラインオプションで渡す
|オプション|説明|デフォルト値|
|-|-|-|
|`--jetstream-version <v1\|v2>`|Jetstreamのプロトコルバージョン|`v1`|
|`-u, --upstream <url>`|`Jetstream`のURL(`ws://`または`wss://`)|v1: `wss://jetstream2.us-west.bsky.network/subscribe`<br>v2: `wss://jetstream.us-east.bsky.network/xrpc/network.bsky.jetstream.subscribeEvents`|
|`-p, --port <port>`|JetstreamProxyを起動するポート番号|`8000`|
|`-l, --log-file <path>`|ログファイルの場所|本体がある場所と同じディレクトリにlog.txtを作成|
|`-h, --help`|使い方を表示する|-|

コマンド例
```SH
./jetstreamproxy --jetstream-version v2 -p 8000 -l ./log.txt
```
#### 旧形式からの移行
位置引数は廃止されました(破壊的変更)。  
`./jetstreamproxy <url> <port> <log>`は`./jetstreamproxy -u <url> -p <port> -l <log>`に書き換えてください。
### 対応しているクエリパラメータ
#### v1
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
#### v2
- `collections`
	- NSIDまたは`<prefix>.*`を指定します
	- 複数指定できます(最大100個)
	- Jetstream v2と同様に、commitイベントのみを絞り込みます
- `kinds`
	- `commit`・`identity`・`account`・`sync`のいずれかを指定します
	- 複数指定できます

例
```URL
ws://localhost:8000/xrpc/network.bsky.jetstream.subscribeEvents?collections=app.bsky.feed.post&collections=app.bsky.graph.*&kinds=commit
```
クライアントには、Jetstream v2が送るものと同じフレーム(xrpc.v1.jsonのエンベロープ`{"$type":"message","payload":{...}}`)が非圧縮で届きます。

以下の場合は、アップグレード前にHTTP 400とXRPCエラーのJSON(`{"error":"InvalidRequest",...}`)を返して拒否します。
- 非対応のパラメータ: `dids`・`cursor`・`zstdDictionary`・`maxMessageSizeBytes`
- v1のパラメータ: `wantedCollections`・`wantedDids`・`requireHello`・`compress`
- 不正な値

それ以外の未知の引数は無視されます。  
また、Jetstream v2と同様に、クライアントからメッセージを送ってはいけません。送ると接続が切断されます。
## 環境
配布バイナリはLinuxのみ  
ubuntu 24.04で動作確認済み  
nodeは22LTSが推奨ですがたぶん20でも動きます
