// 主にJetstream本体サーバーとの通信
import EventEmitter from "node:events";
import { ZSTDDecoder } from "zstddec";

const decoder = new ZSTDDecoder();
decoder.init();
const em = new EventEmitter<{ a: ["hoge"] }>();
