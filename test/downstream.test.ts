import { describe, expect, test } from "vitest";
import { test as downstream } from "../src/downstream.js";
const { createFilter, filter } = downstream;
describe("filter", () => {
	const truecase = [
		[["app.bsky.feed.post"], "app.bsky.feed.post"],
		[["app.bsky.feed.post", "app.bsky.feed.repost"], "app.bsky.feed.post"],
		[["app.bsky.feed.*"], "app.bsky.feed.post"],
		[["app.bsky.*"], "app.bsky.feed.post"],
		[[], "app.bsky.feed.post"],
		[["com.example.post"], "com.example.post"],
		[["app.bsky.feed.*", "com.example.post"], "com.example.post"],
		[["com.example.*"], "com.example.post"],
		[[], "com.example.post"],
	] satisfies [string[], string][];
	const falsecase = [
		[["app.bsky.feed.repost"], "app.bsky.feed.post"],
		[["app.bsky.feed.repost"], "com.example.post"],
		[["app.bsky.feed.*"], "com.example.post"],
		[["app.*"], "com.example.post"],
		[["com.example.post"], "app.bsky.feed.post"],
		[["com.example.*"], "app.bsky.feed.post"],
		[["app.bsky.feed.post", "app.bsky.feed.repost"], "app.bsky.feed.like"],
	] satisfies [string[], string][];
	test.each(truecase)("wanted: [%s], collection: %s, to be true", (set, col) =>
		expect(filter(new Set<string>(set), col)).toBe(true),
	);
	test.each(falsecase)("wanted: [%s], collection: \"%s\", to be false", (set, col) =>
		expect(filter(new Set<string>(set), col)).toBe(false),
	);
});
