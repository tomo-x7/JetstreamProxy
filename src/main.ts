import "./sea";
import { exit } from "node:process";
import { init } from "@bokuweb/zstd-wasm";
import { ClientHub } from "./clients.js";
import { config } from "./config.js";
import { createDownstream } from "./downstream.js";
import { v1 } from "./protocol/v1.js";
import { v2 } from "./protocol/v2.js";
import { connectUpstream } from "./upstream.js";

async function main() {
	await init();
	const protocol = { v1, v2 }[config.jetstreamVersion];
	const hub = new ClientHub();
	await connectUpstream(protocol, config.upstreamURL, hub);
	createDownstream(protocol, config.proxyPort, hub);
}

main();

if (process.env.MODE !== "test") {
	process.addListener("SIGTERM", () => exit(0));
	process.addListener("SIGINT", () => exit(0));
	process.addListener("SIGHUP", () => exit(0));
	process.addListener("SIGBREAK", () => exit(0));
}
