/**
 * Module M3 – keeping a user's Resume LLM chats on the server.
 *
 * The page keeps { chats: [...], activeId } in localStorage; for a signed-in user a copy is also saved to
 * public.rllm_state. These helpers are pure so they can be tested without a browser or database:
 *   limitState(store)            what is sent to / kept by the server (recent, non-empty chats, size-capped)
 *   mergeStores(local, remote)   the union of two stores; for a chat in both, the newer one wins
 */

export const MAX_CHATS = 12;
export const MAX_STATE_BYTES = 1_500_000;

const hasContent = (c) => c && c.id && ((c.messages || []).length > 0 || c.resume);
const byNewest = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);

/** The store trimmed for saving: empty chats dropped, newest MAX_CHATS kept, oldest dropped further if still too big. */
export function limitState(store) {
  let chats = (store?.chats || []).filter(hasContent).sort(byNewest).slice(0, MAX_CHATS);
  const size = () => JSON.stringify(chats).length;
  while (chats.length > 1 && size() > MAX_STATE_BYTES) chats = chats.slice(0, -1);
  return { chats, activeId: chats.some((c) => c.id === store?.activeId) ? store.activeId : chats[0]?.id ?? null };
}

/** Both stores' chats together (newer copy of a shared chat wins), newest first; the local active chat stays active. */
export function mergeStores(local, remote) {
  const all = new Map();
  for (const c of [...(remote?.chats || []), ...(local?.chats || [])]) {
    if (!c?.id) continue;
    const have = all.get(c.id);
    if (!have || (c.updatedAt || 0) >= (have.updatedAt || 0)) all.set(c.id, c);
  }
  const chats = [...all.values()].sort(byNewest);
  const wanted = local?.activeId && all.has(local.activeId) ? local.activeId : null;
  return { chats, activeId: wanted ?? remote?.activeId ?? chats[0]?.id ?? null };
}

/** True when two stores hold the same chats at the same versions (so a save would change nothing). */
export function sameStore(a, b) {
  const key = (s) => (s?.chats || []).map((c) => `${c.id}:${c.updatedAt || 0}`).sort().join("|");
  return key(a) === key(b);
}
