import { type RawData, WebSocket } from "ws";

export class WebSocketClient {
	private webSocket: WebSocket | undefined = undefined;
	private reconnectTimer: NodeJS.Timeout | undefined = undefined;
	private readonly RECONNECT_DELAY_MS = 1000;

	/**
	 * @param url 接続先のURL
	 * @param onMessage メッセージ受信時のコールバック
	 */
	constructor(
		private url: URL,
		private readonly onMessage: (data: RawData) => void,
		private readonly getReconnectURL: () => URL,
	) {
		this.connect();
	}

	/**
	 * WebSocketサーバーに接続する
	 */
	private connect(): void {
		try {
			// 既存の接続があれば切断
			if (this.webSocket) {
				this.webSocket.removeAllListeners();
				if (this.webSocket.readyState === WebSocket.OPEN) {
					this.webSocket.close();
				}
			}

			// 新しい接続を作成
			this.webSocket = new WebSocket(this.url);

			// イベントハンドラを設定
			this.webSocket.on("open", () => {
				console.log(`WebSocket connected to ${this.url.toString()}`);
				// 再接続タイマーがあればクリア
				if (this.reconnectTimer) {
					clearTimeout(this.reconnectTimer);
					this.reconnectTimer = undefined;
				}
			});

			this.webSocket.on("message", this.onMessage);

			this.webSocket.on("error", (error) => {
				console.error("WebSocket error:", error);
				// エラー時は特に何もしない（close イベントが発生するはず）
			});

			this.webSocket.on("close", (code, reason) => {
				console.log(`WebSocket closed. Code: ${code}, Reason: ${reason.toString()}`);
				this.reconnect();
			});
		} catch (error) {
			console.error("Failed to create WebSocket:", error);
			this.reconnect();
		}
	}

	/**
	 * 再接続を試みる
	 */
	private reconnect(): void {
		// 既に再接続タイマーが設定されている場合は何もしない
		if (this.reconnectTimer) return;
		this.url = this.getReconnectURL();

		this.reconnectTimer = setTimeout(() => {
			console.log("Attempting to reconnect...");
			this.reconnectTimer = undefined;
			this.connect();
		}, this.RECONNECT_DELAY_MS);
	}

	/**
	 * メッセージを送信する
	 * @param data 送信するデータ
	 */
	public send(data: string): void {
		if (this.webSocket?.readyState === WebSocket.OPEN) {
			this.webSocket.send(data);
		} else {
			console.error("Cannot send message: WebSocket is not open");
		}
	}
}
