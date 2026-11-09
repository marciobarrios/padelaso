import assert from "node:assert/strict";
import { test } from "node:test";
import { Buffer } from "node:buffer";
import { AuthController } from "../src/auth/controller.ts";
import { parseIncomingLink, pendingPath } from "../src/auth/links.ts";
import { createSessionStorage } from "../src/auth/storage.ts";

const callback = "padelaso-dev://auth/callback?code=one-use-code";
const matchPath = "/matches/12345678-1234-1234-1234-123456789abc";
const session = (id = "original-google-user") => ({
  user: { id, identities: [{ provider: "google" }] },
  access_token: "access",
  refresh_token: "refresh",
});
function memory() {
  const values = new Map();
  return {
    values,
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
  };
}
function fixture(initial = null, storage = memory()) {
  let current = initial;
  let listener;
  const calls = [];
  const auth = {
    onAuthStateChange: (fn) => {
      listener = fn;
      return { data: { subscription: { unsubscribe() {} } } };
    },
    getSession: async () => ({ data: { session: current }, error: null }),
    getUser: async () => ({ data: { user: current?.user }, error: null }),
    signInWithOAuth: async (args) => {
      calls.push(["oauth", args]);
      await storage.setItem("auth-code-verifier", "verifier");
      return { data: { url: "https://provider.example/auth" }, error: null };
    },
    exchangeCodeForSession: async (code) => {
      calls.push(["exchange", code]);
      current = session();
      return { data: { session: current }, error: null };
    },
    signInWithIdToken: async (args) => {
      calls.push(["apple", args]);
      current = session("new-apple-user");
      return { data: { session: current }, error: null };
    },
    linkIdentity: async (args) => {
      calls.push(["link", args]);
      return { data: { session: current }, error: null };
    },
    signOut: async () => {
      calls.push(["signOut"]);
      current = null;
      listener?.("SIGNED_OUT", null);
      return { error: null };
    },
    startAutoRefresh: async () => {
      calls.push(["startRefresh"]);
    },
    stopAutoRefresh: async () => {
      calls.push(["stopRefresh"]);
    },
  };
  const native = {
    openBrowser: async () => ({ type: "success", url: callback }),
    appleCredential: async () => ({
      token: "apple-id-token",
      nonce: "raw-nonce",
    }),
  };
  const controller = new AuthController(
    { auth },
    storage,
    "auth",
    "padelaso-dev",
    native,
  );
  return {
    controller,
    auth,
    native,
    storage,
    calls,
    setSession: (value) => {
      current = value;
    },
    emit: (event) => listener?.(event, current),
  };
}
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test("links accept only environment-specific callbacks and allowlisted destinations", () => {
  assert.equal(
    parseIncomingLink(callback, "padelaso-dev").code,
    "one-use-code",
  );
  assert.deepEqual(
    parseIncomingLink(`padelaso-dev:/${matchPath}`, "padelaso-dev"),
    { kind: "destination", path: matchPath },
  );
  for (const raw of [
    callback.replace("dev", "test"),
    callback.replace("padelaso-dev", "https"),
    "padelaso-dev://evil/auth/callback?code=x",
    "padelaso-dev://user@auth/callback?code=x",
    "padelaso-dev://matches/../../settings",
    `padelaso-dev:/${matchPath}?next=//evil.com`,
  ]) {
    assert.equal(parseIncomingLink(raw, "padelaso-dev").kind, "ignore", raw);
  }
  for (const path of [
    "//evil.com",
    "/settings",
    "/matches/example",
    "/join/a",
    "/join/a%2Fbcd",
  ])
    assert.equal(pendingPath(path), null);
  assert.equal(pendingPath("/join/ABCD1234"), "/join/ABCD1234");
  for (const raw of [
    "padelaso-dev://auth/callback",
    `${callback}&code=another`,
    `${callback}#access_token=unsafe`,
    `${callback}&error=access_denied`,
  ])
    assert.equal(parseIncomingLink(raw, "padelaso-dev").failed, true);
});

test("large Unicode sessions survive process restart without a plaintext fallback", async () => {
  const raw = memory();
  const storage = createSessionStorage(raw);
  const value = JSON.stringify({
    token: "a".repeat(5000),
    name: "Marció 🎾".repeat(500),
  });
  await storage.setItem("session", value);
  assert.ok(
    [...raw.values.values()].every((part) => Buffer.byteLength(part) <= 1800),
  );
  assert.equal(await createSessionStorage(raw).getItem("session"), value);
  await storage.removeItem("session");
  assert.equal(raw.values.size, 0);
});

test("interrupted writes never restore a partial session; logout clears orphaned chunks", async () => {
  const raw = memory();
  const storage = createSessionStorage(raw);
  await storage.setItem("session", "old-token");
  const original = raw.setItem;
  raw.setItem = async (key, value) => {
    if (key.endsWith(".1")) throw new Error("Device locked");
    await original(key, value);
  };
  await assert.rejects(storage.setItem("session", "x".repeat(5000)));
  assert.equal(await createSessionStorage(raw).getItem("session"), null);
  await storage.removeItem("session");
  assert.equal(raw.values.size, 0);
});

test("storage serializes overlapping refresh reads and writes", async () => {
  const raw = memory();
  const storage = createSessionStorage(raw);
  const write = storage.setItem("session", "x".repeat(4000));
  const read = storage.getItem("session");
  await write;
  assert.equal(await read, "x".repeat(4000));
  await raw.removeItem("session.1");
  assert.equal(await storage.getItem("session"), null);
  assert.equal(raw.values.size, 0);
});

test("Google uses PKCE exchange and preserves the existing user ID", async () => {
  const f = fixture();
  await f.controller.start(null);
  await f.controller.signIn("google");
  assert.equal(
    f.controller.getSnapshot().session.user.id,
    "original-google-user",
  );
  assert.equal(f.calls[0][0], "oauth");
  assert.equal(
    f.calls[0][1].options.redirectTo,
    "padelaso-dev://auth/callback",
  );
  assert.equal(f.calls[0][1].options.skipBrowserRedirect, true);
  assert.equal(f.storage.values.has("auth.attempt"), false);
  assert.equal(f.storage.values.has("auth-code-verifier"), false);
});

test("native Apple exchanges ID token and raw nonce; explicit linking keeps the owner", async () => {
  const f = fixture(session());
  await f.controller.start(null);
  await f.controller.signIn("apple", true);
  assert.deepEqual(f.calls.find(([name]) => name === "link")[1], {
    provider: "apple",
    token: "apple-id-token",
    nonce: "raw-nonce",
  });
  assert.equal(
    f.controller.getSnapshot().session.user.id,
    "original-google-user",
  );
  assert.equal(
    f.calls.some(([name]) => name === "apple"),
    false,
  );
  const fresh = fixture();
  await fresh.controller.start(null);
  await fresh.controller.signIn("apple");
  assert.equal(
    fresh.controller.getSnapshot().session.user.id,
    "new-apple-user",
  );
});

test("private-relay linking failure retains the original session and explains recovery", async () => {
  const f = fixture(session());
  await f.controller.start(null);
  f.auth.linkIdentity = async () => ({
    data: {},
    error: { code: "identity_already_exists" },
  });
  await f.controller.signIn("apple", true);
  assert.equal(
    f.controller.getSnapshot().session.user.id,
    "original-google-user",
  );
  assert.match(f.controller.getSnapshot().message, /proveedor original/);
  assert.equal(
    f.calls.some(([name]) => name === "apple"),
    false,
  );
});

test("linking refuses an unexpected account returned by the provider", async () => {
  const f = fixture(session());
  await f.controller.start(null);
  f.auth.linkIdentity = async () => ({
    data: { session: session("other-user") },
    error: null,
  });
  await f.controller.signIn("apple", true);
  assert.equal(f.controller.getSnapshot().session, null);
  assert.equal(f.controller.getSnapshot().status, "signedOut");
});

test("duplicate warm callbacks exchange only once", async () => {
  const f = fixture();
  await f.controller.start(null);
  f.native.openBrowser = async () => {
    await Promise.all([
      f.controller.handleUrl(callback),
      f.controller.handleUrl(callback),
    ]);
    return { type: "success", url: callback };
  };
  await f.controller.signIn("google");
  assert.equal(f.calls.filter(([name]) => name === "exchange").length, 1);
});

test("cold-start callback uses the saved transaction and resumes the saved destination", async () => {
  const storage = memory();
  await storage.setItem(
    "auth.attempt",
    JSON.stringify({ owner: null, expires: Date.now() + 60_000 }),
  );
  await storage.setItem("auth.pending", matchPath);
  const f = fixture(null, storage);
  await f.controller.start(callback);
  assert.equal(f.controller.getSnapshot().status, "ready");
  assert.equal(f.controller.getSnapshot().pending, matchPath);
});

test("missing, expired and wrong-account callback transactions never exchange codes", async () => {
  for (const attempt of [
    null,
    { owner: null, expires: Date.now() - 1 },
    { owner: "different-user", expires: Date.now() + 60_000 },
  ]) {
    const f = fixture();
    if (attempt)
      await f.storage.setItem("auth.attempt", JSON.stringify(attempt));
    await f.controller.start(callback);
    assert.equal(
      f.calls.some(([name]) => name === "exchange"),
      false,
    );
    assert.equal(f.controller.getSnapshot().status, "signedOut");
    assert.ok(f.controller.getSnapshot().message);
  }
});

test("cancellation is recoverable and preserves a pending invite", async () => {
  const f = fixture();
  await f.controller.start("padelaso-dev://join/ABCD1234");
  f.native.openBrowser = async () => ({ type: "cancel" });
  await f.controller.signIn("google");
  assert.match(f.controller.getSnapshot().message, /cancelado/);
  assert.equal(f.controller.getSnapshot().pending, "/join/ABCD1234");
  assert.equal(f.controller.getSnapshot().busy, false);
  assert.equal(f.storage.values.has("auth-code-verifier"), false);
  f.native.openBrowser = async () => ({ type: "success", url: callback });
  await f.controller.signIn("google");
  assert.equal(f.controller.getSnapshot().status, "ready");
});

test("restored sessions require server verification; a network failure allows retry", async () => {
  const f = fixture(session());
  f.auth.getUser = async () => ({
    data: { user: null },
    error: { status: 503 },
  });
  await f.controller.start(null);
  assert.equal(f.controller.getSnapshot().status, "error");
  assert.equal(f.controller.getSnapshot().session, null);
  f.auth.getUser = async () => ({
    data: { user: session().user },
    error: null,
  });
  await f.controller.validate();
  assert.equal(f.controller.getSnapshot().status, "ready");
  assert.equal(f.controller.getSnapshot().message, null);
});

test("revoked sessions clear local state before exposing any authenticated route", async () => {
  const f = fixture(session());
  f.auth.getUser = async () => ({
    data: { user: null },
    error: { status: 401 },
  });
  await f.controller.start(null);
  assert.equal(f.controller.getSnapshot().session, null);
  assert.equal(f.controller.getSnapshot().status, "signedOut");
  assert.equal(f.storage.values.get("auth.signed-out"), "expired");
});

test("foreground refresh starts/stops with app state and can restore refreshed tokens", async () => {
  const f = fixture(session());
  await f.controller.start(null);
  f.setSession({ ...session(), access_token: "refreshed-token" });
  await f.controller.foreground(true);
  await f.controller.foreground(false);
  assert.equal(
    f.controller.getSnapshot().session.access_token,
    "refreshed-token",
  );
  assert.ok(f.calls.some(([name]) => name === "startRefresh"));
  assert.ok(f.calls.some(([name]) => name === "stopRefresh"));
});

test("sign-out immediately discards user context and pending links; late reads cannot restore it", async () => {
  const f = fixture(session());
  await f.controller.start(`padelaso-dev:/${matchPath}`);
  const gate = deferred();
  f.auth.getUser = () => gate.promise;
  const validation = f.controller.validate();
  await Promise.resolve();
  const previousRevision = f.controller.getSnapshot().revision;
  const signingOut = f.controller.signOut();
  assert.equal(f.controller.getSnapshot().session, null);
  assert.equal(f.controller.getSnapshot().pending, null);
  await signingOut;
  gate.resolve({ data: { user: session().user }, error: null });
  await validation;
  assert.equal(f.controller.getSnapshot().session, null);
  assert.ok(f.controller.getSnapshot().revision > previousRevision);
  f.auth.getUser = async () => ({
    data: { user: session("next-user").user },
    error: null,
  });
  f.setSession(session("next-user"));
  await f.controller.validate();
  assert.equal(f.controller.getSnapshot().session.user.id, "next-user");
  assert.equal(f.controller.getSnapshot().pending, null);
});

test("interrupted sign-out tombstone prevents restoring a previously saved session", async () => {
  const f = fixture(session());
  await f.storage.setItem("auth.signed-out", "1");
  await f.controller.start(null);
  assert.equal(f.controller.getSnapshot().status, "signedOut");
  assert.equal(f.controller.getSnapshot().session, null);
});

test("offline sign-out still removes credentials from persistent storage", async () => {
  const f = fixture(session());
  await f.controller.start(null);
  await f.storage.setItem("auth", "saved-session");
  f.auth.signOut = async () => ({ error: { status: 503 } });
  await f.controller.signOut();
  assert.equal(f.storage.values.has("auth"), false);
  assert.equal(f.controller.getSnapshot().session, null);
  assert.match(f.controller.getSnapshot().message, /revocación remota/);
});

test("a pending match survives session revocation and the following cold start", async () => {
  const f = fixture(session());
  f.auth.getUser = async () => ({
    data: { user: null },
    error: { status: 401 },
  });
  await f.controller.start(`padelaso-dev:/${matchPath}`);
  assert.equal(f.controller.getSnapshot().pending, matchPath);
  const restored = fixture(null, f.storage);
  await restored.controller.start(null);
  assert.equal(restored.controller.getSnapshot().pending, matchPath);
  await restored.controller.signIn("google");
  assert.equal(restored.controller.getSnapshot().status, "ready");
  assert.equal(restored.controller.getSnapshot().pending, matchPath);
});

test("two sign-in taps during validation launch only one provider transaction", async () => {
  const f = fixture();
  await f.controller.start(null);
  const gate = deferred();
  f.auth.getSession = () => gate.promise;
  const checking = f.controller.validate();
  f.native.openBrowser = async () => ({ type: "cancel" });
  const first = f.controller.signIn("google");
  const second = f.controller.signIn("google");
  gate.resolve({ data: { session: null }, error: null });
  await Promise.all([checking, first, second]);
  assert.equal(f.calls.filter(([name]) => name === "oauth").length, 1);
});

test("sign-out clears credentials even when remote revocation throws", async () => {
  const f = fixture(session());
  await f.controller.start(null);
  await f.storage.setItem("auth", "persisted-token");
  f.auth.signOut = async () => {
    throw new Error("Network offline");
  };
  await f.controller.signOut();
  assert.equal(f.storage.values.has("auth"), false);
  assert.equal(f.storage.values.get("auth.signed-out"), "1");
  assert.equal(f.controller.getSnapshot().status, "signedOut");
});

test("failure to securely clear a revoked session presents recovery instead of silently continuing", async () => {
  const f = fixture(session());
  f.auth.getUser = async () => ({
    data: { user: null },
    error: { status: 401 },
  });
  f.storage.setItem = async () => {
    throw new Error("Keychain unavailable");
  };
  await f.controller.start(null);
  assert.equal(f.controller.getSnapshot().status, "error");
  assert.equal(f.controller.getSnapshot().session, null);
  assert.match(f.controller.getSnapshot().message, /forma segura/);
});
