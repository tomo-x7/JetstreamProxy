import dotenv from "dotenv";
import { Config } from "./types.js";
import { parseUpstreamURL } from "./util.js";

dotenv.config();
const { UPSTREAM_URL: rawUpstreamURL, PORT: rawPort } = process.env;
// upstream urlのバリデーション
const upstreamURL = parseUpstreamURL(rawUpstreamURL || "wss://jetstream2.us-west.bsky.network/subscribe");
if (upstreamURL === false) {
	throw new Error("Invalid UPSTREAM_URL");
}
// portのバリデーション
let proxyPort = 8080;
if (rawPort != null) {
	const parsedPort = Number.parseInt(rawPort, 10);
	if (Number.isNaN(parsedPort) || parsedPort < 0 || parsedPort > 65535) {
		throw new Error("Invalid PORT");
	}
	proxyPort = parsedPort;
}
export const config: Config = { proxyPort, upstreamURL } as const;
