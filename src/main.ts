import "./sea";
import EventEmitter from "node:events";
import { exit } from "node:process";
import type { TID } from "@atproto/common-web";
import { createDCtx, decompressUsingDict, freeDCtx, init } from "@bokuweb/zstd-wasm";
import type { AccountEvent, CommitEvent, IdentityEvent } from "@skyware/jetstream";
import { config } from "./config.js";
import { createDownstream } from "./downstream.js";
import { logger } from "./logger.js";
import type { DownstreamEventMap, UpstreamEventMap } from "./types.js";
import { createUpstream } from "./upstream.js";
import { parseClientMap, validateMaxWantedCollection } from "./util.js";

async function main() {
	const upstreamEmmitter = new EventEmitter<UpstreamEventMap>();
	const downstreamEmmitter = new EventEmitter<DownstreamEventMap>();

	await init();
	const dict = await globalThis.getAsset("zstd_dictionary");
	const decompress = (data: Buffer) => {
		const dctx = createDCtx();
		const raw = decompressUsingDict(dctx, data, dict);
		freeDCtx(dctx);
		return Buffer.from(raw).toString("utf-8");
	};
	const clientMap = new Map<TID, Set<string> | "all">();

	downstreamEmmitter.on("connect", (tid, wanted) => {
		if (wanted !== "all") {
			const isValid = validateMaxWantedCollection(clientMap, wanted);
			if (!isValid) {
				downstreamEmmitter.emit(
					"rejectConnect",
					tid,
					"The maximum number of collections (100) has been exceeded",
				);
				return;
			}
		}
		downstreamEmmitter.emit("acceptConnect", tid);
		clientMap.set(tid, wanted);
		upstreamEmmitter.emit("updateWantedCollections", parseClientMap(clientMap));
	});
	downstreamEmmitter.on("disconnect", (tid) => {
		clientMap.delete(tid);
		upstreamEmmitter.emit("updateWantedCollections", parseClientMap(clientMap));
	});
	upstreamEmmitter.on("message", (rawdata) => {
		let buff: Buffer;
		if (rawdata instanceof Buffer) {
			buff = rawdata;
		} else if (rawdata instanceof ArrayBuffer) {
			buff = Buffer.from(rawdata);
		} else {
			// FIXME: どう変換するのかわからん、たぶんBufferで渡ってくることが多いと思うからとりあえず放置
			logger.error(`Failed to parse raw data: ${String(rawdata)}`);
			return;
		}
		const decompressed = decompress(buff);
		const data = JSON.parse(decompressed) as AccountEvent | IdentityEvent | CommitEvent<string>;
		if (data.kind === "commit") {
			downstreamEmmitter.emit("message", data, data.commit.collection, rawdata);
		} else if (data.kind === "identity") {
			downstreamEmmitter.emit("message", data, undefined, rawdata);
		} else if (data.kind === "account") {
			downstreamEmmitter.emit("message", data, undefined, rawdata);
		} else {
			logger.warn(`Unknown message kind received: ${JSON.stringify(data)}`);
		}
	});

	await createUpstream(config, upstreamEmmitter);
	createDownstream(config, downstreamEmmitter);
}

main();

if (process.env.MODE !== "test") {
	process.addListener("SIGTERM", () => exit(0));
	process.addListener("SIGINT", () => exit(0));
	process.addListener("SIGHUP", () => exit(0));
	process.addListener("SIGBREAK", () => exit(0));
}
