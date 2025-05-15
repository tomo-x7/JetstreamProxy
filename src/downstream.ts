// 主にProxyに接続しているクライアントとの通信
import type { EventEmitter } from "node:events";
import { type WebSocket, WebSocketServer, } from "ws";
import type { Config } from "./config.js";
import type { EventMap } from "./types.js";
import { randomUUID } from "node:crypto";

let server: WebSocketServer | null = null;
export function createDownstream(config: Config, eventEmitter: EventEmitter<EventMap>) {
	if (server != null) {
		throw new Error("Downstream server is already created");
	}
	server = new WebSocketServer({ port: config.proxyPort });
	server.on("close", () => {
		server = null;
	});
	server.on("error", (err) => {
		console.error("downstream Server Error:", err);
	});
	server.on("listening", () => {
		console.log(`proxy server listening on port ${config.proxyPort}`);
	});
	server.on("connection", createListener(eventEmitter));
}

function createListener(emitter: EventEmitter<EventMap>): (ws: WebSocket) => void {
	return (ws) => {
		const sp = new URL(ws.url, "ws://example.com").searchParams;
		const wantedCollections = new Set<string>(sp.getAll("wantedCollections"));
		const id = randomUUID();
		emitter.emit("updateWantedCollections", wantedCollections, id);
		emitter.on("rejectUpdate", (rejectid, reason) => {
			if (rejectid === id) {
				ws.close(4000, reason);
			}
		});
		const filter = createFilter(wantedCollections);
		emitter.on("recieve", (event, collection,raw) => {
            // TODO:クライアントサイド向け圧縮(rawを使う)
			if (event.kind === "account" || event.kind === "identity") {
				return void ws.send(JSON.stringify(event));
			}
			if (event.kind === "commit" && collection != null) {
				if (filter(collection)) return void ws.send(JSON.stringify(event));
			}
			console.log("unknown event", event, collection);
		});
        // TODO:クライアントからのメッセージの受信をするかも
	};
}
// TODO:設定できるようにしてもいいかも
const CACHE_LIST = ["app.bsky.feed.post", "app.bsky.graph.follow", "app.bsky.feed.repost", "app.bsky.feed.like"];
function createFilter(wantedCollections: Set<string>): (collection: string) => boolean {
	// 空の場合は全部
	if (wantedCollections.size === 0) {
		return () => true;
	}
	const cache = new Map<string, boolean>();
	for (const item of CACHE_LIST) {
		cache.set(item, filter(wantedCollections, item));
	}
	return (collection) => {
		const cached = cache.get(collection);
		if (cached != null) return cached;
		return filter(wantedCollections, collection);
	};
}

function filter(wanted: Set<string>, collection: string): boolean {
	for (const item of wanted) {
		if (collection.startsWith(item.replace("*", ""))) return true;
	}
	return false;
}
