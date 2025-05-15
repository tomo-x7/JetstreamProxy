import dotenv from "dotenv";

export interface Config {
	proxyPort: number;
	upstreamURL: URL;
}

dotenv.config();
const { UPSTREAM_URL: rawUpstreamURL, PORT: rawPort } = process.env;
// upstream urlのバリデーション
let upstreamURL: URL | null = null;
if (rawUpstreamURL == null) {
	upstreamURL = new URL("wss://jetstream2.us-west.bsky.network/subscribe");
} else if (URL.canParse(rawUpstreamURL)) {
	upstreamURL = new URL(rawUpstreamURL);
} else {
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
