import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import WS from "vitest-websocket-mock";
import {
	closeAllClients,
	compress,
	connectClient as connect,
	DICTIONARY,
	rejectedResponse,
	startProxy,
} from "./helpers.js";

vi.mock("ws", async (importOriginal) => (await import("./mock-ws.js")).mockUpstreamWebSocket(importOriginal));

// e2e.test.ts と並行して動くのでポートを分ける
const SUBSCRIBE_PATH = "/xrpc/network.bsky.jetstream.subscribeEvents";
const UPSTREAM_URL = `ws://localhost:8003${SUBSCRIBE_PATH}`;
const PROXY_URL = `ws://localhost:8002${SUBSCRIBE_PATH}`;

let upstream: WS;
/** Proxyが最後にupstreamへ接続したURL */
let lastUpstreamURL: URL;

beforeAll(async () => {
	// zstd辞書はupstreamからHTTPで取得する
	vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(DICTIONARY));
	upstream = new WS(UPSTREAM_URL);
	upstream.on("connection", (socket) => {
		lastUpstreamURL = new URL(socket.url);
	});
	await startProxy(["--jetstream-version", "v2", "--upstream", UPSTREAM_URL, "--port", "8002"], PROXY_URL);
});

// Proxyは1つを全テストで共有するので、テストごとに全クライアントを切断して初期状態に戻す
afterEach(async () => {
	await closeAllClients();
	await vi.waitFor(() => expect(upstreamCollections()).toEqual(["example.dummy.collection"]));
});

describe("イベントの配信", () => {
	// v2のcollectionsはcommitだけを絞り込む
	test.each<[string, ("identity" | "post" | "like")[]]>([
		["", ["identity", "post", "like"]],
		["?collections=app.bsky.feed.post", ["identity", "post"]],
		["?kinds=commit&collections=app.bsky.feed.post", ["post"]],
	])("'%s' で接続するとフィルタ済みのフレームをそのまま受け取る", async (query, expected) => {
		const client = await connectClient(query);
		// seqが重複すると捨てられるので、テストごとに作る
		const frames = {
			identity: identityFrame(),
			post: commitFrame("app.bsky.feed.post"),
			like: commitFrame("app.bsky.feed.like"),
		};

		for (const frame of Object.values(frames)) upstream.send(compress(frame));

		await expect.poll(() => client.received).toEqual(expected.map((name) => frames[name]));
	});
});

describe("接続の拒否", () => {
	test.each([
		// 対応していないパラメータ
		"?dids=did:web:example.com",
		// v1のパラメータ
		"?wantedCollections=app.bsky.feed.post",
		// v2ではワイルドカードの前がNSIDの先頭として有効でなければならない
		"?collections=app.*",
	])("'%s' は接続前にHTTP 400で拒否される", async (query) => {
		const res = await rejectedResponse(`${PROXY_URL}${query}`);

		expect(res).toEqual({ status: 400, body: expect.objectContaining({ error: "InvalidRequest" }) });
	});

	test("クライアントがメッセージを送ると切断される", async () => {
		const client = await connectClient("");

		client.send("hello");

		expect((await client.closed).code).toBe(1008);
	});
});

describe("購読内容の変更", () => {
	test("クライアントが増えると、カーソルを付けてupstreamに再接続し、重複したイベントは捨てる", async () => {
		const postClient = await connectClient("?kinds=commit&collections=app.bsky.feed.post");
		await expect.poll(upstreamCollections).toEqual(["app.bsky.feed.post"]);
		const post1 = commitFrame("app.bsky.feed.post");
		upstream.send(compress(post1));
		await expect.poll(() => postClient.received).toEqual([post1]);

		await connectClient("?kinds=commit&collections=app.bsky.feed.like");
		await expect.poll(upstreamCollections).toEqual(["app.bsky.feed.post", "app.bsky.feed.like"]);
		expect(lastUpstreamURL.searchParams.has("cursor")).toBe(true);

		// カーソルの位置は含まれるので、受け取り済みのイベントがもう一度届く
		const post2 = commitFrame("app.bsky.feed.post");
		upstream.send(compress(post1));
		upstream.send(compress(post2));
		await expect.poll(() => postClient.received).toEqual([post1, post2]);
	});
});

// ===== helpers =====

function upstreamCollections() {
	return lastUpstreamURL.searchParams.getAll("collections");
}

function connectClient(query: string) {
	return connect(`${PROXY_URL}${query}`);
}

// ===== Jetstream v2のフレーム =====

let seq = 1;
function messageFrame(kind: string, fields: object) {
	const time = new Date().toISOString();
	return {
		$type: "message",
		payload: {
			$type: `network.bsky.jetstream.subscribeEvents#${kind}`,
			seq: seq++,
			did: "did:web:example.com",
			time,
			witnessedAt: time,
			...fields,
		},
	};
}
function identityFrame() {
	return messageFrame("identity", { identity: { did: "did:web:example.com", seq: 123, time: "123" } });
}
function commitFrame(collection: string) {
	return messageFrame("commit", {
		rev: "bb",
		operation: "create",
		collection,
		rkey: "cc",
		cid: "aa",
		record: { $type: collection },
	});
}
