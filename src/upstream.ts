// 主にJetstream本体サーバーとの通信
import type EventEmitter from "node:events";
import { WebSocket } from "partysocket";
import WS from "ws";
import { logger } from "./logger.js";
import type { Config, OptionUpdateMsg, UpstreamEventMap } from "./types.js";

export async function createUpstream(config: Config, emitter: EventEmitter<UpstreamEventMap>) {
	const wantedCollections = new Set<string>();
	let allMode = false;
	const url = new URL(config.upstreamURL);
	url.searchParams.set("compress", "true");
	url.searchParams.set("requireHello", "true");
	const getURL = () => {
		const url = new URL(config.upstreamURL);
		url.searchParams.set("compress", "true");
		// 全取得モードの場合はwantedCollectionsを削除
		if (allMode) {
			url.searchParams.delete("wantedCollections");
		} else {
			// クライアントが接続されていない場合
			if (wantedCollections.size === 0) {
				url.searchParams.set("requireHello", "true");
			} else {
				for (const collection of wantedCollections) {
					url.searchParams.append("wantedCollections", collection);
				}
			}
		}
		return url.toString();
	};
	const upstream = new WebSocket(getURL, [], { WebSocket: WS });
	upstream.onmessage = async (ev) => {
		const raw: Blob | ArrayBuffer | string = ev.data;
		if (raw instanceof Blob) {
			const ab = await raw.arrayBuffer();
			emitter.emit("message", ab);
		} else {
			emitter.emit("message", raw);
		}
	};
	emitter.on("updateWantedCollections", (collections) => {
		if (collections === "all") {
			allMode = true;
			upstream.send(createOptionUpdateMsg(undefined));
			logger.upstreamUpdate("all");
		} else {
			allMode = false;
			wantedCollections.clear();
			for (const collection of collections) wantedCollections.add(collection);
			if (wantedCollections.size === 0) wantedCollections.add("example.dummy.collection");
			upstream.send(createOptionUpdateMsg(wantedCollections));
			logger.upstreamUpdate(wantedCollections);
		}
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
}

function createOptionUpdateMsg(wantedCollections: Set<string> | undefined): string {
	if (wantedCollections?.size === 0) {
		const msg: OptionUpdateMsg = {
			type: "options_update",
			payload: {
				wantedCollections: ["example.dummy.collection"],
			},
		};
		return JSON.stringify(msg);
	}
	const msg: OptionUpdateMsg = {
		type: "options_update",
		payload: {
			wantedCollections: wantedCollections != null ? Array.from(wantedCollections) : undefined,
		},
	};
	return JSON.stringify(msg);
}
