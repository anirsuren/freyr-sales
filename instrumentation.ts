export async function register() {
  // Keep Node-only dependencies out of the edge instrumentation bundle.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./instrumentation-node");
    await registerNode();
  }
}
