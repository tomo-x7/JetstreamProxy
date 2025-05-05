import { exit } from "node:process";
import { type AccountEvent, type CommitEvent, type IdentityEvent, Jetstream } from "@skyware/jetstream";
import dotenv from "dotenv";
import WebSocket, { WebSocketServer } from "ws";
import type { BufferLike, configtype } from "./types.js";
dotenv.config();

const wantedCollections = process.env.wantedCollections
	? new Set<string>(JSON.parse(process.env.wantedCollections))
	: undefined;
if (wantedCollections == null) {
	console.error("wantedCollectionsが未指定です(詳細はReadmeを参照)");
	exit(1);
}
const config: configtype = {
	wsURL: process.env.wsURL ?? "wss://jetstream2.us-west.bsky.network/subscribe",
	wantedCollections,
	port: Number.parseInt(process.env.port ?? "8000"),
};

const server = new WebSocketServer({ port: config.port });
// コレクションを指定せずに接続しているコネクション
const allSubscriber = new Set<WebSocket>();
// コレクションを指定して接続しているコネクション
const specificSubscriver = new Map<string, Set<WebSocket>>(
	config.wantedCollections == null
		? undefined
		: // 空のSetで初期化
			Array.from(config.wantedCollections).map((collection) => [collection, new Set<WebSocket>()]),
);
const send = (data: BufferLike, collection?: string) => {
	const sent = new Set<WebSocket>();
	const sendInner = (connection: WebSocket, context: "notCommitEvent" | "allSubscriber" | "specificSubscriber") => {
		if (!sent.has(connection)) {
			connection.send(data);
			sent.add(connection);
		} else {
			// never happen
			console.error(`duplicate connection context:${context}`);
		}
	};
	if (collection == null) {
		// すべてのクライアントに送信(Commit以外のイベント)
		for (const connection of server.clients) {
			sendInner(connection, "notCommitEvent");
		}
	} else {
		// すべてを受け取るクライアントに送信
		for (const connection of allSubscriber) {
			sendInner(connection, "allSubscriber");
		}
		// 特定のコレクションを受け取るクライアントに送信
		for (const connection of specificSubscriver.get(collection) ?? []) {
			sendInner(connection, "specificSubscriber");
		}
	}
};
server.on("connection", (connection, req) => {
	console.log("client connect");
	const { searchParams } = new URL(req.url ?? "/", "wss://ws.url");
	let cleanup: () => void;
	if (searchParams.has("wantedCollections")) {
		// wantedCollectionsが指定されている場合
		const wantedCollections = new Set(searchParams.getAll("wantedCollections"));
		cleanup = () => {
			for (const collection of wantedCollections) {
				specificSubscriver.get(collection)?.delete(connection);
			}
		};
		for (const collection of wantedCollections) {
			const result = specificSubscriver.get(collection)?.add(connection);
			if (result == null) {
				cleanup();
				connection.close(
					4000,
					`wantedCollection "${collection}" is not included in server wantedCollections. Please check server config`,
				);
			}
		}
	} else {
		// wantedCollectionsが指定されていない場合
		cleanup = () => {
			allSubscriber.delete(connection);
		};
		allSubscriber.add(connection);
	}
	connection.on("close", (code, reason) => {
		console.log("client disconnect");
		cleanup();
	});
});

let cursor = -1;
function handler(ev: AccountEvent | IdentityEvent | CommitEvent<string>, col?: string) {
	cursor = ev.time_us;
	send(JSON.stringify(ev), col);
}

const jetstream = new Jetstream({
	ws: WebSocket,
	endpoint: config.wsURL,
	wantedCollections: Array.from(config.wantedCollections),
});
jetstream.on("account", (data) => void handler(data));
jetstream.on("identity", (data) => void handler(data));
jetstream.on("commit", (data) => void handler(data, data.commit.collection));
jetstream.on("open", () => void console.log("jetstream connect"));
jetstream.on("close", () => {
	console.log("jetstream connection closed. reconnecting...");
	jetstream.start();
});
jetstream.on("error", (e) => {
	console.error(e);
	jetstream.start();
});
jetstream.start();

let oldCursor = -2;
setInterval(
	() => {
		if (cursor === oldCursor) {
			console.log("jetstream may be closed. reconnecting...");
			jetstream.close();
			jetstream.start();
		}
		oldCursor = cursor;
	},
	10 * 60 * 1000, // 10 minutes
);
