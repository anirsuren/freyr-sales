import { expect, test } from "@playwright/test";
import { sendEmail, sendTransactionalEmail } from "../lib/email";
import { setDataMode } from "../lib/dataMode";

test.describe.configure({ mode: "serial" });

test("workspace email remains simulated while mock data is active", async () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalFetch = globalThis.fetch;
  let requests = 0;
  process.env.RESEND_API_KEY = "test-resend-key";
  setDataMode("mock");
  globalThis.fetch = async () => {
    requests += 1;
    return new Response(null, { status: 200 });
  };

  try {
    const result = await sendEmail({
      to: "demo@example.com",
      subject: "Demo",
      body: "This must not leave a mock workspace.",
    });
    expect(result).toMatchObject({ ok: true, channel: "mock", skipped: true });
    expect(requests).toBe(0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  }
});

test("transactional invitation email uses the configured provider in mock mode", async () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalFetch = globalThis.fetch;
  const requests: Request[] = [];
  process.env.RESEND_API_KEY = "test-resend-key";
  setDataMode("mock");
  globalThis.fetch = async (input, init) => {
    requests.push(new Request(input, init));
    return new Response(null, { status: 200 });
  };

  try {
    const result = await sendTransactionalEmail({
      to: "invitee@example.com",
      subject: "Workspace invitation",
      body: "Open the invitation.",
    });
    expect(result).toMatchObject({ ok: true, channel: "resend" });
    const request = requests[0];
    expect(request).toBeDefined();
    expect(request.url).toBe("https://api.resend.com/emails");
    expect(request.headers.get("authorization")).toBe(
      "Bearer test-resend-key"
    );
    await expect(request.json()).resolves.toMatchObject({
      to: ["invitee@example.com"],
      subject: "Workspace invitation",
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  }
});
