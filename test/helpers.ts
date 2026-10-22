// E2Eテストで共通の処理
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compressUsingDict, createCCtx, freeCCtx, init } from "@bokuweb/zstd-wasm";
import { expect, vi } from "vitest";
import { WebSocket } from "ws";

/** v1に同梱されているzstd辞書。テストではv2の辞書としても使う */
export const DICTIONARY = readFileSync(join(import.meta.dirname, "../src/assets/zstd_dictionary/zstd_dictionary"));

/** 引数を指定してProxyを起動し、クライアントが接続できるようになるまで待つ */
export async function startProxy(args: string[], proxyURL: string) {
	await init();
	// Proxyは起動時にprocess.argvを読むので、import前に設定する
	process.argv.splice(2, Number.POSITIVE_INFINITY, ...args, "--log-file", join(import.meta.dirname, "log.txt"));
	await import("../src/main.js");
	await vi.waitFor(async () => expect(await canConnect(proxyURL)).toBe(true));
}

type Client = Awaited<ReturnType<typeof connectClient>>;
/** テスト間で接続が残らないよう、afterEachで全て切断する */
const openClients = new Set<Client>();

/** Proxyに接続し、受信したフレームと切断理由を記録するクライアントを返す */
export async function connectClient(url: string) {
	const ws = new WebSocket(url);
	const received: unknown[] = [];
	ws.on("message", (data) => received.push(JSON.parse(data.toString("utf-8"))));
	const closed = new Promise<{ code: number; reason: string }>((resolve) =>
		ws.on("close", (code, reason) => resolve({ code, reason: reason.toString("utf-8") })),
	);
	await new Promise((resolve) => ws.on("open", resolve));

	const client = {
		received,
		closed,
		send: (data: string) => ws.send(data),
		close: async () => {
			ws.close();
			await closed;
		},
		terminate: () => ws.terminate(),
		isOpen: () => ws.readyState === WebSocket.OPEN,
	};
	openClients.add(client);
	closed.then(() => openClients.delete(client));
	return client;
}

export async function closeAllClients() {
	await Promise.all(Array.from(openClients, (client) => client.close()));
}

/** 接続を拒否されたときのHTTPレスポンス */
export async function rejectedResponse(url: string) {
	const ws = new WebSocket(url);
	return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
		ws.on("open", () => reject(new Error("接続が拒否されなかった")));
		ws.on("unexpected-response", (_req, res) => {
			let body = "";
			res.on("data", (chunk) => {
				body += chunk;
			});
			res.on("end", () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(body) }));
		});
	});
}

async function canConnect(url: string) {
	const ws = new WebSocket(url);
	const ok = await new Promise<boolean>((resolve) => {
		ws.on("open", () => resolve(true));
		ws.on("error", () => resolve(false));
	});
	if (ok) {
		ws.close();
		await new Promise((resolve) => ws.on("close", resolve));
	}
	return ok;
}

/**
 * Jetstreamと同じくカスタム辞書でzstd圧縮する。
 * mock-socket は Buffer を文字列化してしまうので ArrayBuffer で返す。
 */
export function compress(frame: object): ArrayBuffer {
	const cctx = createCCtx();
	const compressed = compressUsingDict(cctx, Buffer.from(JSON.stringify(frame)), DICTIONARY);
	freeCCtx(cctx);
	return new Uint8Array(compressed).buffer;
}
