// @ts-check
import { exec } from "node:child_process";
import esbuild from "esbuild";
import { esbuildOption } from "./esbuild.config.mjs";

esbuild.build(esbuildOption).then(() => {
	exec("cp src/assets dist/ -r");
});
