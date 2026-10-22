// Proxyに接続しているクライアントの管理と、upstreamに要求する購読内容の集約
import type { Subscription, UpstreamEvent } from "./types.js";
import { createFilter } from "./util.js";

/** upstreamに要求できるcollectionsの上限 */
export const MAX_COLLECTIONS = 100;

interface Client {
	subscription: Subscription;
	wants: (event: UpstreamEvent) => boolean;
	send: (event: UpstreamEvent) => void;
}

export class ClientHub {
	private readonly clients = new Set<Client>();
	private readonly changeListeners = new Set<() => void>();

	/** 追加してもcollectionsの合計が上限を超えないか */
	canAdd(subscription: Subscription): boolean {
		const collections = new Set<string>();
		for (const { subscription: s } of [...this.clients, { subscription }]) {
			if (s.collections !== "all") for (const c of s.collections) collections.add(c);
		}
		return collections.size <= MAX_COLLECTIONS;
	}

	/**
	 * クライアントを追加する
	 * @returns クライアントを取り除く関数
	 */
	add(subscription: Subscription, send: (event: UpstreamEvent) => void): () => void {
		const client: Client = { subscription, wants: createMatcher(subscription), send };
		this.clients.add(client);
		this.notifyChange();
		return () => {
			if (this.clients.delete(client)) this.notifyChange();
		};
	}

	broadcast(event: UpstreamEvent) {
		for (const client of this.clients) {
			if (client.wants(event)) client.send(event);
		}
	}

	/** 全クライアントの購読内容を合わせたもの。クライアントがいなければundefined */
	get subscription(): Subscription | undefined {
		if (this.clients.size === 0) return undefined;
		const subscriptions = Array.from(this.clients, (c) => c.subscription);
		return mergeSubscriptions(subscriptions);
	}

	onChange(listener: () => void) {
		this.changeListeners.add(listener);
	}

	private notifyChange() {
		for (const listener of this.changeListeners) listener();
	}
}

function createMatcher({ kinds, collections }: Subscription): (event: UpstreamEvent) => boolean {
	const collectionFilter = collections === "all" ? () => true : createFilter(new Set(collections));
	// collectionsは事前に検証済み
	if (collectionFilter === false) throw new Error("invalid collections");
	return (event) => {
		if (kinds !== "all" && !kinds.has(event.kind)) return false;
		if (event.kind !== "commit" || event.collection == null) return true;
		return collectionFilter(event.collection);
	};
}

function mergeSubscriptions(subscriptions: Subscription[]): Subscription {
	const wantsCommit = (s: Subscription) => s.kinds === "all" || s.kinds.has("commit");
	return {
		kinds: union(subscriptions.map((s) => s.kinds)),
		// commitを受け取らないクライアントのcollectionsは関係ない
		collections: union(subscriptions.filter(wantsCommit).map((s) => s.collections)),
	};
}

/** どれかが"all"なら"all"、そうでなければ和集合 */
function union<T>(sets: (ReadonlySet<T> | "all")[]): ReadonlySet<T> | "all" {
	const result = new Set<T>();
	for (const set of sets) {
		if (set === "all") return "all";
		for (const item of set) result.add(item);
	}
	return result;
}
