// `ws`を読み込むとモックが循環するので、このファイルでは`ws`をimportしない

/**
 * `vi.mock("ws", ...)` に渡すfactory。
 * Proxy → Jetstream(upstream) の通信だけをモックに差し替える。
 * upstream.ts は `ws` の default export を使い、downstream.ts は named export の WebSocketServer を使うので、
 * default export だけ差し替えれば Proxy → クライアント(downstream) は本物の ws のまま動く。
 */
export async function mockUpstreamWebSocket(importOriginal: () => Promise<typeof import("ws")>) {
	const { WebSocket: MockWebSocket } = await import("mock-socket");
	// mock-socket の MessageEvent は ports が null で、partysocket が Node の MessageEvent に複製する際に落ちるので補う
	class MockUpstreamWebSocket extends MockWebSocket {
		dispatchEvent(event: Event & { ports?: unknown }, ...args: unknown[]) {
			if (event.ports === null) event.ports = [];
			return super.dispatchEvent(event, ...args);
		}
	}
	return { ...(await importOriginal()), default: MockUpstreamWebSocket };
}
