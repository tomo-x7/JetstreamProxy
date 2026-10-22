import type { AccountEvent, CommitEvent, IdentityEvent } from "@skyware/jetstream";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import WS from "vitest-websocket-mock";
import type { OptionUpdateMsg } from "../src/protocol/v1.js";
import { closeAllClients, compress, connectClient as connect, startProxy } from "./helpers.js";

vi.mock("ws", async (importOriginal) => (await import("./mock-ws.js")).mockUpstreamWebSocket(importOriginal));

type JetstreamEvent = AccountEvent | IdentityEvent | CommitEvent<string>;

const UPSTREAM_URL = "ws://localhost:8001";
const PROXY_URL = "ws://localhost:8000";

let upstream: WS;

beforeAll(async () => {
	upstream = new WS(UPSTREAM_URL);
	await startProxy(["--upstream", UPSTREAM_URL, "--port", "8000"], PROXY_URL);
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

	// フィルタの細かい条件は util.test.ts の createFilter で確認する
	test.each<[string, JetstreamEvent[]]>([
		["/", [account, identity, post, like, proxyTest]],
		["/?wantedCollections=app.bsky.feed.post", [account, identity, post]],
		["/?onlyCommit=true", [post, like, proxyTest]],
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

describe("ネットワークエラー", () => {
	// partysocketの再接続は最大5秒ほど待つので長めにする
	test(
		"upstreamとの接続が切れると、接続中のクライアントに必要なwantedCollectionsで再接続する",
		{ timeout: 15_000 },
		async () => {
			const client = await connectClient("/?wantedCollections=app.bsky.feed.post");
			await expect.poll(lastWantedCollections).toEqual(["app.bsky.feed.post"]);

			upstream.error();
			upstream = new WS(UPSTREAM_URL);
			const reconnected = await upstream.connected;

			expect(new URL(reconnected.url).searchParams.getAll("wantedCollections")).toEqual(["app.bsky.feed.post"]);
			// クライアントは切断されず、再接続後のイベントも受け取れる
			const post = commitEvent("app.bsky.feed.post");
			upstream.send(compress(post));
			await expect.poll(() => client.received).toEqual([post]);
		},
	);

	test("クライアントとの接続が異常切断されると、そのクライアントの分は購読から外れる", async () => {
		const postClient = await connectClient("/?wantedCollections=app.bsky.feed.post");
		const likeClient = await connectClient("/?wantedCollections=app.bsky.feed.like");
		await expect.poll(lastWantedCollections).toEqual(["app.bsky.feed.post", "app.bsky.feed.like"]);

		// close handshakeをせずにTCP接続を切る
		likeClient.terminate();

		await expect.poll(lastWantedCollections).toEqual(["app.bsky.feed.post"]);
		expect(postClient.isOpen()).toBe(true);
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

function connectClient(path: string) {
	return connect(`${PROXY_URL}${path}`);
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
