export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // NOTE: the assistant's key is deliberately NOT resolved here. Instrumentation
  // is compiled for the edge runtime as well as this one, and merely naming
  // lib/claude in that bundle drags the Anthropic SDK — and node:fs — into a
  // build that cannot have it, taking the whole server down with a 500. Every
  // call site hydrates the key on demand and memoises it, so the only thing
  // lost is a few milliseconds on the first question.
  //
  // The Market Intel self-refresh timer lives in lib/marketIntelCron.ts and is
  // armed from the Node-only health endpoint for the same reason.

  const { initializeLiveOfferings } = await import("@/lib/offerings");
  try {
    await initializeLiveOfferings();
  } catch (error) {
    console.error("Offering catalog initialization failed", error);
  }
}
