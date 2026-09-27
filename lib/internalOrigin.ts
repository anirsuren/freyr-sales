/**
 * WHERE THE APP CAN REACH ITSELF. The WhatsApp bridge and the action runner
 * call the app's own routes over HTTP as the person, so the request carries
 * their cookies and every permission check is the route's. Both need the
 * origin the server is actually listening on, which is not always loopback.
 *
 * Next's standalone server binds to HOSTNAME when that is set, and inside an
 * ECS task the runtime sets HOSTNAME to the task's own hostname, so the server
 * listens on the task's address and 127.0.0.1 is refused (Sep 27, dev:
 * "connect ECONNREFUSED 127.0.0.1:3000" on every WhatsApp message). So: an
 * explicit origin wins, then the same HOSTNAME rule the server uses, then
 * loopback for a plain `next dev`.
 */
export function internalAppOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.APP_INTERNAL_ORIGIN?.trim() || env.WHATSAPP_INTERNAL_ORIGIN?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const port = env.PORT || "3000";
  const bound = (env.HOSTNAME || "").trim();
  const wildcard = !bound || bound === "0.0.0.0" || bound === "::" || bound === "localhost";
  return `http://${wildcard ? "127.0.0.1" : bound}:${port}`;
}
