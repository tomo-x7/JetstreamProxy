import { join, normalize } from "node:path";
import { exit } from "node:process";
import { CliError, parseCliArgs, USAGE } from "./cli.js";
import type { Config } from "./types.js";

function loadConfig(): Config {
	try {
		const config = parseCliArgs(process.argv.slice(2), join(__dirname, "log.txt"));
		if (config === "help") {
			console.log(USAGE);
			exit(0);
		}
		return { ...config, logFile: normalize(config.logFile) };
	} catch (e) {
		if (!(e instanceof CliError)) throw e;
		console.error(`${e.message}\n\n${USAGE}`);
		exit(1);
	}
}

export const config: Config = loadConfig();
