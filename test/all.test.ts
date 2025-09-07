import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compressUsingDict, createCCtx, freeCCtx, init } from "@bokuweb/zstd-wasm";
import type { AccountEvent, CommitEvent, IdentityEvent } from "@skyware/jetstream";
import { afterAll, describe, expect, test } from "vitest";
import { WebSocket, WebSocketServer } from "ws";

let cursor = 1234;
const accountEvent = (): AccountEvent => ({
	kind: "account",
	did: "did:web:example.com",
	time_us: cursor++,
	account: { active: true, did: "did:web:example.com", seq: 123, time: "123" },
});
const identityEvent = (): IdentityEvent => ({
	kind: "identity",
	did: "did:web:example.com",
	time_us: cursor++,
	identity: { did: "did:web:example.com", seq: 123, time: "123" },
});
const commitEvent = <T extends string>(collection: T): CommitEvent<T> => ({
	kind: "commit",
	did: "did:web:example.com",
	time_us: cursor++,
	commit: { cid: "aa", collection, operation: "create", record: { $type: collection } as any, rev: "bb", rkey: "cc" },
});
await init();
const dict = readFileSync(join(import.meta.dirname, "../src/assets/zstd_dictionary/zstd_dictionary"));
const compress = (data: object) => {
	const cctx = createCCtx();
	const buff = Buffer.from(JSON.stringify(data));
	const compressed = Buffer.from(compressUsingDict(cctx, buff, dict));
	freeCCtx(cctx);
	return compressed;
};
const wait = () => new Promise((resolve) => setTimeout(resolve, 500));

describe("E2E", async () => {
	const upstreamServer = new WebSocketServer({ port: 8001 });
	await new Promise<void>((resolve) => upstreamServer.on("listening", () => resolve()));
	process.argv[2] = "ws://127.0.0.1:8001";
	process.argv[3] = "8000";
	process.argv[4] = join(import.meta.dirname, "log.txt");
	await import("../src/main.js");

	const upstreamSocket = await new Promise<WebSocket>((resolve) =>
		upstreamServer.on("connection", (ws) => {
			resolve(ws);
		}),
	);

	describe("simple case", async () => {
		const ws1 = new WebSocket("ws://127.0.0.1:8000/");
		const ws2 = new WebSocket("ws://127.0.0.1:8000/?wantedCollections=app.bsky.feed.post");
		const ws3 = new WebSocket("ws://127.0.0.1:8000/?wantedCollections=app.bsky.feed.*");
		const ws4 = new WebSocket("ws://127.0.0.1:8000/?onlyCommit=true");
		const ws5 = new WebSocket("ws://127.0.0.1:8000/?wantedCollections=app.bsky.feed.post&onlyCommit=true");
		const ws6 = new WebSocket(
			"ws://127.0.0.1:8000/?wantedCollections=app.bsky.feed.post&wantedCollections=com.example.proxy.test",
		);
		const data: (AccountEvent | IdentityEvent | CommitEvent<string>)[] = [
			accountEvent(),
			identityEvent(),
			commitEvent("app.bsky.feed.post"),
			commitEvent("app.bsky.feed.like"),
			commitEvent("com.example.proxy.test"),
		];
		const compressed = data.map(compress);
		const expected1 = data.filter((v) => true).map((v) => JSON.stringify(v));
		const expected2 = data
			.filter((v) => v.kind !== "commit" || v.commit.collection === "app.bsky.feed.post")
			.map((v) => JSON.stringify(v));
		const expected3 = data
			.filter((v) => v.kind !== "commit" || v.commit.collection.startsWith("app.bsky.feed"))
			.map((v) => JSON.stringify(v));
		const expected4 = data.filter((v) => v.kind === "commit").map((v) => JSON.stringify(v));
		const expected5 = data
			.filter((v) => v.kind === "commit" && v.commit.collection === "app.bsky.feed.post")
			.map((v) => JSON.stringify(v));
		const expected6 = data
			.filter(
				(v) =>
					v.kind !== "commit" ||
					v.commit.collection === "app.bsky.feed.post" ||
					v.commit.collection === "com.example.proxy.test",
			)
			.map((v) => JSON.stringify(v));
		const received1: unknown[] = [];
		const received2: unknown[] = [];
		const received3: unknown[] = [];
		const received4: unknown[] = [];
		const received5: unknown[] = [];
		const received6: unknown[] = [];
		ws1.on("message", (data) => received1.push(data.toString("utf-8")));
		ws2.on("message", (data) => received2.push(data.toString("utf-8")));
		ws3.on("message", (data) => received3.push(data.toString("utf-8")));
		ws4.on("message", (data) => received4.push(data.toString("utf-8")));
		ws5.on("message", (data) => received5.push(data.toString("utf-8")));
		ws6.on("message", (data) => received6.push(data.toString("utf-8")));
		await wait();
		for (const data of compressed) {
			upstreamSocket.send(data);
		}
		await wait();
		test("allmode", () => expect(received1).toEqual(expected1));
		test("simple wanted", () => expect(received2).toEqual(expected2));
		test("prefixed wanted", () => expect(received3).toEqual(expected3));
		test("all with onlycommit", () => expect(received4).toEqual(expected4));
		test("simple wanted with onlycommit", () => expect(received5).toEqual(expected5));
		test("multiple wanted", () => expect(received6).toEqual(expected6));
		ws1.close();
		ws2.close();
		ws3.close();
		ws4.close();
		ws5.close();
		ws6.close();
	});

	afterAll(() => {
		upstreamServer.close();
	});
});
