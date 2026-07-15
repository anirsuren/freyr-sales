import { createHmac } from "crypto";
import { expect, test } from "@playwright/test";

const SECRET = "freyr-test-elevenlabs-secret";

function signature(body: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac("sha256", SECRET)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `t=${timestamp},v0=${digest}`;
}

test.describe.serial("ElevenLabs voice lifecycle", () => {
  const conversationId = `mock-voice-${Date.now()}`;
  const callSid = `CA${Date.now()}`;

  test("creates inbound context immediately", async ({ request }) => {
    const response = await request.post("/api/voice/webhooks/inbound", {
      data: {
        caller_id: "+1 (617) 424-9903",
        called_number: "+1 507 248 7204",
        agent_id: "mock-regulatory-agent",
        call_sid: callSid,
      },
    });
    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    expect(result.type).toBe("conversation_initiation_client_data");
    expect(result.dynamic_variables.contact_name).toBe("Dr. Priya Mehta");
    expect(result.dynamic_variables.company).toBe("BioNex Therapeutics");

    const records = await request.get("/api/voice/conversations");
    const data = await records.json();
    expect(data.conversations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ call_sid: callSid, status: "in_progress" }),
      ])
    );
  });

  test("accepts a signed analyzing payload", async ({ request }) => {
    const raw = JSON.stringify({
      type: "post_call_transcription",
      event_timestamp: Math.floor(Date.now() / 1000),
      data: {
        agent_id: "mock-regulatory-agent",
        agent_name: "Maya",
        conversation_id: conversationId,
        status: "processing",
        transcript: [
          { role: "agent", message: "Hi Priya, this is Maya from Freyr.", time_in_call_secs: 0 },
          { role: "user", message: "Hi Maya, yes, I have a minute.", time_in_call_secs: 4 },
        ],
        metadata: {
          start_time_unix_secs: Math.floor(Date.now() / 1000) - 30,
          call_duration_secs: 30,
          phone_call: {
            external_number: "+1 (617) 424-9903",
            direction: "inbound",
            call_sid: callSid,
          },
        },
        analysis: {},
        conversation_initiation_client_data: {
          dynamic_variables: {
            call_sid: callSid,
            call_direction: "inbound",
            contact_id: "cont-001",
            customer_id: "cust-001",
            contact_name: "Dr. Priya Mehta",
            company: "BioNex Therapeutics",
            category: "Regulatory Affairs",
          },
        },
      },
    });
    const response = await request.post("/api/voice/webhooks/elevenlabs", {
      data: raw,
      headers: {
        "content-type": "application/json",
        "elevenlabs-signature": signature(raw),
      },
    });
    expect(response.ok()).toBeTruthy();
    expect((await response.json()).status).toBe("analyzing");

    const records = await request.get("/api/voice/conversations");
    const data = await records.json();
    expect(data.conversations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conversation_id: conversationId,
          status: "analyzing",
          contact_name: "Dr. Priya Mehta",
        }),
      ])
    );
  });

  test("completes analysis, logs once, notifies, and renders transcript", async ({ request, page }) => {
    const payload = {
      type: "post_call_transcription",
      event_timestamp: Math.floor(Date.now() / 1000),
      data: {
        agent_id: "mock-regulatory-agent",
        agent_name: "Maya",
        conversation_id: conversationId,
        status: "done",
        has_audio: true,
        has_user_audio: true,
        has_response_audio: true,
        transcript: [
          { role: "agent", message: "Hi Priya, this is Maya from Freyr.", time_in_call_secs: 0 },
          { role: "user", message: "We need support for our filing next quarter.", time_in_call_secs: 5 },
          { role: "agent", message: "I will arrange a working session with the team.", time_in_call_secs: 11 },
        ],
        metadata: {
          start_time_unix_secs: Math.floor(Date.now() / 1000) - 46,
          call_duration_secs: 46,
          phone_call: {
            external_number: "+1 (617) 424-9903",
            direction: "inbound",
            call_sid: callSid,
          },
        },
        analysis: {
          call_successful: "success",
          transcript_summary: "Priya is interested in filing support and agreed to a working session.",
          data_collection_results: {
            outcome: { value: "interested" },
          },
        },
        conversation_initiation_client_data: {
          dynamic_variables: {
            call_sid: callSid,
            call_direction: "inbound",
            contact_id: "cont-001",
            customer_id: "cust-001",
            contact_name: "Dr. Priya Mehta",
            company: "BioNex Therapeutics",
            category: "Regulatory Affairs",
          },
        },
      },
    };
    const raw = JSON.stringify(payload);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await request.post("/api/voice/webhooks/elevenlabs", {
        data: raw,
        headers: {
          "content-type": "application/json",
          "elevenlabs-signature": signature(raw),
        },
      });
      expect(response.ok()).toBeTruthy();
      expect((await response.json()).status).toBe("completed");
    }

    const records = await request.get("/api/voice/conversations");
    const data = await records.json();
    const matching = data.conversations.filter(
      (item: { conversation_id: string }) => item.conversation_id === conversationId
    );
    expect(matching).toHaveLength(1);
    expect(matching[0]).toMatchObject({
      status: "completed",
      outcome: "interested",
      duration_secs: 46,
    });
    expect(matching[0].interaction_id).toBeTruthy();

    const notifications = await (await request.get("/api/notifications")).json();
    expect(notifications.notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "voice",
          href: `/voice/c/${conversationId}`,
        }),
      ])
    );

    await page.goto(`/voice/c/${conversationId}`);
    await expect(page.getByText("Analysis ready")).toBeVisible();
    await expect(page.getByText("We need support for our filing next quarter.")).toBeVisible();
    await expect(page.getByText(/Priya is interested in filing support/)).toBeVisible();
  });

  test("rejects a forged webhook", async ({ request }) => {
    const response = await request.post("/api/voice/webhooks/elevenlabs", {
      data: JSON.stringify({ type: "post_call_transcription", data: {} }),
      headers: {
        "content-type": "application/json",
        "elevenlabs-signature": "t=1,v0=bad",
      },
    });
    expect(response.status()).toBe(401);
  });
});
