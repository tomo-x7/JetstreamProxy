// 主にProxyに接続しているクライアントとの通信
import type { EventEmitter } from "node:events";
import { type WebSocket, WebSocketServer } from "ws";
import type { Config } from "./types.js";
import type { DownstreamEventMap } from "./types.js";
import { randomUUID, UUID } from "node:crypto";
import { emit } from "node:process";

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
		const onReject = (rejectuuid: UUID, reason: string) => {
			if (rejectuuid === uuid) {
				ws.removeAllListeners();
				ws.close(4000, reason);
			}
			emitter.off("rejectConnect", onReject);
			emitter.off("acceptConnect", onAccept);
		};
		const onAccept = () => {
			emitter.off("rejectConnect", onReject);
			emitter.off("acceptConnect", onAccept);
		};
		emitter.on("rejectConnect", onReject);
		emitter.on("acceptConnect", onAccept);
		emitter.emit("connect", uuid, new Set<string>(sp.getAll("wantedCollections")));
		ws.on("close", () => {
			emitter.emit("disconnect", uuid);
			emitter.on("rejectConnect", onReject);
			emitter.on("acceptConnect", onAccept);
			ws.removeAllListeners();
		});
	});
}
