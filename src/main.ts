import EventEmitter from "node:events";
import { DownstreamEventMap, UpstreamEventMap } from "./types.js";
import { createUpstream } from "./upstream.js";
import { config } from "./config.js";
import { createDownstream } from "./downstream.js";
import { parseClientMap, validateMaxWantedCollection } from "./util.js";
import { UUID } from "node:crypto";
import { Decompressor } from "zstd-napi";
import { ZstdDictionary } from "./dict/zstd-dictionary.js";
import { AccountEvent, CommitEvent, IdentityEvent } from "@skyware/jetstream";

const upstreamEmmitter = new EventEmitter<UpstreamEventMap>();
const downstreamEmmitter = new EventEmitter<DownstreamEventMap>();

const decompressor = new Decompressor();
decompressor.loadDictionary(Buffer.from(ZstdDictionary));
const clientMap = new Map<UUID, Set<string> | "all">();

downstreamEmmitter.on("connect", (uuid, wanted) => {
	if (wanted !== "all") {
		const isValid = validateMaxWantedCollection(clientMap, wanted);
		if (!isValid) {
			downstreamEmmitter.emit("rejectConnect", uuid, "The maximum number of collections (100) has been exceeded");
            return;
		}
	}
    downstreamEmmitter.emit("acceptConnect",uuid)
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
	const decompressed = Buffer.from(decompressor.decompress(buff)).toString("ascii");
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
