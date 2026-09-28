/**
 * WHICH MESSAGES CAME IN FROM A PHONE.
 *
 * Messages written by the WhatsApp door carry `via: "whatsapp"` since Sep 28.
 * Exchanges from before that stamp are recognised by the door's own write
 * signature: appendAgentExchange (whose only caller is the WhatsApp webhook)
 * always stores the agent reply exactly 1ms after the user message, which the
 * web app never does, so inside a WhatsApp-channel conversation that pairing
 * identifies the phone-sent message.
 */
export function sentFromWhatsApp(
  message: { role: "user" | "agent"; ts: number; via?: "whatsapp" },
  next: { role: "user" | "agent"; ts: number } | undefined,
  conversationChannel: "web" | "whatsapp" | undefined
): boolean {
  if (message.role !== "user") return false;
  if (message.via === "whatsapp") return true;
  return conversationChannel === "whatsapp" && next?.role === "agent" && next.ts === message.ts + 1;
}
