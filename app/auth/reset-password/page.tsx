import { ResetPasswordScreen } from "./ResetPasswordScreen";

/**
 * A SERVER SHELL AROUND A CLIENT SCREEN, for one reason: the Supabase URL and
 * anon key must be read at REQUEST time. As a client page they were baked into
 * the browser bundle at build, and prod runs the image built for dev — so
 * after the databases split, this page would have reset passwords against the
 * wrong project. The server reads whatever THIS environment's env says and
 * hands it down.
 */
export default function ResetPasswordPage() {
  return (
    <ResetPasswordScreen
      supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? null}
      supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null}
    />
  );
}
