import { type AccountEvent, type CommitEvent, type IdentityEvent, Jetstream } from "@skyware/jetstream";
import dotenv from "dotenv";
import WebSocket, { WebSocketServer } from "ws";
import type { BufferLike, configtype } from "./types.js";
dotenv.config();

const config: configtype = {
	wsURL: process.env.wsURL ?? "wss://jetstream2.us-west.bsky.network/subscribe",
	wantedCollections: new Set(JSON.parse(process.env.wantedCollections ?? "[]")),
	port: Number.parseInt(process.env.port ?? "8000"),
};

const server = new WebSocketServer({ port: config.port });
const connections: Map<string, Set<WebSocket>> = new Map();
for (const collection of config.wantedCollections) {
	connections.set(collection, new Set());
}
const send = (data: BufferLike, collection?: string) => {
	const sent = new Set<WebSocket>();
	if (collection == null) {
		for (const connection of server.clients) {
			if (!sent.has(connection)) {
				connection.send(data);
				sent.add(connection);
			} else {
				// never happen
				console.error("duplicate connection(all collections)");
			}
		}
	} else {
		for (const connection of connections.get(collection)?.values() ?? []) {
			if (!sent.has(connection)) {
				connection.send(data);
				sent.add(connection);
			} else {
				// never happen
				console.error("duplicate connection(collection specific)");
			}
		}
	}
};
server.on("connection", (connection, req) => {
	console.log("client connect");
	const { searchParams } = new URL(req.url ?? "/", "wss://ws.url");
	const wantedCollections = searchParams.has("wantedCollections")
		? new Set(searchParams.getAll("wantedCollections"))
		: config.wantedCollections;
	const cleanup = () => {
		for (const collection of wantedCollections) {
			connections.get(collection)?.delete(connection);
		}
	};
	for (const collection of wantedCollections) {
		const result = connections.get(collection)?.add(connection);
		if (result == null) {
			cleanup();
			connection.close(
				4000,
				`wantedCollection "${collection}" is not included in server wantedCollections. Please check server config`,
			);
		}
	}
	connection.on("close", (code, reason) => {
		console.log("client disconnect");
		cleanup();
	});
	console.dir(connections, { depth: 1 });
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
