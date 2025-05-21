import type { UUID } from "node:crypto";
import EventEmitter from "node:events";
import type { AccountEvent, CommitEvent, IdentityEvent } from "@skyware/jetstream";
import { config } from "./config.js";
import { ZstdDictionary } from "./dict/zstd-dictionary.js";
import { createDownstream } from "./downstream.js";
import type { DownstreamEventMap, UpstreamEventMap } from "./types.js";
import { createUpstream } from "./upstream.js";
import { parseClientMap, validateMaxWantedCollection } from "./util.js";
import { init, createDCtx, decompressUsingDict, freeDCtx } from "@bokuweb/zstd-wasm";

const upstreamEmmitter = new EventEmitter<UpstreamEventMap>();
const downstreamEmmitter = new EventEmitter<DownstreamEventMap>();

await init();
const dict = Buffer.from(ZstdDictionary, "base64");
const decompress = (data: Buffer) => {
	const dctx = createDCtx();
	const raw = decompressUsingDict(dctx, data, dict);
	freeDCtx(dctx)
	return Buffer.from(raw).toString("utf-8");
};
const clientMap = new Map<UUID, Set<string> | "all">();

downstreamEmmitter.on("connect", (uuid, wanted) => {
	if (wanted !== "all") {
		const isValid = validateMaxWantedCollection(clientMap, wanted);
		if (!isValid) {
			downstreamEmmitter.emit("rejectConnect", uuid, "The maximum number of collections (100) has been exceeded");
			return;
		}
	}
	downstreamEmmitter.emit("acceptConnect", uuid);
	clientMap.set(uuid, wanted);
	upstreamEmmitter.emit("updateWantedCollections", parseClientMap(clientMap));
});
downstreamEmmitter.on("disconnect", (uuid) => {
	clientMap.delete(uuid);
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
		console.error("cannot parse rawdata\n", rawdata);
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
		console.error("Unknown message kind\n", data);
	}
});

const upstream = createUpstream(config, upstreamEmmitter);
const downstream = createDownstream(config, downstreamEmmitter);
