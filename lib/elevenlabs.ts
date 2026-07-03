// Thin ElevenLabs Conversational-AI client — only what the platform needs.
// Agents themselves are created by the setup script (see lib/voiceAgents.json);
// at runtime we only place outbound calls once a phone number is connected.

const API_BASE = "https://api.elevenlabs.io/v1";

export async function outboundCall(
  agentId: string,
  agentPhoneNumberId: string,
  toNumber: string
): Promise<boolean> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch(`${API_BASE}/convai/twilio/outbound-call`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: agentId,
        agent_phone_number_id: agentPhoneNumberId,
        to_number: toNumber,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
