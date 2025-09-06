type seaConfig = typeof import("../sea-config.json");
declare global {
	export function getAsset(assetKey: keyof seaConfig["assets"]): Promise<Buffer>;
}
export {};
