/**@type {import ("esbuild").BuildOptions} */
export const esbuildOption = {
	entryPoints: ["src/main.ts"],
	bundle: true,
	outfile: "dist/main.js",
	platform: "node",
	target: "node20",
	format: "cjs",
	minify: false,
};
