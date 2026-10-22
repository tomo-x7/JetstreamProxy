import { describe, expect, test } from "vitest";
import { createFilter, parseNSID, parsePort, parseUpstreamURL } from "../src/util.js";

// https://atproto.com/specs/nsid
// https://github.com/bluesky-social/jetstream?tab=readme-ov-file#consuming-jetstream
describe("parseNSID", () => {
	test.each<[string, ReturnType<typeof parseNSID>]>([
		["app.bsky.feed.post", { nsid: "app.bsky.feed.post", hasPrefix: false }],
		// ワイルドカードは末尾のセグメントのみ
		["app.bsky.feed.*", { nsid: "app.bsky.feed", hasPrefix: true }],
		["*", false],
		["app.bsky.*.post", false],
		["app.bsky.feed.post*", false],
		// 3セグメント未満
		["app.bsky", false],
		// 先頭セグメントは数字で始められない
		["1app.bsky.feed", false],
		// 名前セグメントは英数字のみ
		["app.bsky.feed-post", false],
		// 各セグメントは63文字まで
		[`${"a".repeat(64)}.bsky.feed`, false],
		// 全体は317文字まで
		[`${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}.${"e".repeat(64)}`, false],
	])("parseNSID(%s) -> %j", (input, expected) => {
		expect(parseNSID(input)).toEqual(expected);
	});
});

describe("parseUpstreamURL", () => {
	test.each<[unknown, URL | false]>([
		["wss://example.com/subscribe?foo=bar", new URL("wss://example.com/subscribe?foo=bar")],
		["ws://localhost:8080", new URL("ws://localhost:8080")],
		["https://example.com", false],
		["ws://", false],
		["not a url", false],
		[undefined, false],
	])("parseUpstreamURL(%s) -> %s", (input, expected) => {
		expect(parseUpstreamURL(input)).toEqual(expected);
	});
});

describe("parsePort", () => {
	test.each<[unknown, number | false]>([
		["8080", 8080],
		[8080, 8080],
		["0", 0],
		["65535", 65535],
		["65536", false],
		["-1", false],
		// 文字列は数字のみ許可
		["8080 ", false],
		["12.34", false],
		[1.5, false],
		[undefined, false],
	])("parsePort(%s) -> %s", (input, expected) => {
		expect(parsePort(input)).toBe(expected);
	});
});

describe("createFilter", () => {
	test("空集合なら全て通す", () => {
		const filter = createValidFilter([]);
		expect(filter("app.bsky.feed.post")).toBe(true);
	});

	test("完全一致とワイルドカードの両方で判定する", () => {
		const filter = createValidFilter(["app.bsky.feed.post", "com.example.*"]);
		expect(filter("app.bsky.feed.post")).toBe(true);
		expect(filter("com.example.fooBar")).toBe(true);
		expect(filter("app.bsky.feed.like")).toBe(false);
	});

	test("不正なNSIDが含まれる場合はfalse", () => {
		expect(createFilter(new Set(["app.bsky.feed.post", "invalid*nsid"]))).toBe(false);
	});

	function createValidFilter(wanted: string[]) {
		const filter = createFilter(new Set(wanted));
		if (filter === false) throw new Error("filterが作成できなかった");
		return filter;
	}
});
