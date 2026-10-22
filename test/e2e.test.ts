import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compressUsingDict, createCCtx, freeCCtx, init } from "@bokuweb/zstd-wasm";
import type { AccountEvent, CommitEvent, IdentityEvent } from "@skyware/jetstream";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import WS from "vitest-websocket-mock";
import { WebSocket } from "ws";
import type { JetstreamEvent, OptionUpdateMsg } from "../src/types.js";

// Proxy → Jetstream(upstream) の通信だけをモックに差し替える。
// upstream.ts は `ws` の default export を使い、downstream.ts は named export の WebSocketServer を使うので、
// default export だけ差し替えれば Proxy → クライアント(downstream) は本物の ws のまま動く。
vi.mock("ws", async (importOriginal) => {
	const { WebSocket: MockWebSocket } = await import("mock-socket");
	// mock-socket の MessageEvent は ports が null で、partysocket が Node の MessageEvent に複製する際に落ちるので補う
	class MockUpstreamWebSocket extends MockWebSocket {
		dispatchEvent(event: Event & { ports?: unknown }, ...args: unknown[]) {
			if (event.ports === null) event.ports = [];
			return super.dispatchEvent(event, ...args);
		}
	}
	return { ...(await importOriginal<typeof import("ws")>()), default: MockUpstreamWebSocket };
});

const UPSTREAM_URL = "ws://localhost:8001";
const PROXY_URL = "ws://localhost:8000";

let upstream: WS;
let dict: Buffer;

beforeAll(async () => {
	await init();
	dict = readFileSync(join(import.meta.dirname, "../src/assets/zstd_dictionary/zstd_dictionary"));

	// Proxyは起動時にprocess.argvを読むので、import前に設定する
	upstream = new WS(UPSTREAM_URL);
	process.argv[2] = UPSTREAM_URL;
	process.argv[3] = "8000";
	process.argv[4] = join(import.meta.dirname, "log.txt");
	await import("../src/main.js");
	await upstream.connected;
	// downstream サーバーの起動を待つ
	await vi.waitFor(async () => expect(await canConnectToProxy()).toBe(true));
});

// Proxyは1つを全テストで共有するので、テストごとに全クライアントを切断して初期状態に戻す
afterEach(async () => {
	await closeAllClients();
	await vi.waitFor(() => expect(lastWantedCollections()).toEqual(["example.dummy.collection"]));
});

describe("イベントの配信", () => {
	const events: JetstreamEvent[] = [
		accountEvent(),
		identityEvent(),
		commitEvent("app.bsky.feed.post"),
		commitEvent("app.bsky.feed.like"),
		commitEvent("com.example.proxy.test"),
	];
	const [account, identity, post, like, proxyTest] = events;

	test.each<[string, JetstreamEvent[]]>([
		["/", [account, identity, post, like, proxyTest]],
		["/?wantedCollections=app.bsky.feed.post", [account, identity, post]],
		["/?wantedCollections=app.bsky.feed.*", [account, identity, post, like]],
		[
			"/?wantedCollections=app.bsky.feed.post&wantedCollections=com.example.proxy.test",
			[account, identity, post, proxyTest],
		],
		["/?onlyCommit=true", [post, like, proxyTest]],
		["/?wantedCollections=app.bsky.feed.post&onlyCommit=true", [post]],
	])("%s で接続するとフィルタ済みのイベントを受け取る", async (path, expected) => {
		const client = await connectClient(path);

		for (const event of events) upstream.send(compress(event));

		await expect.poll(() => client.received).toEqual(expected);
	});
});

describe("接続の拒否", () => {
	test("不正なwantedCollectionsを指定すると切断される", async () => {
		const client = await connectClient("/?wantedCollections=invalid*nsid");

		expect(await client.closed).toEqual({ code: 4000, reason: "bad collection" });
	});

	test("wantedCollectionsを100個より多く指定すると切断される", async () => {
		const collections = Array.from({ length: 101 }, (_, i) => `com.example.collection${i}`);
		const client = await connectClient(`/?${collections.map((c) => `wantedCollections=${c}`).join("&")}`);

		expect(await client.closed).toEqual({
			code: 4000,
			reason: "The maximum number of collections (100) has been exceeded",
		});
	});
});

describe("upstreamへのoptions_update", () => {
	test("接続中のクライアントに合わせてwantedCollectionsが更新される", async () => {
		// 前のテストのメッセージで判定しないよう消しておく
		upstream.messages.length = 0;

		const postClient = await connectClient("/?wantedCollections=app.bsky.feed.post");
		await expect.poll(lastWantedCollections).toEqual(["app.bsky.feed.post"]);

		// 全取得のクライアントがいる間はwantedCollectionsを指定しない
		const allClient = await connectClient("/");
		await expect.poll(lastWantedCollections).toBeUndefined();

		await allClient.close();
		await expect.poll(lastWantedCollections).toEqual(["app.bsky.feed.post"]);

		// クライアントがいなくなったらダミーのコレクションだけを購読する
		await postClient.close();
		await expect.poll(lastWantedCollections).toEqual(["example.dummy.collection"]);
	});
});

// ===== helpers =====

/** upstreamが最後に受け取ったoptions_updateのwantedCollections */
function lastWantedCollections() {
	const last = upstream.messages.at(-1);
	if (last === undefined) throw new Error("upstreamがまだメッセージを受け取っていない");
	const msg = JSON.parse(String(last)) as OptionUpdateMsg;
	return msg.payload.wantedCollections;
}

type Client = Awaited<ReturnType<typeof connectClient>>;
/** テスト間で接続が残らないよう、afterEachで全て切断する */
const openClients = new Set<Client>();

/** Proxyに接続し、受信したイベントと切断理由を記録するクライアントを返す */
async function connectClient(path: string) {
	const ws = new WebSocket(`${PROXY_URL}${path}`);
	const received: unknown[] = [];
	ws.on("message", (data) => received.push(JSON.parse(data.toString("utf-8"))));
	const closed = new Promise<{ code: number; reason: string }>((resolve) =>
		ws.on("close", (code, reason) => resolve({ code, reason: reason.toString("utf-8") })),
	);
	await new Promise((resolve) => ws.on("open", resolve));

	const client = {
		received,
		closed,
		close: async () => {
			ws.close();
			await closed;
		},
	};
	openClients.add(client);
	closed.then(() => openClients.delete(client));
	return client;
}

async function closeAllClients() {
	await Promise.all(Array.from(openClients, (client) => client.close()));
}

async function canConnectToProxy() {
	const ws = new WebSocket(PROXY_URL);
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

// ===== Jetstreamのイベント =====

let timeUs = 1234;
function accountEvent(): AccountEvent {
	return {
		kind: "account",
		did: "did:web:example.com",
		time_us: timeUs++,
		account: { active: true, did: "did:web:example.com", seq: 123, time: "123" },
	};
}
function identityEvent(): IdentityEvent {
	return {
		kind: "identity",
		did: "did:web:example.com",
		time_us: timeUs++,
		identity: { did: "did:web:example.com", seq: 123, time: "123" },
	};
}
function commitEvent(collection: string): CommitEvent<string> {
	return {
		kind: "commit",
		did: "did:web:example.com",
		time_us: timeUs++,
		commit: {
			cid: "aa",
			collection,
			operation: "create",
			record: { $type: collection } as never,
			rev: "bb",
			rkey: "cc",
		},
	};
}

/**
 * Jetstreamと同じくカスタム辞書でzstd圧縮する。
 * mock-socket は Buffer を文字列化してしまうので ArrayBuffer で返す。
 */
function compress(event: JetstreamEvent): ArrayBuffer {
	const cctx = createCCtx();
	const compressed = compressUsingDict(cctx, Buffer.from(JSON.stringify(event)), dict);
	freeCCtx(cctx);
	return new Uint8Array(compressed).buffer;
}
