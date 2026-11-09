export interface AuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// SecureStore has platform-dependent value limits. Every chunk is ASCII and
// under 2 KiB, including for large provider metadata and non-ASCII names.
const chunkSize = 1800;
const maxChunks = 64;

export function createSessionStorage(store: AuthStorage): AuthStorage {
  // Serialize reads/writes too: callers outside Supabase also use this adapter.
  let tail: Promise<unknown> = Promise.resolve();
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation);
    tail = result.catch(() => undefined);
    return result;
  }
  async function remove(key: string) {
    // Invalidate first. A terminated/failed write can never restore half a token.
    await store.removeItem(key);
    for (let i = 0; i < maxChunks; i++) await store.removeItem(`${key}.${i}`);
  }
  return {
    getItem: (key) =>
      serial(async () => {
        const manifest = await store.getItem(key);
        if (!manifest) return null;
        const count = Number(manifest);
        if (!Number.isInteger(count) || count < 1 || count > maxChunks) {
          await remove(key);
          return null;
        }
        let encoded = "";
        for (let i = 0; i < count; i++) {
          const chunk = await store.getItem(`${key}.${i}`);
          if (chunk === null) {
            await remove(key);
            return null;
          }
          encoded += chunk;
        }
        try {
          return decodeURIComponent(encoded);
        } catch {
          await remove(key);
          return null;
        }
      }),
    setItem: (key, value) =>
      serial(async () => {
        const encoded = encodeURIComponent(value);
        const count = Math.max(1, Math.ceil(encoded.length / chunkSize));
        if (count > maxChunks)
          throw new Error("Session storage capacity exceeded");
        await remove(key);
        for (let i = 0; i < count; i++) {
          await store.setItem(
            `${key}.${i}`,
            encoded.slice(i * chunkSize, (i + 1) * chunkSize),
          );
        }
        // Commit last. Interrupted writes require signing in again, never plaintext fallback.
        await store.setItem(key, String(count));
      }),
    removeItem: (key) => serial(() => remove(key)),
  };
}
