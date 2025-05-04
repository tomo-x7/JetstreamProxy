import WebSocket from "ws";
import { WebSocketServer } from "ws";
import type { BufferLike, configtype } from "./types.js";
import { type AccountEvent, type CommitEvent, type IdentityEvent, Jetstream } from "@skyware/jetstream";
import crypto from 'crypto';
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
	const sent = new Set<WebSocket>();
	if (collection == null) {
		for (const connection of server.clients) {
			if (!sent.has(connection)) {
				connection.send(data);
				sent.add(connection);
			}
		}
	} else {
		for (const connection of connections.get(collection)?.values() ?? []) {
			if (!sent.has(connection)) {
				connection.send(data);
				sent.add(connection);
			}
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
		console.log("client disconnect");
		cleanup();
	});
});

let cursor = -1;
function handler(ev: AccountEvent | IdentityEvent | CommitEvent<string>, col?: string) {
	cursor = ev.time_us;
	send(JSON.stringify(ev), col);
}

const jetstream = new Jetstream({ ws: WebSocket, endpoint: config.wsURL, wantedCollections: config.wantedCollections });
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
