import WebSocket from "ws";
import { WebSocketServer } from "ws";
import type { BufferLike, configtype } from "./types.js";
import { Jetstream } from "@skyware/jetstream";
import dotenv from "dotenv";
dotenv.config();

const config: configtype = {
	wsURL: process.env.wsURL ?? "wss://jetstream2.us-west.bsky.network/subscribe",
	wantedCollections: JSON.parse(process.env.wantedCollections ?? "[]"),
	port: Number.parseInt(process.env.port ?? "8000"),
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
	console.log("client connect");
	const { searchParams } = new URL(req.url ?? "/", "wss://ws.url");
	const wantedCollections = searchParams.has("wantedCollections")
		? searchParams.getAll("wantedCollections")
		: config.wantedCollections;
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
        console.log("client disconnect")
		cleanup();
	});
});

const jetstream = new Jetstream({ ws: WebSocket, endpoint: config.wsURL, wantedCollections: config.wantedCollections });
jetstream.on("account", (data) => void send(JSON.stringify(data)));
jetstream.on("identity", (data) => void send(JSON.stringify(data)));
jetstream.on("commit", (data) => void send(JSON.stringify(data), data.commit.collection));
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
