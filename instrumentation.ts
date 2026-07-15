export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { initializeLiveOfferings } = await import("@/lib/offerings");
  try {
    await initializeLiveOfferings();
  } catch (error) {
    console.error("Offering catalog initialization failed", error);
  }
}
