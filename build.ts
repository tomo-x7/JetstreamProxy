import { exec, execSync } from "node:child_process";
import fs from "node:fs";
import { Writable } from "node:stream";
import { promisify } from "node:util";
import * as esbuildLib from "esbuild";
import { inject } from "postject";
import { esbuildOption } from "./esbuild.js";
import packageJson from "./package.json" with { type: "json" };

// 定数定義
const NODE_VERSION = "22.19.0";
const VERSION = packageJson.version;
const LINUX_ARCH = ["x64", "arm64"] as const;
process.chdir(import.meta.dirname);

// メインプロセス
async function main() {
	// とりあえず一時フォルダを再作成
	fs.rmSync("tmp", { recursive: true, force: true });
	fs.mkdirSync("tmp", { recursive: true });
	// nodeが存在しないかfreshオプションがついてたら
	if (!fs.existsSync("node")||process.argv.includes("--fresh")) {
		// nodeをダウンロード
		fs.rmSync("node", { recursive: true, force: true });
		fs.mkdirSync("node",{ recursive: true });
		const promises = LINUX_ARCH.map((arch) =>
			downloadNode(nodeUrl(arch), `tmp/node-${arch}.tar.gz`, "linux", arch),
		);
		await Promise.all(promises).catch((e) => {
			fs.rmSync("node", { recursive: true, force: true });
			throw e;
		});
	}
	// 型チェック&ビルド&バンドル
	await esbuild();
	execSync("pnpm typecheck", { stdio: "inherit" });
	// SEA blobの生成
	execSync("node --experimental-sea-config sea-config.json", { stdio: "inherit" });
	const seaBlob = fs.readFileSync("tmp/jetstreamproxy.blob");

	fs.mkdirSync("dist", { recursive: true });
	// 各アーキテクチャ用にバイナリを生成
	for (const arch of LINUX_ARCH) {
		fs.copyFileSync(`node/${arch}/bin/node`, "tmp/jetstreamproxy");
		await inject("tmp/jetstreamproxy", "NODE_SEA_BLOB", seaBlob, {
			sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
		});
		execSync(`tar -caf dist/${genName(arch)}.tar.gz -C tmp jetstreamproxy`);
	}
	fs.rmSync("tmp", { recursive: true, force: true });
}

// Node.jsのダウンロードと展開
async function downloadNode(path: string, filename: string, platform: string, arch: string) {
	const writableStream = Writable.toWeb(fs.createWriteStream(filename));
	await fetch(path).then((res) => {
		if (!res.ok || res.body == null) throw new Error(`Fetch node.js(${arch}) failed: ${res.statusText}`);
		return res.body.pipeTo(writableStream);
	});
	await mkdirAsync(`node/${arch}`, { recursive: true });
	await execAsync(`tar -xzf ${filename} --strip-components=1 -C node/${arch}`);
}

// utils
const nodeUrl = (arch: string, platform = "linux") =>
	`https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${platform}-${arch}.tar.gz`;
const execAsync = promisify(exec);
const mkdirAsync = promisify(fs.mkdir);
const copyFileAsync = promisify(fs.copyFile);
const esbuild = () => esbuildLib.build({ ...esbuildOption, outfile: "tmp/out.js" });
const genName = (arch: string, platform = "linux") => `jetstreamproxy_${VERSION}_${NODE_VERSION}_${platform}_${arch}`;

main();
