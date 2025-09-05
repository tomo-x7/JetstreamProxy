import EventEmitter from "node:events";
import fs from "node:fs";
import path from 'node:path';
import { exit } from "node:process";
import type { TID } from "@atproto/common-web";
import { createDCtx, decompressUsingDict, init } from "@bokuweb/zstd-wasm";
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
	const dict = fs.readFileSync(path.resolve(__dirname, './dict/zstd_dictionary'));
	const decompress = (buff: Uint8Array<ArrayBufferLike>) => {
		const decompressed = decompressUsingDict(createDCtx(), buff, dict);
    return Buffer.from(decompressed).toString("utf-8");
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
    let buf: Uint8Array<ArrayBufferLike>;
    if (Array.isArray(rawdata)) {
      buf = Uint8Array.from(rawdata);
    } else if (rawdata instanceof Buffer) {
      buf = rawdata;
    } else if (rawdata instanceof ArrayBuffer) {
      buf = new Uint8Array(rawdata);
    } else {
      return logger.error('Failed to convert RawData.');
    }
    const data = JSON.parse(decompress(buf)) as AccountEvent | IdentityEvent | CommitEvent<string>;
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

	const upstream = createUpstream(config, upstreamEmmitter);
	const downstream = createDownstream(config, downstreamEmmitter);
}

main();

if (process.env.MODE !== "test") {
	process.addListener("SIGTERM", () => exit(0));
	process.addListener("SIGINT", () => exit(0));
	process.addListener("SIGHUP", () => exit(0));
	process.addListener("SIGBREAK", () => exit(0));
}
