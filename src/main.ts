import WebSocket from "ws";
import { WebSocketServer } from "ws";
import type { BufferLike, configtype } from "./types";
import { Jetstream } from "@skyware/jetstream";

const config: configtype = {
	wsURL: "wss://jetstream2.us-west.bsky.network/subscribe",
	wantedCollections: ["app.bsky.feed.post", "app.bsky.feed.like", "app.bsky.feed.repost", "app.bsky.graph.follow"],
	port: 8000,
};

const server = new WebSocketServer({ port: config.port });
const connections: Map<string, Map<string, WebSocket>> = new Map();
for (const collection of config.wantedCollections) {
	connections.set(collection, new Map());
}
const send = (data: BufferLike, collection?: string) => {
	if (collection == null) {
		for (const connection of server.clients) {
			connection.send(data);
		}
	} else {
		for (const connection of connections.get(collection)?.values() ?? []) {
			connection.send(data);
		}
	}
};
server.on("connection", (connection, req) => {
	console.log("connect");
	const { searchParams } = new URL(req.url ?? "/", "wss://ws.url");
	const wantedCollections = searchParams.has("wantedCollections")?searchParams.getAll("wantedCollections"):config.wantedCollections;
	const id = crypto.randomUUID();
	const cleanup = () => {
		for (const collection of wantedCollections) {
			connections.get(collection)?.delete(id);
		}
	};
	for (const collection of wantedCollections) {
		const result = connections.get(collection)?.set(id, connection);
		if (result === undefined) {
			cleanup();
			connection.close(
				4000,
				`wantedCollection "${collection}" is not included in server wantedCollections. Please check server config`,
			);
		}
	}
	connection.on("close", (code, reason) => {
		cleanup();
	});
});

const jetstream = new Jetstream({ ws: WebSocket, endpoint: config.wsURL, wantedCollections: config.wantedCollections });
jetstream.on("account", (data) => void send(JSON.stringify(data)));
jetstream.on("identity", (data) => void send(JSON.stringify(data)));
jetstream.on("commit", (data) => void send(JSON.stringify(data), data.commit.collection));
jetstream.on("open", () => void console.log("connect"));
jetstream.on("close", () => {
	console.log("connection closed. reconnecting...");
	jetstream.start();
});
jetstream.on("error", (e) => {
	console.error(e);
	jetstream.start();
});
jetstream.start();
