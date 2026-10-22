// 主にProxyに接続しているクライアントとの通信
import type { EventEmitter } from "node:events";
import { TID } from "@atproto/common-web";
import { type RawData, type WebSocket, WebSocketServer } from "ws";
import { logger } from "./logger.js";
import type { Config, DownstreamEventMap } from "./types.js";
import { createFilter } from "./util.js";

export function createDownstream(config: Config, emitter: EventEmitter<DownstreamEventMap>) {
	const server = new WebSocketServer({ port: config.proxyPort });
	server.on("error", (error) => {
		logger.error(`Downstream server error: ${String(error)}`);
	});
	server.on("listening", () => {
		logger.info(`Downstream server started on port ${config.proxyPort}.`);
	});
	server.on("connection", (ws, req) => {
		const tid = TID.next();
		if (req.url == null) {
			ws.close(4000, "cannot read req.url");
			return;
		}
		const sp = new URL(req.url, "ws://example.com").searchParams;
		const allMode = !sp.has("wantedCollections");
		const wantedCollections = new Set(sp.getAll("wantedCollections"));
		const onlyCommit = sp.has("onlyCommit");
		const compress = sp.has("compress");
		const filter = createFilter(wantedCollections);
		logger.logConnect(tid.toString(), allMode, wantedCollections);
		if (filter === false) {
			logger.warn(`Client ${tid} rejected: invalid collection.`);
			ws.close(4000, "bad collection");
			return;
		}
		const send = createSend(ws, compress);
		const onMessage = (...[ev, col, raw]: DownstreamEventMap["message"]) => {
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
		};
		// このクライアント用に登録したリスナーを全て外す
		const removeListeners = () => {
			emitter.off("message", onMessage);
			emitter.off("rejectConnect", onReject);
			emitter.off("acceptConnect", onAccept);
			ws.removeAllListeners();
		};
		const onReject = (rejectid: TID, reason: string) => {
			if (rejectid !== tid) return;
			removeListeners();
			ws.close(4000, reason);
			emitter.emit("disconnect", tid);
			logger.warn(`Client ${tid} rejected: ${reason}`);
		};
		const onAccept = (acceptid: TID) => {
			if (acceptid !== tid) return;
			emitter.off("rejectConnect", onReject);
			emitter.off("acceptConnect", onAccept);
		};
		// connectの処理中に拒否されてもリスナーが残らないよう、emitより前に全て登録する
		emitter.on("rejectConnect", onReject);
		emitter.on("acceptConnect", onAccept);
		emitter.on("message", onMessage);
		ws.on("close", () => {
			removeListeners();
			emitter.emit("disconnect", tid);
			logger.logDisconnect(tid.toString());
		});
		emitter.emit("connect", tid, allMode ? "all" : wantedCollections);
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
