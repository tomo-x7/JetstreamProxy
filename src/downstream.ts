import { type UUID, randomUUID } from "node:crypto";
// 主にProxyに接続しているクライアントとの通信
import type { EventEmitter } from "node:events";
import { WebSocketServer, WebSocket, RawData } from "ws";
import type { Config } from "./types.js";
import type { DownstreamEventMap } from "./types.js";
import { createFilter } from "./util.js";

export function createDownstream(config: Config, emitter: EventEmitter<DownstreamEventMap>) {
	const server = new WebSocketServer({ port: config.proxyPort });
	server.on("error", (error) => {
		console.error(error);
	});
	server.on("listening", () => {
		console.log("downstream server start at %d...", config.proxyPort);
	});
	server.on("connection", (ws, req) => {
		const uuid = randomUUID();
		if (req.url == null) {
			ws.close(4000, "cannot read req.url");
			return;
		}
		const sp = new URL(req.url).searchParams;
		const allMode = sp.has("wantedCollections");
		const wantedCollections = new Set(sp.getAll("wantedCollections"));
		const onlyCommit = sp.has("onlyCommit");
		const compress = sp.has("compress");
		const filter = createFilter(wantedCollections);
		if (filter === false) {
			ws.close(4000, "bad collection");
			return;
		}
		const onReject = (rejectuuid: UUID, reason: string) => {
			if (rejectuuid === uuid) {
				ws.removeAllListeners();
				ws.close(4000, reason);
				emitter.emit("disconnect", uuid);
				emitter.off("rejectConnect", onReject);
				emitter.off("acceptConnect", onAccept);
			}
		};
		const onAccept = () => {
			emitter.off("rejectConnect", onReject);
			emitter.off("acceptConnect", onAccept);
		};
		emitter.on("rejectConnect", onReject);
		emitter.on("acceptConnect", onAccept);
		emitter.emit("connect", uuid, allMode ? "all" : wantedCollections);
		ws.on("close", () => {
			emitter.emit("disconnect", uuid);
			emitter.on("rejectConnect", onReject);
			emitter.on("acceptConnect", onAccept);
			ws.removeAllListeners();
		});
		const send = createSend(ws, compress);
		emitter.on("message", (ev, col, raw) => {
			switch (ev.kind) {
				case "account":
					if (!onlyCommit) send(ev, raw);
					return;
				case "identity":
					if (!onlyCommit) send(ev, raw);
					return;
				case "commit":
					if (col == null) return;
					if (allMode) return void send(ev, raw);
					if (filter(col)) return void send(ev, raw);
			}
		});
	});
}

function createSend(ws: WebSocket, compress = false): (ev: object, raw: RawData) => void {
	if (compress) {
		return (ev, raw) => {
			ws.send(raw);
		};
	}
	return (ev, raw) => {
		ws.send(JSON.stringify(ev));
	};
}
