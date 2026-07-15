# Voice agent integration

Freyr treats an ElevenLabs phone call as a lifecycle, not a single completed
record. The app creates a row as soon as the phone provider identifies the
call, preserves partial data while ElevenLabs processes it, and makes the
transcript and analysis available when the post-call webhook completes.

## Lifecycle

1. `initiated`: an outbound dial was accepted by ElevenLabs.
2. `in_progress`: an inbound or outbound call is live.
3. `analyzing`: the call ended and ElevenLabs reports `processing`.
4. `completed`: analysis, transcript, outcome, duration, and summary are ready.
5. `failed`: initiation or analysis failed; the reason remains visible.

Completed calls create one CRM interaction and one notification. The
interaction ID is deterministic, so a retried webhook cannot duplicate it.

## Required configuration

Apply `supabase/migrations/005_voice_conversations.sql`, then set:

```text
ELEVENLABS_API_KEY=
ELEVENLABS_PHONE_NUMBER_ID=
ELEVENLABS_WEBHOOK_SECRET=
ELEVENLABS_INBOUND_WEBHOOK_SECRET=
FREYR_VOICE_NUMBER=
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

In ElevenLabs, add a workspace post-call webhook at:

```text
https://<freyr-host>/api/voice/webhooks/elevenlabs
```

Enable transcription and call-initiation-failure events. Store the generated
HMAC secret as `ELEVENLABS_WEBHOOK_SECRET`.

For each imported Twilio number, set its inbound personalization webhook to:

```text
https://<freyr-host>/api/voice/webhooks/inbound
```

Add the custom header `x-freyr-voice-secret` with the value stored in
`ELEVENLABS_INBOUND_WEBHOOK_SECRET`. The endpoint immediately returns the
matched contact, company, title, recent CRM topics, offering category, and
opening line as conversation dynamic variables.

## Verification

The integration suite uses a current ElevenLabs-shaped payload, signs it with
the same HMAC scheme as production, retries the completion webhook, and checks
the inbound match, analyzing state, final transcript, CRM interaction,
notification, and forged-signature rejection.

```bash
AGENT_FORCE_MOCK=1 NEXT_DIST_DIR=.next-voice-test \
  npx playwright test tests/voice-integration.spec.ts
```

This validates Freyr without placing a billable call. A live acceptance test
still requires a connected phone number, the production secrets, and the
Supabase migration above.
