import { parseArgs } from "node:util";
import type { Config, JetstreamVersion } from "./types.js";
import { parsePort, parseUpstreamURL } from "./util.js";

const DEFAULT_UPSTREAM_URL: Record<JetstreamVersion, string> = {
	v1: "wss://jetstream2.us-west.bsky.network/subscribe",
	v2: "wss://jetstream.us-east.bsky.network/xrpc/network.bsky.jetstream.subscribeEvents",
};

export const USAGE = `Usage: jetstreamproxy [options]

Options:
  --jetstream-version <v1|v2>  Jetstream protocol version (default: v1)
  -u, --upstream <url>         Jetstream URL
                                 (default v1: ${DEFAULT_UPSTREAM_URL.v1})
                                 (default v2: ${DEFAULT_UPSTREAM_URL.v2})
  -p, --port <port>            Port to listen on (default: 8000)
  -l, --log-file <path>        Log file (default: log.txt next to the executable)
  -h, --help                   Show this help`;

export class CliError extends Error {}

/**
 * コマンドライン引数をパースする。
 * @returns ヘルプを表示する場合は "help"
 * @throws {CliError} 引数が不正な場合
 */
export function parseCliArgs(args: string[], defaultLogFile: string): Config | "help" {
	let values: ReturnType<typeof parseOptions>["values"];
	try {
		values = parseOptions(args).values;
	} catch (e) {
		throw new CliError(e instanceof Error ? e.message : String(e));
	}
	if (values.help) return "help";

	const jetstreamVersion = values["jetstream-version"] ?? "v1";
	if (jetstreamVersion !== "v1" && jetstreamVersion !== "v2") {
		throw new CliError(`Invalid --jetstream-version: ${jetstreamVersion} (expected v1 or v2)`);
	}
	const upstreamURL = parseUpstreamURL(values.upstream ?? DEFAULT_UPSTREAM_URL[jetstreamVersion]);
	if (upstreamURL === false) throw new CliError(`Invalid --upstream: ${values.upstream}`);
	const proxyPort = parsePort(values.port ?? "8000");
	if (proxyPort === false) throw new CliError(`Invalid --port: ${values.port}`);

	return { jetstreamVersion, upstreamURL, proxyPort, logFile: values["log-file"] ?? defaultLogFile };
}

function parseOptions(args: string[]) {
	return parseArgs({
		args,
		strict: true,
		allowPositionals: false,
		options: {
			"jetstream-version": { type: "string" },
			upstream: { type: "string", short: "u" },
			port: { type: "string", short: "p" },
			"log-file": { type: "string", short: "l" },
			help: { type: "boolean", short: "h" },
		},
	});
}
