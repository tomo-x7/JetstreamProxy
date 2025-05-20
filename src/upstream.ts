// 主にJetstream本体サーバーとの通信
import EventEmitter from "node:events";
import { ZSTDDecoder } from "zstddec";
import { Config, OptionUpdateMsg, UpstreamEventMap } from "./types.js";
import { RawData, WebSocket } from "ws";
import { WebSocketClient } from "./ws.js";
import { Decompressor } from "zstd-napi";
import { ZstdDictionary } from "./dict/zstd-dictionary.js";
import type { AccountEvent, IdentityEvent, CommitEvent } from "@skyware/jetstream";

export async function createUpstream(config: Config, emitter: EventEmitter<UpstreamEventMap>) {
	const wantedCollections = new Set<string>();
	let allMode = false;
	const url = new URL(config.upstreamURL);
	url.searchParams.set("compress", "true");
	url.searchParams.set("requireHello", "true");
	const listener = (rawdata: RawData) => {
		emitter.emit("message", rawdata);
	};
	const reconnectURL = () => {
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
		return url;
	};
	const upstreamWs = new WebSocketClient(url, listener, reconnectURL);
	emitter.on("updateWantedCollections", (collections) => {
		if (collections === "all") {
			allMode = true;
			upstreamWs.send(createOptionUpdateMsg(undefined));
		} else {
			allMode = false;
			wantedCollections.clear();
			for (const collection of collections) wantedCollections.add(collection);
			upstreamWs.send(createOptionUpdateMsg(wantedCollections));
		}
	});
}

function createOptionUpdateMsg(wantedCollections: Set<string> | undefined): string {
	const msg: OptionUpdateMsg = {
		type: "options_update",
		payload: {
			wantedCollections: wantedCollections != null ? Array.from(wantedCollections) : undefined,
		},
	};
	return JSON.stringify(msg);
}
