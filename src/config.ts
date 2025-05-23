import { join, normalize } from "node:path";
import { exit } from "node:process";
import type { Config } from "./types.js";
import { parsePort, parseUpstreamURL } from "./util.js";

// upstream urlのバリデーション
const upstreamURL = parseUpstreamURL(process.argv[2] || "wss://jetstream2.us-west.bsky.network/subscribe");
if (upstreamURL === false) {
	console.error("Invalid UPSTREAM_URL");
	exit(1);
}
// portのバリデーション
const proxyPort = parsePort(process.argv[3] ?? 8080);
if (proxyPort === false) {
	console.error("Invalid PORT");
	exit(1);
}
const logFile = normalize(process.argv[4] ?? join(import.meta.dirname, "log.txt"));

export const config: Config = { proxyPort, upstreamURL, logFile } as const;
