import type { TID } from "@atproto/common-web";
import type { AccountEvent, CommitEvent, IdentityEvent } from "@skyware/jetstream";
import type { RawData } from "ws";

export interface DownstreamEventMap {
	message:
		| [AccountEvent, undefined, RawData]
		| [IdentityEvent, undefined, RawData]
		| [CommitEvent<string>, string, RawData];
	connect: [TID, Set<string> | "all"];
	rejectConnect: [TID, string];
	acceptConnect: [TID];
	disconnect: [TID];
}

export interface UpstreamEventMap {
	message: [WSRawMessage];
	updateWantedCollections: [Set<string> | "all"];
}

export interface OptionUpdateMsg {
	type: "options_update";
	payload: {
		wantedCollections?: string[];
		/**wantedDidsはまだ対応しない */
		wantedDids?: never[];
		maxMessageSizeBytes?: number;
	};
}

export interface Config {
	proxyPort: number;
	upstreamURL: URL;
	logFile: string;
}

export type JetstreamEvent = AccountEvent | IdentityEvent | CommitEvent<string>;
export type WSRawMessage = ArrayBuffer | string;
