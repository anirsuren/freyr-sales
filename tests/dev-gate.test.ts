import assert from "node:assert/strict";
import test from "node:test";
import { isLoginAllowedHere } from "../lib/devGate";

function withDevGateEnv(
  values: { origin: string; allowlist?: string },
  run: () => void
) {
  const before = {
    origin: process.env.AUTH_PUBLIC_ORIGIN,
    appUrl: process.env.APP_PUBLIC_URL,
    allowlist: process.env.DEV_LOGIN_ALLOWLIST,
  };
  process.env.AUTH_PUBLIC_ORIGIN = values.origin;
  delete process.env.APP_PUBLIC_URL;
  if (values.allowlist === undefined) delete process.env.DEV_LOGIN_ALLOWLIST;
  else process.env.DEV_LOGIN_ALLOWLIST = values.allowlist;
  try {
    run();
  } finally {
    if (before.origin === undefined) delete process.env.AUTH_PUBLIC_ORIGIN;
    else process.env.AUTH_PUBLIC_ORIGIN = before.origin;
    if (before.appUrl === undefined) delete process.env.APP_PUBLIC_URL;
    else process.env.APP_PUBLIC_URL = before.appUrl;
    if (before.allowlist === undefined) delete process.env.DEV_LOGIN_ALLOWLIST;
    else process.env.DEV_LOGIN_ALLOWLIST = before.allowlist;
  }
}

test("every default dev admin can use plus aliases for role-review accounts", () => {
  withDevGateEnv({ origin: "https://freyrsales.dev.freyrapps.com" }, () => {
    assert.equal(
      isLoginAllowedHere("manojkumar.odela+2@freyrsolutions.com"),
      true
    );
    assert.equal(
      isLoginAllowedHere("manojkumar.odela+solutioning-owner@freyrsolutions.com"),
      true
    );
    assert.equal(isLoginAllowedHere("anir.s+bd-owner@freyrsolutions.com"), true);
    assert.equal(isLoginAllowedHere("suren+bd-member@freyrsolutions.com"), true);
    assert.equal(isLoginAllowedHere("saras.verma+sol-member@freyrsolutions.com"), true);
    assert.equal(isLoginAllowedHere("sameer.siddiqui+review@freyrsolutions.com"), true);
    assert.equal(isLoginAllowedHere("someone+2@freyrsolutions.com"), false);
  });
});

test("an explicit dev roster gives every included admin test aliases", () => {
  withDevGateEnv(
    {
      origin: "https://freyrsales.dev.freyrapps.com",
      allowlist: "manojkumar.odela@freyrsolutions.com,saras.verma@freyrsolutions.com",
    },
    () => {
      assert.equal(
        isLoginAllowedHere("manojkumar.odela+4@freyrsolutions.com"),
        true
      );
      assert.equal(
        isLoginAllowedHere("saras.verma+solutioning@freyrsolutions.com"),
        true
      );
      assert.equal(isLoginAllowedHere("anir.s+4@freyrsolutions.com"), false);
    }
  );
});

test("the dev roster never restricts production", () => {
  withDevGateEnv(
    {
      origin: "https://freyrsales.freyrapps.com",
      allowlist: "manojkumar.odela@freyrsolutions.com",
    },
    () => {
      assert.equal(isLoginAllowedHere("anyone@example.com"), true);
    }
  );
});
