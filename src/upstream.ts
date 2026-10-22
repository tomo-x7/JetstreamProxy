// 主にJetstream本体サーバーとの通信
import { createDCtx, decompressUsingDict, freeDCtx } from "@bokuweb/zstd-wasm";
import { WebSocket } from "partysocket";
import WS from "ws";
import type { ClientHub } from "./clients.js";
import { logger } from "./logger.js";
import type { Protocol, UpstreamEvent } from "./types.js";

/** 購読内容の変更をまとめるために、再接続するまで待つ時間 */
const RECONNECT_DEBOUNCE_MS = 300;
/** 購読内容の変更で再接続するとき、通信の遅延を見込んで巻き戻す時間 */
const RESUME_MARGIN_US = 1_000_000;

export async function connectUpstream(protocol: Protocol, base: URL, hub: ClientHub) {
	let dictionary = await protocol.loadDictionary(base);
	let dictionaryMaybeStale = false;
	const resume = createResumeTracker();

	const getURL = async () => {
		// 辞書が更新されると古い辞書IDでは接続できないので取り直す
		if (dictionaryMaybeStale) {
			dictionary = await protocol.loadDictionary(base).catch((e) => {
				logger.error(`Failed to reload zstd dictionary: ${String(e)}`);
				return dictionary;
			});
			dictionaryMaybeStale = false;
		}
		const url = protocol.upstreamURL(base, { subscription: hub.subscription, cursor: resume.cursor, dictionary });
		return url.toString();
	};
	const upstream = new WebSocket(getURL, [], { WebSocket: WS });
	// Blobだと非同期に読むことになり、順番が入れ替わるとseqの重複判定を誤る
	upstream.binaryType = "arraybuffer";

	upstream.onmessage = (ev) => {
		const data: ArrayBuffer | string = ev.data;
		const compressed = typeof data === "string" ? Buffer.from(data, "utf-8") : Buffer.from(data);
		const event = decode(protocol, compressed, dictionary);
		if (event === undefined || resume.isDuplicate(event)) return;
		resume.record(event);
		hub.broadcast(event);
	};

	let reconnectTimer: NodeJS.Timeout | undefined;
	let lastSubscription = JSON.stringify(serializable(hub.subscription));
	hub.onChange(() => {
		const subscription = hub.subscription;
		// 購読内容が変わらなければ何もしない
		const serialized = JSON.stringify(serializable(subscription));
		if (serialized === lastSubscription) return;
		lastSubscription = serialized;
		logger.upstreamUpdate(subscription);

		const message = protocol.updateMessage(subscription);
		if (message !== undefined) return upstream.send(message);
		// 接続中に変更できないので、カーソルを付けて再接続する
		clearTimeout(reconnectTimer);
		reconnectTimer = setTimeout(() => {
			resume.prepareForSubscriptionChange();
			upstream.reconnect();
		}, RECONNECT_DEBOUNCE_MS);
	});

	await new Promise<void>((resolve, reject) => {
		const to = setTimeout(() => {
			logger.error("Upstream initial connection timeout");
			reject(new Error("Upstream initial connection timeout"));
		}, 10 * 1000);
		upstream.onopen = () => {
			logger.info(`Connected to upstream server: ${upstream.url}`);
			clearTimeout(to);
			resolve();
		};
		upstream.onerror = (err) => {
			logger.error(`Upstream connection error: ${String(err)}`);
			clearTimeout(to);
			reject(err);
		};
	});
	upstream.onopen = () => logger.info(`Connected to upstream server: ${upstream.url}`);
	upstream.onerror = (err) => {
		logger.error(`Upstream connection error: ${String(err)}`);
		dictionaryMaybeStale = true;
	};
}

function decode(protocol: Protocol, compressed: Buffer, dictionary: Buffer): UpstreamEvent | undefined {
	try {
		return protocol.parseFrame(decompress(compressed, dictionary), compressed);
	} catch (e) {
		// 壊れたデータはログに残して破棄する
		logger.error(`Failed to decode upstream message: ${String(e)}`);
		return undefined;
	}
}

function decompress(data: Buffer, dictionary: Buffer): string {
	const dctx = createDCtx();
	try {
		return Buffer.from(decompressUsingDict(dctx, data, dictionary)).toString("utf-8");
	} finally {
		freeDCtx(dctx);
	}
}

/**
 * 再接続したときに、どこから受け取り直すかを管理する(v2のみ)。
 * カーソルは指定した位置を含むので、既に受け取ったseqは重複として捨てる
 */
function createResumeTracker() {
	let lastSeq: number | undefined;
	let lastWitnessedAtUs: number | undefined;
	let lastReceivedAt = 0;
	let cursor: number | undefined;
	return {
		get cursor() {
			return cursor;
		},
		isDuplicate: (event: UpstreamEvent) => event.seq !== undefined && lastSeq !== undefined && event.seq <= lastSeq,
		record(event: UpstreamEvent) {
			if (event.seq !== undefined) lastSeq = event.seq;
			if (event.witnessedAtUs === undefined) return;
			lastWitnessedAtUs = event.witnessedAtUs;
			lastReceivedAt = Date.now();
			// 通信が切れて再接続したときは、最後に受け取ったイベントから受け取り直す
			cursor = lastWitnessedAtUs;
		},
		/**
		 * 購読内容の変更で再接続するときは、今に近い位置から受け取り直す。
		 * 最後のイベントから時間が空いていると、新しいクライアント向けに古いイベントが大量に流れてしまうため
		 */
		prepareForSubscriptionChange() {
			if (lastWitnessedAtUs === undefined) return;
			const elapsedUs = (Date.now() - lastReceivedAt) * 1000;
			cursor = lastWitnessedAtUs + Math.max(0, elapsedUs - RESUME_MARGIN_US);
		},
	};
}

function serializable(subscription: ClientHub["subscription"]) {
	if (subscription === undefined) return undefined;
	const sorted = (set: ReadonlySet<string> | "all") => (set === "all" ? "all" : Array.from(set).sort());
	return { kinds: sorted(subscription.kinds), collections: sorted(subscription.collections) };
}
