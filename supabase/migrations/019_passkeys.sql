-- PASSKEYS (WebAuthn). A second way in that needs no password: Touch ID, Face
-- ID or a security key (Anir, Aug 7: "set up the passkey, I hate logging in, I
-- want to be able to use Touch ID").
--
-- Credentials are PUBLIC keys. Nothing here can be replayed to impersonate
-- anyone: the private half never leaves the device's secure enclave, and every
-- sign-in is a fresh signature over a server-issued challenge.
--
-- Keyed on the SUPABASE AUTH user id, which is what the app's session cookie
-- carries, so a passkey and a password sign-in mint the identical session.

CREATE TABLE IF NOT EXISTS public.webauthn_credentials (
  id TEXT PRIMARY KEY,                     -- base64url credential id
  auth_user_id UUID NOT NULL,
  email TEXT NOT NULL,
  public_key TEXT NOT NULL,                -- base64url COSE public key
  counter BIGINT NOT NULL DEFAULT 0,       -- signature counter, replay defence
  transports TEXT[],                       -- internal / hybrid / usb …
  device_label TEXT,                       -- "MacBook Touch ID"
  rp_id TEXT NOT NULL,                     -- passkeys are bound to one origin
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS webauthn_credentials_user_idx
  ON public.webauthn_credentials (auth_user_id);
CREATE INDEX IF NOT EXISTS webauthn_credentials_email_idx
  ON public.webauthn_credentials (lower(email));

-- Challenges are single-use and short-lived. Kept server-side so a client
-- cannot choose its own, which is the whole point of the ceremony.
CREATE TABLE IF NOT EXISTS public.webauthn_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('register', 'login')),
  auth_user_id UUID,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS webauthn_challenges_challenge_idx
  ON public.webauthn_challenges (challenge);

-- Both tables are reached only through the service role in server routes; no
-- browser ever queries them directly.
ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;
