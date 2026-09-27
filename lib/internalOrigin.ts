/**
 * WHERE THIS SERVER ANSWERS ITSELF. The agent takes actions and the WhatsApp
 * bridge asks questions by calling this same app's routes over loopback, so
 * every permission check is the route's own. `PORT` is what Next binds to
 * (8080 in the container, the -p flag locally); APP_INTERNAL_ORIGIN overrides
 * it for anything unusual.
 */
export function internalAppOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.APP_INTERNAL_ORIGIN?.trim() || env.WHATSAPP_INTERNAL_ORIGIN?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return `http://127.0.0.1:${env.PORT || "3000"}`;
}
