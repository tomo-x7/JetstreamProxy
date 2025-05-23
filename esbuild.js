// @ts-check
import * as esbuild from "esbuild";

await esbuild.build({
	entryPoints: ["src/main.ts"],
	bundle: true,
	outfile: "tmp/out.js",
	platform: "node",
	target: "node20",
	format: "cjs",
	minify: false,
});
