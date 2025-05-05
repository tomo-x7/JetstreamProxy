export type configtype = { wsURL: string; wantedCollections: Set<string>; port: number };
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
