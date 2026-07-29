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
  const { initializeLiveOfferings } = await import("@/lib/offerings");
  try {
    await initializeLiveOfferings();
  } catch (error) {
    console.error("Offering catalog initialization failed", error);
  }
}
