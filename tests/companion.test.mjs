import { test } from "node:test";
import assert from "node:assert/strict";
import * as client from "../dist/companion.js";
test("companion refuses requests without a pairing token", async () => {
  client.disconnect();
  await assert.rejects(client.listJobs(), /Connect the companion first/);
});
test("companion rejects invalid endpoint IDs before sending any request", async () => {
  const fetchBefore = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, opts) => {
    calls++;
    assert.equal(url, "http://127.0.0.1:47831/v1/health");
    assert.equal(opts.headers.Authorization, "Bearer local-test");
    assert.equal(opts.redirect, "error");
    return new Response(JSON.stringify({ version: "0.1.0", engines: {} }));
  };
  try {
    await client.connect("local-test");
    await assert.rejects(
      client.getJob("../../secret"),
      /Invalid companion request/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = fetchBefore;
    client.disconnect();
  }
});
test("a failed pairing discards the token", async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "Bearer token required" }), {
      status: 401,
    });
  try {
    await assert.rejects(client.connect("bad-token"), /Bearer/);
    assert.equal(client.isConnected(), false);
  } finally {
    globalThis.fetch = old;
    client.disconnect();
  }
});
