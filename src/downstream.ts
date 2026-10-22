// 主にProxyに接続しているクライアントとの通信
import type { IncomingMessage } from "node:http";
import { TID } from "@atproto/common-web";
import { WebSocketServer } from "ws";
import type { ClientHub } from "./clients.js";
import { logger } from "./logger.js";
import type { ClientRequest, Protocol, Rejection } from "./types.js";

export function createDownstream(protocol: Protocol, port: number, hub: ClientHub) {
	/** 接続前に検証した結果を、接続後の処理に渡す */
	const requests = new WeakMap<IncomingMessage, ClientRequest>();

	const { subprotocol } = protocol;
	const server = new WebSocketServer({
		port,
		handleProtocols: subprotocol ? (offered) => (offered.has(subprotocol) ? subprotocol : false) : undefined,
		verifyClient: ({ req }, accept) => {
			const request = verifyRequest(protocol, hub, req);
			if (!request.ok && request.rejection.type === "http") {
				const { status, error, message } = request.rejection;
				logger.warn(`Client rejected: ${message}`);
				const body = JSON.stringify({ error, message });
				return accept(false, status, body, { "Content-Type": "application/json" });
			}
			requests.set(req, request);
			accept(true);
		},
	});
	server.on("error", (error) => {
		logger.error(`Downstream server error: ${String(error)}`);
	});
	server.on("listening", () => {
		logger.info(`Downstream server started on port ${port}.`);
	});
	server.on("connection", (ws, req) => {
		const request = requests.get(req);
		if (request === undefined) return ws.close(1011, "internal error");
		if (!request.ok) {
			const { code, reason } = request.rejection as Extract<Rejection, { type: "close" }>;
			logger.warn(`Client rejected: ${reason}`);
			return ws.close(code, reason);
		}

		const tid = TID.next().toString();
		const { subscription, compress } = request;
		logger.logConnect(tid, subscription);
		const remove = hub.add(subscription, (event) => ws.send(protocol.frameForClient(event, compress)));
		ws.on("close", () => {
			remove();
			logger.logDisconnect(tid);
		});
		if (protocol.closeOnClientMessage) {
			ws.on("message", () => ws.close(1008, "this endpoint does not accept messages"));
		}
	});
}

function verifyRequest(protocol: Protocol, hub: ClientHub, req: IncomingMessage): ClientRequest {
	const request = protocol.parseClientRequest(new URL(req.url ?? "/", "ws://localhost"));
	if (request.ok && !hub.canAdd(request.subscription)) {
		return { ok: false, rejection: protocol.tooManyCollections };
	}
	return request;
}
