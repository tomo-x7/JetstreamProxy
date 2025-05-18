// 主にProxyに接続しているクライアントとの通信
import type { EventEmitter } from "node:events";
import { type WebSocket, WebSocketServer } from "ws";
import type { Config } from "./types.js";
import type { DownstreamEventMap } from "./types.js";
import { randomUUID } from "node:crypto";

export function createDownstream(config: Config, eventEmitter: EventEmitter<DownstreamEventMap>) {}
