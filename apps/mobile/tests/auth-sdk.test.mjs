import assert from "node:assert/strict";
import { test } from "node:test";
import { Buffer } from "node:buffer";
import { webcrypto, createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { installAuthCrypto } from "../src/auth/crypto.ts";
import { createSessionStorage } from "../src/auth/storage.ts";

test("the pinned Supabase SDK generates S256 PKCE using the native crypto bridge", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const native = {
    getRandomValues: (array) => webcrypto.getRandomValues(array),
    randomUUID,
    digest: (algorithm, data) => webcrypto.subtle.digest(algorithm, data),
  };
  Object.defineProperty(globalThis, "crypto", {
    value: undefined,
    configurable: true,
  });
  try {
    installAuthCrypto(globalThis, native);
    const values = new Map();
    const client = createClient(
      "https://example.supabase.co",
      "sb_publishable_test",
      {
        auth: {
          flowType: "pkce",
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: "contract",
          storage: {
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, value),
            removeItem: (key) => values.delete(key),
          },
        },
      },
    );
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        skipBrowserRedirect: true,
        redirectTo: "padelaso-dev://auth/callback",
      },
    });
    assert.equal(error, null);
    const url = new URL(data.url);
    assert.equal(url.searchParams.get("code_challenge_method"), "s256");
    const verifier = JSON.parse(values.get("contract-code-verifier"));
    assert.ok(verifier.length >= 43);
    assert.equal(
      url.searchParams.get("code_challenge"),
      createHash("sha256").update(verifier).digest("base64url"),
    );
    assert.notEqual(url.searchParams.get("code_challenge"), verifier);
    assert.equal(
      url.searchParams.get("redirect_to"),
      "padelaso-dev://auth/callback",
    );
    assert.equal(
      Buffer.from(
        await globalThis.crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode("abc"),
        ),
      ).toString("hex"),
      createHash("sha256").update("abc").digest("hex"),
    );
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
    else delete globalThis.crypto;
  }
});

test("the pinned SDK restores its session from chunked storage in a new client instance", async () => {
  const values = new Map();
  const raw = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
  };
  const user = {
    id: "existing-user",
    aud: "authenticated",
    created_at: "2026-11-09T00:00:00Z",
    user_metadata: { name: "Marció 🎾".repeat(300) },
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = [
    "header",
    Buffer.from(JSON.stringify({ exp, sub: user.id })).toString("base64url"),
    "signature",
  ].join(".");
  const makeClient = () =>
    createClient("https://example.supabase.co", "sb_publishable_test", {
      auth: {
        storageKey: "restart-contract",
        storage: createSessionStorage(raw),
        autoRefreshToken: false,
        persistSession: true,
        detectSessionInUrl: false,
      },
      global: {
        fetch: async () =>
          new Response(
            JSON.stringify({
              access_token: accessToken,
              refresh_token: "refresh-token",
              token_type: "bearer",
              expires_in: 3600,
              user,
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
      },
    });
  const original = makeClient();
  const result = await original.auth.signInWithIdToken({
    provider: "apple",
    token: "provider-token",
    nonce: "nonce",
  });
  assert.equal(result.error, null);
  const restarted = makeClient();
  const restored = await restarted.auth.getSession();
  assert.equal(restored.error, null);
  assert.equal(restored.data.session.user.id, "existing-user");
  assert.equal(restored.data.session.refresh_token, "refresh-token");
  assert.equal(
    restored.data.session.user.user_metadata.name,
    user.user_metadata.name,
  );
});
