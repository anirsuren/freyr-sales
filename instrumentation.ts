export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // The remembered mode FIRST: everything below reads it, and a deploy must
  // not silently drop production back into the demo catalogue.
  try {
    const { hydrateDataMode } = await import("@/lib/dataMode");
    await hydrateDataMode();
  } catch (error) {
    console.error("Data mode hydration failed", error);
  }
  // NOTE: the assistant's key is deliberately NOT resolved here. Instrumentation
  // is compiled for the edge runtime as well as this one, and merely naming
  // lib/claude in that bundle drags the Anthropic SDK — and node:fs — into a
  // build that cannot have it, taking the whole server down with a 500. Every
  // call site hydrates the key on demand and memoises it, so the only thing
  // lost is a few milliseconds on the first question.

  const { initializeLiveOfferings } = await import("@/lib/offerings");
  try {
    await initializeLiveOfferings();
  } catch (error) {
    console.error("Offering catalog initialization failed", error);
  }
}
