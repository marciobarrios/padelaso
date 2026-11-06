import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

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

test("Watch target follows the phone signing team and bundle namespace", async () => {
  const require = createRequire(import.meta.url);
  const targetConfig = require("../targets/watch/expo-target.config.js");
  for (const environment of ["development", "test"]) {
    await withEnvironment({ EXPO_PUBLIC_APP_ENV: environment, APPLE_TEAM_ID: "TESTTEAM01", IOS_BUILD_NUMBER: "7" }, async () => {
      const config = (await import(`../app.config.ts?watch-${environment}`)).default;
      const target = targetConfig(config);
      assert.equal(config.ios.appleTeamId, "TESTTEAM01");
      assert.equal(config.ios.buildNumber, "7");
      assert.equal(target.appleTeamId, "TESTTEAM01");
      assert.equal(target.bundleIdentifier, ".watch");
      assert.equal(target.type, "watch");
    });
  }
});
