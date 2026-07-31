-- The main Agent workspace used to keep its conversation list only in browser
-- localStorage. That split one person's history by browser and hostname and
-- made older chats appear to vanish after the storage key became user-scoped.
-- Store the complete client conversation state on the already-private,
-- workspace/user-scoped preference row so every signed-in session sees it.

ALTER TABLE IF EXISTS public.agent_prefs
  ADD COLUMN IF NOT EXISTS conversation_state JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.agent_prefs.conversation_state IS
  'Private main-Agent conversation history for this verified workspace member.';
