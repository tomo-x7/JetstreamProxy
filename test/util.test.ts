import { describe, test, expect } from "vitest";
import { parseNSID, parseUpstreamURL, parsePort } from "../src/util.js";

// https://atproto.com/ja/specs/nsid
// https://github.com/bluesky-social/jetstream?tab=readme-ov-file#consuming-jetstream
describe("NSID parse", () => {
	const testcase: [string, { nsid: string; hasPrefix: boolean } | false][] = [
		// ===== 基本的な有効なNSID =====
		// 正規の完全修飾NSID
		["com.example.fooBar", { nsid: "com.example.fooBar", hasPrefix: false }],
		["app.bsky.feed.post", { nsid: "app.bsky.feed.post", hasPrefix: false }],
		["com.example.thing", { nsid: "com.example.thing", hasPrefix: false }],
		["net.users.bob.ping", { nsid: "net.users.bob.ping", hasPrefix: false }],
		["a.b.c", { nsid: "a.b.c", hasPrefix: false }],
		["com.example.fooBarV2", { nsid: "com.example.fooBarV2", hasPrefix: false }],
		["cn.8.lex.stuff", { nsid: "cn.8.lex.stuff", hasPrefix: false }],

		// ===== ワイルドカードパターン =====
		// 正規のワイルドカード表記（最後のセグメントのみ）
		["app.bsky.graph.*", { nsid: "app.bsky.graph", hasPrefix: true }],
		["app.bsky.*", { nsid: "app.bsky", hasPrefix: true }],
		["com.atproto.*", { nsid: "com.atproto", hasPrefix: true }],
		["a.b.*", { nsid: "a.b", hasPrefix: true }],
		["a.*", { nsid: "a", hasPrefix: true }],

		// 無効なワイルドカードパターン
		["*", false], // Jetstream実装では無効
		["a.b.c*", false], // 不完全なセグメント（部分マッチング禁止）
		["a.*.c", false], // 中間セグメントのワイルドカード禁止
		["*.b.c", false], // 先頭セグメントのワイルドカード禁止
		["a.b.*c", false], // セグメント境界以外でのワイルドカード禁止
		["a.b.*.*", false], // 複数ワイルドカード禁止

		// ===== ドメイン部分のテスト =====
		// 有効なドメイン
		["a.b.validName", { nsid: "a.b.validName", hasPrefix: false }], // 最小2セグメント
		["a-b.c-d.validName", { nsid: "a-b.c-d.validName", hasPrefix: false }], // ハイフン許可
		["a.1b.validName", { nsid: "a.1b.validName", hasPrefix: false }], // 2番目以降のセグメントは数字開始可能

		// 無効なドメイン
		["app", false], // セグメントが少なすぎる
		["app.bsky", false], // セグメントが少なすぎる（3セグメント未満）
		[".bsky.feed.post", false], // 空のセグメントは不可
		["-a.b.validName", false], // セグメント先頭のハイフン禁止
		["a-.b.validName", false], // セグメント末尾のハイフン禁止
		["1a.b.validName", false], // 先頭セグメントの数字開始禁止

		// ===== 名前セグメントのテスト =====
		// 有効な名前セグメント
		["a.b.validName", { nsid: "a.b.validName", hasPrefix: false }], // 基本的な名前
		["a.b.validName123", { nsid: "a.b.validName123", hasPrefix: false }], // 数字含有可
		["a.b.ValidName", { nsid: "a.b.ValidName", hasPrefix: false }], // 大文字許可（ケース保持）

		// 無効な名前セグメント
		["com.example.3", false], // 数字で始まる名前セグメント
		["a.b.1invalidName", false], // 名前セグメントの数字開始禁止
		["a.b.invalid-name", false], // 名前セグメントのハイフン禁止
		["a.b.invalidName_", false], // 名前セグメントの特殊文字禁止
		["com.exa💩ple.thing", false], // 非ASCII文字

		// ===== 長さ制限のテスト =====
		// セグメント長の制限: 各セグメントは1-63文字
		["a.b.c", { nsid: "a.b.c", hasPrefix: false }], // 最小セグメント長（1文字）
		[`${"a".repeat(63)}.b.c`, { nsid: `${"a".repeat(63)}.b.c`, hasPrefix: false }], // 最大セグメント長（63文字）
		[`${"a".repeat(64)}.b.c`, false], // 超過セグメント長（64文字）
		[`a.b.${"c".repeat(63)}`, { nsid: `a.b.${"c".repeat(63)}`, hasPrefix: false }], // 最大名前セグメント長（63文字）
		[`a.b.${"c".repeat(64)}`, false], // 超過名前セグメント長（64文字])

		// ドメイン権限部分の長さ制限: 最大253文字（ピリオド含む）
		["a.b.c", { nsid: "a.b.c", hasPrefix: false }], // 短いドメイン部分（3文字）
		[`a.${"b".repeat(63)}.c`, { nsid: `a.${"b".repeat(63)}.c`, hasPrefix: false }], // 1セグメント最大長のドメイン部分
		[
			`${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}`,
			{ nsid: `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}`, hasPrefix: false },
		], // 複数の最大長セグメント（189文字+ピリオド2文字=191文字）
		[
			`${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}.validName`,
			{
				nsid: `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}.validName`,
				hasPrefix: false,
			},
		], // ドメイン部分 250文字+ピリオド3文字=253文字（最大値）
		[`${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(62)}.validName`, false], // ドメイン部分 251文字+ピリオド3文字=254文字（超過）

		// 合計長さの制限: 最大317文字（ピリオド含む）
		["a.b.c", { nsid: "a.b.c", hasPrefix: false }], // 短いNSID（5文字）
		[
			`${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}.e`,
			{ nsid: `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}.e`, hasPrefix: false },
		], // 合計長255文字
		[
			`${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}.${"e".repeat(63)}`,
			{
				nsid: `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}.${"e".repeat(63)}`,
				hasPrefix: false,
			},
		], // 合計長317文字（最大値）
		[`${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}.${"e".repeat(64)}`, false], // 合計長318文字（超過）

		// ワイルドカードパターンの長さ制限
		["a.*", { nsid: "a", hasPrefix: true }], // 短いワイルドカードパターン
		[`${"a".repeat(63)}.*`, { nsid: `${"a".repeat(63)}`, hasPrefix: true }], // 最大セグメント長のワイルドカードパターン
		[
			`${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}.*`,
			{ nsid: `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`, hasPrefix: true },
		], // 最大ドメイン長+ワイルドカード
		[`${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(62)}.*`, false], // ドメイン長超過+ワイルドカード
	];

	test.each(testcase)("parseNSID(%s) should return %j", (input, expected) => {
		expect(parseNSID(input)).toEqual(expected);
	});
});

describe("Upstream URL parse", () => {
	const testcases: [string | unknown, URL | false][] = [
		// 有効なwsスキームのURL
		["ws://example.com", new URL("ws://example.com")],
		["ws://localhost:8080", new URL("ws://localhost:8080")],
		["ws://127.0.0.1:3000", new URL("ws://127.0.0.1:3000")],
		["ws://example.com/path", new URL("ws://example.com/path")],
		["ws://example.com/path/to/resource", new URL("ws://example.com/path/to/resource")],

		// 有効なwssスキームのURL
		["wss://example.com", new URL("wss://example.com")],
		["wss://secure.example.com:443", new URL("wss://secure.example.com:443")],
		["wss://example.com/secure/path", new URL("wss://example.com/secure/path")],

		// クエリパラメータの削除テスト
		["ws://example.com/?param=value", new URL("ws://example.com/?param=value")],
		[
			"ws://example.com/path?param1=value1&param2=value2",
			new URL("ws://example.com/path?param1=value1&param2=value2"),
		],
		["wss://example.com/path?token=secret&user=test", new URL("wss://example.com/path?token=secret&user=test")],
		[
			"wss://example.com/path/?multiple=params&should=be&kept=true",
			new URL("wss://example.com/path/?multiple=params&should=be&kept=true"),
		],

		// 無効なURL
		["not a url", false],
		["invalid://example.com", false],
		["example.com", false],
		["http://example.com", false], // httpスキームは無効
		["https://example.com", false], // httpsスキームは無効
		["ftp://example.com", false], // ftpスキームは無効
		["ws:", false], // 不完全なURL
		["wss:", false], // 不完全なURL
		["ws://", false], // ホストなし
		["wss://", false], // ホストなし
		["//example.com", false], // スキームなし
		["ws//example.com", false], // 無効なスキーム形式
		["javascript:alert(1)", false], // 危険なURL
		["wss://user:password@example.com", new URL("wss://user:password@example.com")], // 認証情報を含む（有効であることを確認）
		["ws://[::1]:8080", new URL("ws://[::1]:8080")], // IPv6（有効であることを確認）
		["ws://[invalidipv6]:8080", false], // 無効なIPv6形式
		["", false], // 空文字列
		[" ", false], // 空白文字
		["ws://example.com:abc", false], // 無効なポート
		["ws://example.com:-80", false], // 負のポート
		["ws://localhost:99999", false], // 範囲外のポート
		[null, false], // null
		[undefined, false], // undefined
		[123, false], // 数値
		[true, false], // 真偽値
		[false, false], // 真偽値
		[{}, false], // オブジェクト
		[[], false], // 配列
		["ws:// example.com", false], // スペースを含む不正なホスト
		["ws://exam ple.com", false], // スペースを含む不正なホスト
		["ws://example.com/ path", false], // スペースを含む不正なパス
		["\uD800", false], // 不正なUTF-16サロゲートペア
		["ws://\u0000example.com", false], // 制御文字を含む
		["ws://example.com\uD800", false], // 不正なサロゲートペア
		["ws://xn--ls8h.la", new URL("ws://xn--ls8h.la")], // Punycode（有効であることを確認）
		["ws://屁.la", new URL("ws://屁.la")], // Unicode IDN（有効であることを確認）
		["ws://％００.com", false], // 不正なエンコード
	];

	test.each(testcases)("parseUpstreamURL(%s) should return %j", (input, expected) =>
		expect(parseUpstreamURL(input)).toEqual(expected),
	);
});

describe("Port parse", () => {
    const testcases: [unknown, number|false][] = [
        // 有効なポート番号
        ["8080", 8080],
        [8080, 8080],
        ["3000", 3000],
        [3000, 3000],
        ["80", 80],
        [80, 80],
        ["443", 443],
        [443, 443],
        ["0", 0],
        [0, 0],
        ["65535", 65535],
        [65535, 65535],
        
        // 無効なポート番号（文字列形式）
        ["", false],
        [" ", false],
        ["abc", false],
        ["123abc", false],
        ["abc123", false],
        ["12.34", false],
        ["-1", false],
        ["-80", false],
        ["65536", false],
        ["99999", false],
        ["1.5", false],
        ["１２３", false],  // 全角数字
        ["8080 ", false],  // 末尾にスペース
        [" 8080", false],  // 先頭にスペース
        ["8 080", false],  // 中間にスペース
        
        // 無効なポート番号（数値形式）
        [-1, false],
        [65536, false],
        [99999, false],
        [1.5, false],
        [Number.NaN, false],
        [Number.POSITIVE_INFINITY, false],
        [Number.NEGATIVE_INFINITY, false],
        
        // 無効な型
        [null, false],
        [undefined, false],
        [true, false],
        [false, false],
        [{}, false],
        [[], false],
        [() => {}, false],
        [BigInt(8080), false],
        [Symbol("8080"), false],
    ];

    test.each(testcases)("parsePort(%s) should return %j", (input, expected) => 
        expect(parsePort(input)).toBe(expected)
    );
});