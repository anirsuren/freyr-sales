export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
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

  // MARKET INTEL RUNS ITSELF (Anir, Aug 11: "I'm gonna close my laptop...
  // it has to just run by itself"). The refresh used to fire only from page
  // visits, so a quiet day meant a stale feed. The always-on server now
  // checks every half hour and runs the full cycle — company posts, news,
  // people, M&A, AI rundown and summaries — whenever the feed crosses the
  // twice-a-day staleness line. The database lock keeps multiple server
  // instances from ever refreshing twice, and the runner no-ops as "fresh"
  // between windows, so the ticks cost nothing.
  const REFRESH_CHECK_MS = 30 * 60 * 1000;
  let firstCheckLogged = false;
  const tick = async () => {
    try {
      const { runMarketIntelRefresh } = await import("@/lib/marketIntelRefresh");
      const result = await runMarketIntelRefresh();
      if (result.ran || !firstCheckLogged) {
        firstCheckLogged = true;
        console.log(
          `[market-intel] self-refresh check: ${JSON.stringify(result)}`
        );
      }
    } catch (error) {
      console.error("[market-intel] self-refresh failed:", error);
    }
  };
  setInterval(tick, REFRESH_CHECK_MS);
  setTimeout(tick, 90 * 1000);
  console.log(
    "[market-intel] self-refresh armed: staleness checked every 30 minutes"
  );
}
