import dotenv from "dotenv";
import { Config } from "./types.js";
import { parsePort, parseUpstreamURL } from "./util.js";

dotenv.config();
const { UPSTREAM_URL: rawUpstreamURL, PORT: rawPort } = process.env;
// upstream urlのバリデーション
const upstreamURL = parseUpstreamURL(rawUpstreamURL || "wss://jetstream2.us-west.bsky.network/subscribe");
if (upstreamURL === false) {
	throw new Error("Invalid UPSTREAM_URL");
}
// portのバリデーション
const proxyPort = parsePort(rawPort??8080);
if(proxyPort===false){
	throw new Error("Invalid PORT")
}
export const config: Config = { proxyPort, upstreamURL } as const;
