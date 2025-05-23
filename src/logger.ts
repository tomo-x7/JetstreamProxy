import { createWriteStream } from "node:fs";
import { exit } from "node:process";
import asciify from "asciify";
import { config } from "./config.js";

const logstream = createWriteStream(config.logFile, { flags: "a" });
function writeLog(log: string) {
	logstream.write(`${log}\n`);
}

asciify("Jetstream Proxy", { font: "slant" }, (err, str) => {
	logstream.write(`\n${str}\n`);
	logstream.write(`Started at ${new Date().toLocaleString()}\n`);
});
interface logger {
	error: (message: string) => void;
	warn: (message: string) => void;
	info: (message: string) => void;
	logConnect: (id: string, isAll: boolean, wanted: Set<string>) => void;
	logDisconnect: (id: string) => void;
	upstreamUpdate: (collection: Set<string> | "all") => void;
}
export const logger: logger = {
	error: (message) => {
		console.error(`${red}${message}${reset}`);
		writeLog(`ERROR: ${message}`);
	},
	warn: (message) => {
		console.warn(`${yellow}${message}${reset}`);
		writeLog(`WARN: ${message}`);
	},
	info(message) {
		console.info(message);
		writeLog(`INFO: ${message}`);
	},
	logConnect: (id, isAll, wanted) => {
		const str = isAll
			? `INFO: Client ${id} connected: all mode`
			: `INFO: Client ${id} connected: subscribed to [${Array.from(wanted).join(", ")}]`;
		console.log(str);
		writeLog(str);
	},
	logDisconnect: (id) => {
		const str = `INFO: Client ${id} disconnected`;
		console.log(str);
		writeLog(str);
	},
	upstreamUpdate(collection) {
		const str =
			collection === "all"
				? "INFO: Upstream connected with all collections"
				: `INFO: Upstream updated collections: [${Array.from(collection).join(", ")}]`;
		console.log(str);
		writeLog(str);
	},
};

const red = "\u001b[31m";
const yellow = "\u001b[33m";

const reset = "\u001b[0m";

function cleanUp() {
	if (!logstream.writableEnded) logstream.end("proxy shutdown...");
}
process.addListener("exit", cleanUp);
process.addListener("SIGTERM", () => exit(0));
process.addListener("SIGINT", () => exit(0));
process.addListener("SIGHUP", () => exit(0));
process.addListener("SIGBREAK", () => exit(0));
