// @ts-check
import * as esbuild from "esbuild";
/**@type {esbuild.BuildOptions} */
export const esbuildOption = {
	entryPoints: ["src/main.ts"],
	bundle: true,
	outfile: "dist/main.js",
	platform: "node",
	target: "node20",
	format: "cjs",
	minify: false,
};
await esbuild.build(esbuildOption);
