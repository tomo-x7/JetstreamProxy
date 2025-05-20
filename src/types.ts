import type { UUID } from "node:crypto";
import type { AccountEvent, CommitEvent, IdentityEvent } from "@skyware/jetstream";
import { RawData } from "ws";

export interface DownstreamEventMap {
	message:
		| [AccountEvent, undefined, RawData]
		| [IdentityEvent, undefined, RawData]
		| [CommitEvent<string>, string, RawData];
	connect: [UUID, Set<string> | "all"];
	rejectConnect: [UUID, string];
	acceptConnect:[UUID]
	disconnect: [UUID];
}

export interface UpstreamEventMap {
	message: [RawData];
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
}
