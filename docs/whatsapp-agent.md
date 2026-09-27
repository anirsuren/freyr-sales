# WhatsApp: text your agent

Every member can text the Freyr agent from their own phone. One WhatsApp
business number serves the workspace; each person connects their phone to it
once, from Settings. From then on a text from that phone is answered by the
same agent the Agent page uses, as that person, with that person's
permissions, and the chat also shows up on their Agent page tagged as coming
from WhatsApp.

## How a person connects

1. Settings, then Profile, then WhatsApp, then "Connect my phone".
2. Freyr shows a six-digit code, good for 15 minutes.
3. From the phone they want to use, they text that code to the workspace's
   WhatsApp number (the "Open WhatsApp with the code" button does it in one tap).
4. The number the text came from is now theirs. The card flips to Connected
   on its own; "Disconnect" (red, confirmed) drops it.

Nobody types a phone number anywhere. A phone belongs to one person: if a
number is linked again from a different account, the newest link wins.

## What happens to a text

`app/api/whatsapp/webhook/route.ts` receives Meta's delivery, checks the
`X-Hub-Signature-256` HMAC against the app secret, answers 200 at once and
does the work afterwards (`after()`), because Meta retries anything slow.

`lib/whatsappAgent.ts` then:

- finds the member behind the sender's number (`lib/whatsappLink.ts`, stored
  on the member's profile row `member-profile:<workspace>:<user>` as
  `profile.whatsapp`);
- signs the same two cookies the sign-in route signs for that member
  (`freyr_session` + `freyr_access_v2`, from one `app_users` row) and POSTs the
  text to this same server's `/api/agent/converse` over loopback with
  `channel: "whatsapp"`. That is the ordinary agent: same tools, same
  read-only rule in Real mode, same provider order (Vertex, then Anthropic);
- converts the markdown answer to WhatsApp formatting (`lib/whatsapp.ts`
  `toWhatsAppText`: bold, bullets, tables to lines, relative links made
  absolute) and sends it back in chunks under 4096 characters;
- appends the exchange to the member's Agent history as a conversation with
  `channel: "whatsapp"` (`lib/agentConversationStore.ts`), continuing the last
  WhatsApp thread when the previous text was under six hours ago.

Unknown numbers get one "here is how to connect" reply per ten minutes. Non
text messages get "I can only read text here for now".

## Setting it up on Meta's side (once, an admin)

1. **Meta Business account** at business.facebook.com, then a **Meta app** at
   developers.facebook.com (type Business) with the **WhatsApp** product added.
2. **Phone number**: WhatsApp > API Setup. The test number Meta provides works
   for development (recipients must be added to its allowed list). For real
   use, add a company number that is not registered to a WhatsApp account
   already, and complete **business verification** (Business settings >
   Security centre); without it the number is capped at 250 conversations a
   day.
3. **Access token**: Business settings > Users > System users. Create a system
   user (admin), assign the WhatsApp app and the WhatsApp account to it, and
   generate a permanent token with `whatsapp_business_messaging` and
   `whatsapp_business_management`.
4. **App secret**: App settings > Basic > App secret.
5. **Webhook**: WhatsApp > Configuration > Webhook. Callback URL is
   `https://<app host>/api/whatsapp/webhook`, verify token is the value of
   `WHATSAPP_VERIFY_TOKEN`. Subscribe to the **messages** field. Meta calls
   the URL with a GET during save; the route answers the challenge only when
   the token matches.
6. **Message the number once** from a phone or the phone must have messaged
   the business first: WhatsApp only lets a business reply inside 24 hours of
   the person's last message, which is exactly the shape of this integration
   (the person always texts first).

Values go into the runtime secret store, never into chat:

| Key | What it is |
| --- | --- |
| `WHATSAPP_VERIFY_TOKEN` | Any long random string; pasted into the webhook form. |
| `WHATSAPP_APP_SECRET` | The Meta app secret. |
| `WHATSAPP_ACCESS_TOKEN` | The permanent system user token. |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID from API Setup (an id, not the number). |
| `WHATSAPP_BUSINESS_NUMBER` | The number itself, E.164, for display and wa.me links. |
| `APP_INTERNAL_ORIGIN` | Optional; where this server calls itself, defaults to `http://127.0.0.1:$PORT`. |

With only the first two set, the webhook and the link codes work and every
reply is written to the server log instead of sent, which is how the whole
path is exercised before Meta's side exists.

### Getting the keys into the cloud

The containers read secrets from one Secrets Manager JSON
(`freyr-sales/runtime`) through `secrets[]` entries on the task definition,
and the deploy pipeline inherits those entries from the live revision. A key
that is mapped but absent from the JSON stops the task from starting, so the
two halves go in order. `deploy/add-whatsapp-secrets.sh` does both and then
rolls the service:

```bash
WHATSAPP_VERIFY_TOKEN=... WHATSAPP_APP_SECRET=... WHATSAPP_ACCESS_TOKEN=... \
WHATSAPP_PHONE_NUMBER_ID=... WHATSAPP_BUSINESS_NUMBER=+1555... \
FREYR_DEPLOY_APPROVED=yes deploy/add-whatsapp-secrets.sh dev
```

Production is the same command with `FREYR_PROD_DEPLOY_APPROVED=yes` and
`prod`, on its own explicit yes. After the roll, save the webhook URL in the
Meta app (step 5 above); Meta's verification GET must hit the new revision.
The agent's actions need nothing extra in the cloud: they call the app's own
routes on `http://127.0.0.1:$PORT` inside the container (`PORT` is 8080 there).

## Trying it locally

```bash
node --env-file=.env.local scripts/qa/whatsapp-replay.mjs 15550100001 "How is GSK doing?"
```

Signs a Meta-shaped delivery with the local app secret and posts it to
localhost:3006. Text a pending code first to link the fake number, then ask a
question; the reply appears in the server log and the exchange in the
member's Agent history.

```bash
npm run test:whatsapp
```

Signature check, envelope parsing, code detection, markdown conversion,
chunking, and the Graph API call shape.

## Meta setup as of Sep 27, 2026

- Meta app **Freyr Sales**, app id 2569174366890174, business portfolio
  **Freyr Solutions** (id 2383815542365700, not yet verified).
- Test number **+1 (555) 178-7823**, phone number id **1300035583200477**,
  WhatsApp Business Account id **1116800737572522**. The test number sends
  to at most 5 verified recipient numbers; a real company number replaces it
  under Step 2 (Production setup) once the portfolio is verified.
- Tokens: the API Setup page issues a 24-hour token for trying things out; the
  permanent one comes from a System User on the Freyr Solutions portfolio
  (Business settings > Users > System users) with whatsapp_business_messaging
  and whatsapp_business_management.

## Meta setup as of Sep 27, 03:40 (dev is wired)

- System user **Freyr Sales Integration** (id 61594532863950, Employee) on the
  Freyr Solutions portfolio, assigned the Freyr Sales app (Manage app) and the
  Test WhatsApp Business Account (Everything). Its token never expires and has
  `whatsapp_business_messaging` + `whatsapp_business_management`.
- Where the token lives: the dev runtime secret (`freyr-sales/runtime`, key
  `WHATSAPP_ACCESS_TOKEN`, mapped on task definition freyr-sales:408) and, on
  Anir's Mac, `.env.local` as `WHATSAPP_ACCESS_TOKEN_REAL`. The LOCAL server
  deliberately has no `WHATSAPP_ACCESS_TOKEN`, so it stays in trace mode: the
  QA fake numbers (15550100001-4) cannot receive a real send, and a failed
  send means nothing is stored (see below). Rename the key locally only for a
  deliberate real-send check (`scripts/qa/whatsapp-say-app.mts`).
- Webhook: callback `https://freyrsales.dev.freyrapps.com/api/whatsapp/webhook`
  verified and saved (Use cases > Customize > Step 2 > Configure Webhooks);
  the `messages` field must be Subscribed there.
- Known behaviour: with an invalid or expired token the inbound leg goes
  silent. `handleInboundWhatsApp` stores the exchange only after a delivered
  send, so the person sees nothing on the phone and nothing in the web
  history. Anir to decide whether an undelivered reply should still be kept
  in history and surfaced on /api/health.
- Still Anir's: business verification of Freyr Solutions, a real company
  number (the test number can only reach verified test recipients), and
  publishing the app (Meta warns unpublished apps only receive test webhooks
  from the dashboard; the test number's inbound is checked empirically).

### The step the dashboard does not do: subscribe the app to the WABA

Verifying the callback and ticking `messages` only registers the app's
webhook. Inbound texts are routed per WhatsApp Business Account, and on
Sep 27 the test WABA was subscribed only to Meta's own dashboard app, so
Anir's texts never arrived (Meta's "Test" button still succeeded, because
that goes straight to the callback). One call with the system-user token
fixes it, and it is needed again for any new WABA (the real company number):

    curl -X POST "https://graph.facebook.com/v22.0/<WABA_ID>/subscribed_apps" \
         -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN"
    curl "https://graph.facebook.com/v22.0/<WABA_ID>/subscribed_apps?access_token=$WHATSAPP_ACCESS_TOKEN"

The second call must list "Freyr Sales" (app 2569174366890174).
