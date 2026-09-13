-- Compare JSON in the request body, not a PostgREST URL filter. Large histories
-- otherwise exceed HTTP URL limits before the conditional update reaches SQL.
CREATE OR REPLACE FUNCTION public.save_agent_history_if_unchanged(
  p_id text, p_expected jsonb, p_catalog jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE changed integer;
BEGIN
  IF p_id NOT LIKE 'agent-conversations:%' THEN
    RAISE EXCEPTION 'Invalid conversation history key';
  END IF;
  UPDATE public.offering_catalog_state SET catalog = p_catalog
    WHERE id = p_id AND catalog = p_expected;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.save_agent_history_if_unchanged(text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_agent_history_if_unchanged(text,jsonb,jsonb) TO service_role;
