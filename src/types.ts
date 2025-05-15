import type { UUID } from "node:crypto";
import type { AccountEvent, CommitEvent, IdentityEvent } from "@skyware/jetstream";
import { RawData } from "ws";
export interface EventMap {
	recieve: [AccountEvent, undefined,RawData] | [IdentityEvent, undefined,RawData] | [CommitEvent<string>, string,RawData];
	updateWantedCollections: [Set<string>, UUID];
	rejectUpdate: [UUID,string];
}
export interface OptionUpdateMsg {
	type: "options_update";
	payload: {
		wantedCollections: string[];
		/**wantedDidsはまだ対応しない */
		wantedDids: never[];
		maxMessageSizeBytes: number;
	};
}
/**@deprecated */
export type configtype = { wsURL: string; wantedCollections: Set<string>; port: number };
/**@deprecated */
export type BufferLike =
	| string
	| Buffer
	| DataView
	| number
	| ArrayBufferView
	| Uint8Array
	| ArrayBuffer
	| SharedArrayBuffer
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	| readonly any[]
	| readonly number[]
	| { valueOf(): ArrayBuffer }
	| { valueOf(): SharedArrayBuffer }
	| { valueOf(): Uint8Array }
	| { valueOf(): readonly number[] }
	| { valueOf(): string }
	| { [Symbol.toPrimitive](hint: string): string };
