import { describe, expect, test } from "vitest";
import { CliError, parseCliArgs } from "../src/cli.js";

const parse = (args: string[]) => parseCliArgs(args, "default-log.txt");

describe("parseCliArgs", () => {
	test("指定がなければv1の既定値を使う", () => {
		expect(parse([])).toEqual({
			jetstreamVersion: "v1",
			upstreamURL: new URL("wss://jetstream2.us-west.bsky.network/subscribe"),
			proxyPort: 8000,
			logFile: "default-log.txt",
		});
	});

	test("v2ではv2の既定のupstreamを使う", () => {
		expect(parse(["--jetstream-version", "v2"])).toMatchObject({
			upstreamURL: new URL("wss://jetstream.us-east.bsky.network/xrpc/network.bsky.jetstream.subscribeEvents"),
		});
	});

	test("オプションで指定できる", () => {
		expect(parse(["-u", "ws://localhost:1234", "-p", "9000", "-l", "log.txt"])).toMatchObject({
			upstreamURL: new URL("ws://localhost:1234"),
			proxyPort: 9000,
			logFile: "log.txt",
		});
	});

	test.each([
		// 位置引数は廃止した
		["ws://localhost:1234"],
		["--jetstream-version", "v3"],
		["--port", "abc"],
		["--unknown"],
	])("不正な引数 %j はエラーになる", (...args) => {
		expect(() => parse(args)).toThrow(CliError);
	});
});
