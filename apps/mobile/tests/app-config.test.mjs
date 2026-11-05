import assert from "node:assert/strict";
import { test } from "node:test";

async function withEnvironment(values, operation) {
  const previous = Object.fromEntries(
    Object.keys(values).map((name) => [name, process.env[name]]),
  );
  try {
    for (const [name, value] of Object.entries(values))
      process.env[name] = value;
    await operation();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("development and test clients can coexist on the same device", async () => {
  let development;
  await withEnvironment({ EXPO_PUBLIC_APP_ENV: "development" }, async () => {
    development = (await import("../app.config.ts?development")).default;
  });
  await withEnvironment({ EXPO_PUBLIC_APP_ENV: "test" }, async () => {
    const testing = (await import("../app.config.ts?testing")).default;
    assert.notEqual(
      development.ios.bundleIdentifier,
      testing.ios.bundleIdentifier,
    );
    assert.notEqual(development.android.package, testing.android.package);
    assert.notEqual(development.scheme, testing.scheme);
  });
});

test("build config blocks privileged keys without including the value in its error", async () => {
  const secret = "sb_secret_do_not_ship_or_log";
  await withEnvironment(
    { EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret },
    async () => {
      await assert.rejects(import("../app.config.ts?secret"), (error) => {
        assert.match(error.message, /publishable client key/);
        assert.equal(error.message.includes(secret), false);
        return true;
      });
    },
  );
});

test("build config blocks unexpected public variables", async () => {
  await withEnvironment(
    { EXPO_PUBLIC_PRIVATE_TOKEN: "do-not-ship" },
    async () => {
      await assert.rejects(
        import("../app.config.ts?unexpected"),
        /Unrecognized public mobile setting/,
      );
    },
  );
});
