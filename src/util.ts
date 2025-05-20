export function parseNSID(nsid: string): { nsid: string; hasPrefix: boolean } | false {
	// 空文字列チェック
	if (!nsid || nsid.length === 0) return false;

	// 全体の長さチェック (最大317文字)
	if (nsid.length > 317) return false;

	// ASCII文字のみ許可
	if (!/^[a-zA-Z0-9.*_-]+$/.test(nsid)) return false;

	// ワイルドカードパターンの処理
	let hasPrefix = false;
	let actualNsid = nsid;

	// 単独の * は無効
	if (nsid === "*") return false;

	// ワイルドカードが末尾にある場合
	if (nsid.endsWith(".*")) {
		hasPrefix = true;
		actualNsid = nsid.slice(0, -2); // .*を削除
	} else if (nsid.includes("*")) {
		// その他の位置のワイルドカードは無効
		return false;
	}

	// セグメントに分割
	const segments = actualNsid.split(".");

	// ケース別のセグメント数検証
	if (hasPrefix) {
		// ワイルドカード使用時は最低1セグメント必要（a.*のようなケース）
		if (segments.length < 1) return false;
	} else {
		// ワイルドカード未使用時は最低3セグメント必要
		if (segments.length < 3) return false;
	}

	// 空のセグメントがあれば無効
	if (segments.some((segment) => segment.length === 0)) return false;

	// ドメイン部分（最後のセグメントを除く、ワイルドカード使用時は全て）
	const domainSegments = hasPrefix ? segments : segments.slice(0, -1);

	// ドメイン部分は最低1セグメント必要（ワイルドカード使用時）
	// または通常時は最低2セグメント必要
	const minDomainSegments = hasPrefix ? 1 : 2;
	if (domainSegments.length < minDomainSegments) return false;

	// ドメイン部分の合計長さ（ピリオドを含む）を計算
	const domainLength = domainSegments.join(".").length;
	if (domainLength > 253) return false;

	// ドメイン部分の各セグメントを検証
	for (const segment of domainSegments) {
		// セグメントの長さ（1-63文字）
		if (segment.length < 1 || segment.length > 63) return false;

		// 許可された文字（小文字a-z、数字0-9、ハイフン-）
		if (!/^[a-z0-9-]+$/.test(segment.toLowerCase())) return false;

		// ハイフンは先頭や末尾に使用できない
		if (segment.startsWith("-") || segment.endsWith("-")) return false;
	}

	// 先頭セグメント（TLD）は数字で始まることができない
	if (/^[0-9]/.test(domainSegments[0])) return false;

	// ドメイン部分を小文字に正規化
	const normalizedDomainSegments = domainSegments.map((segment) => segment.toLowerCase());

	// 名前セグメントの検証（ワイルドカード未使用時のみ）
	let nameSegment = "";

	if (!hasPrefix) {
		// 名前セグメント（最後のセグメント）
		nameSegment = segments[segments.length - 1];

		// 名前セグメントの長さ（1-63文字）
		if (nameSegment.length < 1 || nameSegment.length > 63) return false;

		// 名前セグメントの許可された文字（英数字のみ）
		if (!/^[A-Za-z0-9]+$/.test(nameSegment)) return false;

		// 名前セグメントは数字で始めることができない
		if (/^[0-9]/.test(nameSegment)) return false;
	}

	// 正規化されたNSIDを構築
	const normalizedNsid = hasPrefix
		? normalizedDomainSegments.join(".")
		: [...normalizedDomainSegments, nameSegment].join(".");

	return {
		nsid: normalizedNsid,
		hasPrefix,
	};
}

export function parseUpstreamURL(url: unknown): URL | false {
	if (typeof url !== "string") return false;
	if (/\s/.test(url)) return false;
	if (!URL.canParse(url)) return false;
	const parsedURL = new URL(url);
	if (parsedURL.protocol !== "ws:" && parsedURL.protocol !== "wss:") return false;
	if (parsedURL.hostname.length === 0) return false;
	return parsedURL;
}

export function parsePort(port: unknown): number | false {
	if (typeof port === "number") {
		if (port < 0 || port > 65535 || Number.isNaN(port) || !Number.isInteger(port)) return false;
		return port;
	} else if (typeof port === "string") {
		const parsedPort = Number.parseInt(port, 10);
		if (Number.isNaN(parsedPort) || parsedPort < 0 || parsedPort > 65535) return false;
		if (port !== parsedPort.toString()) return false;
		return parsedPort;
	}
	return false;
}

/**新規クライアント接続時は上限に達しないことを事前にvalidateMaxWantedCollectionで確認すること */
export function parseClientMap(map: Map<string, Set<string> | "all">): Set<string> | "all" {
	const wanted = new Set<string>();
	for (const [key, cols] of map) {
		if (cols === "all") {
			return "all";
		} else {
			// TODO: app.bsky.feed.*とapp.bsky.feed.likeのような重複を防ぐ
			for (const col of cols) wanted.add(col);
		}
	}
	if (wanted.size > 100) throw new Error("Too many wanted collections (maximum 100 allowed)");
	return wanted;
}

export function validateMaxWantedCollection(
	oldset: Map<string, Set<string> | "all"> | Set<string>,
	newset: Set<string>,
): boolean {
	const set = oldset instanceof Set ? oldset : new Set<string>();
	if (oldset instanceof Map) {
		for (const connect of oldset.values())
			if (connect !== "all") for (const collection of connect) set.add(collection);
	}
	for (const collection of newset) set.add(collection);
	// TODO: app.bsky.feed.*とapp.bsky.feed.likeのような重複を防ぐ
	return set.size <= 100;
}
