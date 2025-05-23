import { type RawData, WebSocket } from "ws";
import { logger } from "./logger.js";

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
			logger.info(`Connecting to WebSocket: ${this.url}`)

			// イベントハンドラを設定
			this.webSocket.on("open", () => {
				// 再接続タイマーがあればクリア
				if (this.reconnectTimer) {
					clearTimeout(this.reconnectTimer);
					this.reconnectTimer = undefined;
				}
			});

			this.webSocket.on("message", this.onMessage);

			this.webSocket.on("error", (error) => {
				logger.error(`WebSocket error: ${error}`);
			});

			this.webSocket.on("close", (code, reason) => {
				logger.info(`WebSocket closed. Code: ${code}, Reason: ${reason.toString()}`);
				this.reconnect();
			});
		} catch (error) {
			logger.error(`Unable to create WebSocket connection: ${error}`);
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
			logger.info("Attempting to reconnect to WebSocket server...");
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
			logger.error("Cannot send message: WebSocket connection is not open.");
		}
	}
}
