// Jetstream v2 (network.bsky.jetstream.subscribeEvents)
// https://github.com/bluesky-social/jetstream/blob/main/lexicons/network/bsky/jetstream/subscribeEvents.json

import { MAX_COLLECTIONS } from "../clients.js";
import { logger } from "../logger.js";
import type { ClientRequest, EventKind, Protocol, Rejection, Subscription, UpstreamEvent } from "../types.js";
import { parseNSID } from "../util.js";

const SUBSCRIBE_PATH = "/xrpc/network.bsky.jetstream.subscribeEvents";
const DICTIONARY_PATH = "/xrpc/network.bsky.jetstream.getZstdDictionary";
const PAYLOAD_TYPE_PREFIX = "network.bsky.jetstream.subscribeEvents#";
const KINDS: readonly EventKind[] = ["commit", "identity", "account", "sync"];
/** クライアントがいないときの購読内容 */
const IDLE_SUBSCRIPTION: Subscription = {
	kinds: new Set(["commit"]),
	collections: new Set(["example.dummy.collection"]),
};

/** クライアントに使わせないパラメータ */
const REJECTED_PARAMS: Record<string, string> = {
	dids: "dids is not supported by JetstreamProxy",
	cursor: "cursor is not supported by JetstreamProxy",
	zstdDictionary: "zstdDictionary is not supported by JetstreamProxy",
	maxMessageSizeBytes: "maxMessageSizeBytes is not supported by JetstreamProxy",
	wantedCollections: "wantedCollections is the legacy /subscribe parameter; use collections",
	wantedDids: "wantedDids is the legacy /subscribe parameter; use dids",
	requireHello: "requireHello is not supported on this endpoint",
	compress: "compress is the legacy /subscribe parameter",
};

export const v2: Protocol = {
	async loadDictionary(upstreamURL) {
		const url = new URL(DICTIONARY_PATH, upstreamURL);
		url.protocol = url.protocol === "wss:" ? "https:" : "http:";
		const res = await fetch(url);
		if (!res.ok) throw new Error(`Failed to fetch zstd dictionary from ${url}: ${res.status}`);
		return Buffer.from(await res.arrayBuffer());
	},

	upstreamURL(base, { subscription = IDLE_SUBSCRIPTION, cursor, dictionary }) {
		const url = new URL(base);
		url.searchParams.set("zstdDictionary", String(dictionaryId(dictionary)));
		if (subscription.kinds !== "all") {
			for (const kind of subscription.kinds) url.searchParams.append("kinds", kind);
		}
		if (subscription.collections !== "all") {
			for (const collection of subscription.collections) url.searchParams.append("collections", collection);
		}
		if (cursor !== undefined) url.searchParams.set("cursor", String(cursor));
		return url;
	},

	// v2は接続中に購読内容を変更できない
	updateMessage: () => undefined,

	parseFrame(text, compressed) {
		const frame = JSON.parse(text);
		if (frame?.$type === "error") {
			logger.error(`Upstream error: ${frame.error}: ${frame.message}`);
			return undefined;
		}
		const payload = frame?.$type === "message" ? frame.payload : undefined;
		const kind = String(payload?.$type).slice(PAYLOAD_TYPE_PREFIX.length);
		if (kind === "info") {
			logger.info(`Upstream info: ${payload.name}: ${payload.message}`);
			return undefined;
		}
		if (!KINDS.includes(kind as EventKind) || typeof payload.seq !== "number") {
			logger.warn(`Unknown message received: ${text}`);
			return undefined;
		}
		if (kind === "commit" && typeof payload.collection !== "string") {
			logger.error(`Invalid commit event received: ${text}`);
			return undefined;
		}
		const witnessedAt = Date.parse(payload.witnessedAt ?? payload.time);
		return {
			kind: kind as EventKind,
			collection: payload.collection,
			seq: payload.seq,
			witnessedAtUs: Number.isNaN(witnessedAt) ? undefined : witnessedAt * 1000,
			text,
			compressed,
		};
	},

	parseClientRequest(url): ClientRequest {
		if (url.pathname !== SUBSCRIBE_PATH) {
			return reject(404, "MethodNotImplemented", `only ${SUBSCRIBE_PATH} is available`);
		}
		const sp = url.searchParams;
		for (const [param, message] of Object.entries(REJECTED_PARAMS)) {
			if (sp.has(param)) return invalid(message);
		}

		const kinds = sp.getAll("kinds");
		if (kinds.length > KINDS.length) return invalid(`too many kinds values: ${kinds.length}`);
		const unknownKind = kinds.find((kind) => !KINDS.includes(kind as EventKind));
		if (unknownKind !== undefined) return invalid(`unknown kind: ${unknownKind}`);

		const collections = sp.getAll("collections");
		if (collections.length > MAX_COLLECTIONS) return invalid(`too many collections values: ${collections.length}`);
		const invalidCollection = collections.find((c) => !isValidCollection(c));
		if (invalidCollection !== undefined) return invalid(`invalid collection: ${invalidCollection}`);
		if (collections.length > 0 && kinds.length > 0 && !kinds.includes("commit")) {
			return invalid("collections filter can never apply: kinds excludes commit");
		}

		return {
			ok: true,
			subscription: {
				kinds: kinds.length > 0 ? new Set(kinds as EventKind[]) : "all",
				collections: collections.length > 0 ? new Set(collections) : "all",
			},
			compress: false,
		};
	},

	tooManyCollections: invalidRequest("The maximum number of collections (100) has been exceeded"),

	frameForClient: (event: UpstreamEvent) => event.text,

	closeOnClientMessage: true,

	subprotocol: "xrpc.v1.json",
};

/** NSIDか`<prefix>.*`。v1と違い、ワイルドカードの前はNSIDの先頭として有効でなければならない */
function isValidCollection(collection: string): boolean {
	const head = collection.endsWith(".*") ? collection.slice(0, -2) : undefined;
	return parseNSID(head === undefined ? collection : `${head}.x`) !== false;
}

/** zstd辞書のヘッダーに埋め込まれた辞書ID (RFC 8878 5章) */
function dictionaryId(dictionary: Buffer): number {
	const MAGIC = 0xec30a437;
	if (dictionary.length < 8 || dictionary.readUInt32LE(0) !== MAGIC) throw new Error("Invalid zstd dictionary");
	return dictionary.readUInt32LE(4);
}

function invalidRequest(message: string): Rejection {
	return { type: "http", status: 400, error: "InvalidRequest", message };
}

function invalid(message: string): ClientRequest {
	return { ok: false, rejection: invalidRequest(message) };
}

function reject(status: number, error: string, message: string): ClientRequest {
	return { ok: false, rejection: { type: "http", status, error, message } };
}
