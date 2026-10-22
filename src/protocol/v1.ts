// Jetstream v1 (/subscribe)
// https://github.com/bluesky-social/jetstream-legacy
import { logger } from "../logger.js";
import type { ClientRequest, Protocol, Subscription, UpstreamEvent } from "../types.js";
import { createFilter } from "../util.js";

export interface OptionUpdateMsg {
	type: "options_update";
	payload: { wantedCollections?: string[] };
}

/** クライアントがいないときに購読するコレクション */
const DUMMY_COLLECTION = "example.dummy.collection";

export const v1: Protocol = {
	loadDictionary: () => globalThis.getAsset("zstd_dictionary"),

	upstreamURL(base, { subscription }) {
		const url = new URL(base);
		url.searchParams.set("compress", "true");
		url.searchParams.delete("wantedCollections");
		if (subscription === undefined) {
			// クライアントが接続するまでoptions_updateを待ってもらう
			url.searchParams.set("requireHello", "true");
			return url;
		}
		for (const collection of wantedCollections(subscription) ?? []) {
			url.searchParams.append("wantedCollections", collection);
		}
		return url;
	},

	updateMessage(subscription) {
		const msg: OptionUpdateMsg = {
			type: "options_update",
			payload: {
				wantedCollections: subscription === undefined ? [DUMMY_COLLECTION] : wantedCollections(subscription),
			},
		};
		return JSON.stringify(msg);
	},

	parseFrame(text, compressed) {
		const data = JSON.parse(text);
		switch (data?.kind) {
			case "commit":
				if (typeof data.commit?.collection !== "string") {
					logger.error(`Invalid commit event received: ${text}`);
					return undefined;
				}
				return { kind: "commit", collection: data.commit.collection, text, compressed };
			case "identity":
			case "account":
				return { kind: data.kind, text, compressed };
			default:
				logger.warn(`Unknown message kind received: ${text}`);
				return undefined;
		}
	},

	parseClientRequest(url): ClientRequest {
		const sp = url.searchParams;
		const collections = new Set(sp.getAll("wantedCollections"));
		if (createFilter(collections) === false) {
			return { ok: false, rejection: { type: "close", code: 4000, reason: "bad collection" } };
		}
		return {
			ok: true,
			subscription: {
				kinds: sp.has("onlyCommit") ? new Set(["commit"]) : "all",
				collections: sp.has("wantedCollections") ? collections : "all",
			},
			compress: sp.has("compress"),
		};
	},

	tooManyCollections: {
		type: "close",
		code: 4000,
		reason: "The maximum number of collections (100) has been exceeded",
	},

	frameForClient: (event: UpstreamEvent, compress) => (compress ? event.compressed : event.text),

	closeOnClientMessage: false,
};

/** upstreamに要求するwantedCollections。undefinedなら全て */
function wantedCollections({ collections }: Subscription): string[] | undefined {
	if (collections === "all") return undefined;
	// v1はkindsで絞り込めないので、commitが要らなくてもダミーを指定してcommitを止める
	return collections.size > 0 ? Array.from(collections) : [DUMMY_COLLECTION];
}
