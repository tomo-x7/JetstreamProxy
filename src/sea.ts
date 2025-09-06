import { readFileSync } from "node:fs";
import { join } from "node:path";
import type seaType from "node:sea";

type seaConfig = typeof import("../sea-config.json");

export async function getAsset(assetKey: keyof seaConfig["assets"]): Promise<Buffer> {
	let sea: typeof seaType | null = null;
	try {
		sea = await import("node:sea");
	} catch {}
	if (sea?.isSea()) {
		return Buffer.from(sea.getAsset(assetKey));
	} else {
		switch (assetKey) {
			case "zstd.wasm":
				return readFileSync(join(__dirname, "./assets/zstd-wasm/zstd.wasm"));
			case "zstd_dictionary":
				return readFileSync(join(__dirname, "./assets/zstd_dictionary/zstd_dictionary"));
			default: {
				const _assertNever: never = assetKey;
				throw new Error(`Unknown asset key: ${assetKey}`);
			}
		}
	}
}

globalThis.getAsset = getAsset;
