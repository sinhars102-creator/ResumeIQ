import { test } from "node:test";
import assert from "node:assert/strict";
import { limitState, mergeStores, sameStore, MAX_CHATS } from "../src/rllmSync.js";

const chat = (id, updatedAt, extra = {}) => ({ id, updatedAt, messages: [{ id: "m", text: "hi" }], resume: null, ...extra });

test("limitState drops empty chats and keeps the newest MAX_CHATS", () => {
  const chats = [
    { id: "empty", updatedAt: 999, messages: [], resume: null },
    ...Array.from({ length: MAX_CHATS + 3 }, (_, i) => chat(`c${i}`, i)),
  ];
  const out = limitState({ chats, activeId: "c0" });
  assert.equal(out.chats.length, MAX_CHATS);
  assert.ok(!out.chats.some((c) => c.id === "empty"));
  assert.equal(out.chats[0].id, `c${MAX_CHATS + 2}`);
  assert.notEqual(out.activeId, "c0"); // that chat was among the oldest, so it was dropped
});

test("limitState keeps a chat that has a resume but no messages", () => {
  const out = limitState({ chats: [{ id: "r", updatedAt: 1, messages: [], resume: { name: "A" } }], activeId: "r" });
  assert.equal(out.chats.length, 1);
  assert.equal(out.activeId, "r");
});

test("limitState trims the oldest chats when the state is too big", () => {
  const big = "x".repeat(900_000);
  const out = limitState({ chats: [chat("new", 3, { blob: big }), chat("mid", 2, { blob: big }), chat("old", 1, { blob: big })] });
  assert.ok(out.chats.length < 3);
  assert.equal(out.chats[0].id, "new");
});

test("mergeStores: union, newer copy wins, local active chat kept", () => {
  const local = { chats: [chat("a", 10, { title: "local a" }), chat("b", 5)], activeId: "b" };
  const remote = { chats: [chat("a", 20, { title: "remote a" }), chat("c", 1)], activeId: "c" };
  const m = mergeStores(local, remote);
  assert.deepEqual(m.chats.map((c) => c.id), ["a", "b", "c"]);
  assert.equal(m.chats[0].title, "remote a");
  assert.equal(m.activeId, "b");
});

test("mergeStores: with nothing local the remote store is used, and an unknown local active falls back", () => {
  const remote = { chats: [chat("z", 7)], activeId: "z" };
  assert.equal(mergeStores({ chats: [], activeId: null }, remote).activeId, "z");
  assert.equal(mergeStores({ chats: [], activeId: "gone" }, remote).activeId, "z");
  assert.deepEqual(mergeStores(null, null), { chats: [], activeId: null });
});

test("sameStore compares chats by id and version", () => {
  const a = { chats: [chat("a", 1), chat("b", 2)] };
  assert.ok(sameStore(a, { chats: [chat("b", 2), chat("a", 1)] }));
  assert.ok(!sameStore(a, { chats: [chat("a", 1), chat("b", 3)] }));
});
