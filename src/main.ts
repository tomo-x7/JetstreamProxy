import EventEmitter from "node:events";
import { DownstreamEventMap, UpstreamEventMap } from "./types.js";
import { createUpstream } from "./upstream.js";
import { config } from "./config.js";
import { createDownstream } from "./downstream.js";

const upstreamEmmitter = new EventEmitter<UpstreamEventMap>();
const downstreamEmmitter = new EventEmitter<DownstreamEventMap>();
const upstream = createUpstream(config,upstreamEmmitter);
const downstream = createDownstream(config,downstreamEmmitter);