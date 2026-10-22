export type JetstreamVersion = "v1" | "v2";

export interface Config {
	jetstreamVersion: JetstreamVersion;
	upstreamURL: URL;
	proxyPort: number;
	logFile: string;
}

export type EventKind = "commit" | "identity" | "account" | "sync";

/** 受け取りたいイベントの条件。collectionsはcommitイベントだけを絞り込む */
export interface Subscription {
	kinds: ReadonlySet<EventKind> | "all";
	collections: ReadonlySet<string> | "all";
}

/** upstreamから受け取ったイベント */
export interface UpstreamEvent {
	kind: EventKind;
	/** commitイベントのコレクション */
	collection?: string;
	/** v2のseq(カーソル) */
	seq?: number;
	/** v2でイベントが観測された時刻(unix microseconds) */
	witnessedAtUs?: number;
	/** 解凍済みのフレーム */
	text: string;
	/** upstreamから受け取った圧縮済みのフレーム */
	compressed: Buffer;
}

export interface UpstreamURLParams {
	/** undefinedならクライアントがいない */
	subscription: Subscription | undefined;
	/** 再開位置(unix microseconds) */
	cursor: number | undefined;
	dictionary: Buffer;
}

/** クライアントの接続を断るときの方法 */
export type Rejection =
	| { type: "http"; status: number; error: string; message: string }
	| { type: "close"; code: number; reason: string };

export type ClientRequest =
	| { ok: true; subscription: Subscription; compress: boolean }
	| { ok: false; rejection: Rejection };

/** Jetstreamのバージョンごとの違い */
export interface Protocol {
	/** upstreamのzstd辞書を読み込む */
	loadDictionary(upstreamURL: URL): Promise<Buffer>;
	/** upstreamへの接続URL */
	upstreamURL(base: URL, params: UpstreamURLParams): URL;
	/**
	 * 接続中のまま購読内容を変更するメッセージ。
	 * undefinedを返すバージョン(v2)は再接続して変更する
	 */
	updateMessage(subscription: Subscription | undefined): string | undefined;
	/** 解凍済みのフレームをパースする。転送しないフレームはログに残してundefinedを返す */
	parseFrame(text: string, compressed: Buffer): UpstreamEvent | undefined;
	/** クライアントの接続リクエストを検証する */
	parseClientRequest(url: URL): ClientRequest;
	/** collectionsの合計が上限を超えたときの断り方 */
	tooManyCollections: Rejection;
	/** クライアントへ送るデータ */
	frameForClient(event: UpstreamEvent, compress: boolean): string | Buffer;
	/** クライアントからメッセージが届いたときに切断するか */
	closeOnClientMessage: boolean;
	/** 対応するWebSocketサブプロトコル */
	subprotocol?: string;
}
