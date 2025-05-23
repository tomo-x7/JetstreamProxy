import { join, normalize } from "node:path";
import dotenv from "dotenv";
import type { Config } from "./types.js";
import { parsePort, parseUpstreamURL } from "./util.js";

dotenv.config();
const { UPSTREAM_URL: rawUpstreamURL, PORT: rawPort, LOG_FILE: rawLogFile } = process.env;
// upstream urlのバリデーション
const upstreamURL = parseUpstreamURL(rawUpstreamURL || "wss://jetstream2.us-west.bsky.network/subscribe");
if (upstreamURL === false) {
	throw new Error("Invalid UPSTREAM_URL");
}
// portのバリデーション
const proxyPort = parsePort(rawPort ?? 8080);
if (proxyPort === false) {
	throw new Error("Invalid PORT");
}
const logFile = normalize(rawLogFile ?? join(import.meta.dirname, "log.txt"));
export const config: Config = { proxyPort, upstreamURL, logFile } as const;
