type CryptoBridge = {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
  randomUUID(): string;
  digest(algorithm: string, data: BufferSource): Promise<ArrayBuffer>;
};

/** Supply the WebCrypto subset used by auth-js; never its Math.random/plain PKCE fallback. */
export function installAuthCrypto(target: object, native: CryptoBridge) {
  const host = target as {
    crypto?: {
      getRandomValues?: unknown;
      randomUUID?: unknown;
      subtle?: { digest?: unknown };
    };
  };
  if (!host.crypto)
    Object.defineProperty(host, "crypto", { value: {}, configurable: true });
  const crypto = host.crypto!;
  if (!crypto.getRandomValues) crypto.getRandomValues = native.getRandomValues;
  if (!crypto.randomUUID) crypto.randomUUID = native.randomUUID;
  if (!crypto.subtle) crypto.subtle = {};
  if (!crypto.subtle.digest)
    crypto.subtle.digest = (
      algorithm: string | { name: string },
      data: BufferSource,
    ) => {
      const name = typeof algorithm === "string" ? algorithm : algorithm.name;
      if (name !== "SHA-256") throw new Error("Unsupported auth digest");
      return native.digest(name, data);
    };
}
