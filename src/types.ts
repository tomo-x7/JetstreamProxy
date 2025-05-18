import type { UUID } from "node:crypto";
import type { AccountEvent, CommitEvent, IdentityEvent } from "@skyware/jetstream";
import { RawData } from "ws";

export interface DownstreamEventMap {
	message:
		| [AccountEvent, undefined, RawData]
		| [IdentityEvent, undefined, RawData]
		| [CommitEvent<string>, string, RawData];
	updateWantedCollections: [UUID, Set<string> | "all"];
	deleteWantedAll: [UUID];
	rejectConnection: [UUID, string];
}

export interface UpstreamEventMap {
	message:
		| [AccountEvent, undefined, RawData]
		| [IdentityEvent, undefined, RawData]
		| [CommitEvent<string>, string, RawData];
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
