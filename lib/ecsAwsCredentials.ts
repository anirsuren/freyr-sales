import "server-only";

/**
 * THE TASK ROLE, HANDED TO GOOGLE (Sep 26).
 *
 * Vertex on AWS uses Google's Workload Identity Federation: the app proves who
 * it is with its AWS role and Google swaps that for a Google token. Google's
 * auth library finds the AWS role two ways only: the three AWS_* environment
 * variables, or the EC2 metadata address (169.254.169.254). Both services run
 * on Fargate, which has no EC2 metadata for the task role; Fargate hands
 * credentials out at 169.254.170.2 through AWS_CONTAINER_CREDENTIALS_RELATIVE_URI,
 * an address the library does not know. So Vertex could never have signed in
 * on ECS, whatever the trust rule said.
 *
 * This bridge asks Fargate's endpoint for the task role's credentials, places
 * them in the environment where the library looks, and renews them ahead of
 * their expiry. It does nothing on a laptop (no ECS endpoint), nothing when
 * static AWS keys are already set, and nothing when Vertex is not configured.
 * A failure is logged and retried; it never stops the server.
 */

const REFRESH_AHEAD_MS = 5 * 60_000;
const MIN_REFRESH_MS = 60_000;
const MAX_REFRESH_MS = 55 * 60_000;
const RETRY_MS = 30_000;

type TaskCredentials = {
  AccessKeyId: string;
  SecretAccessKey: string;
  Token: string;
  Expiration?: string;
};

export function ecsCredentialsUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const full = env.AWS_CONTAINER_CREDENTIALS_FULL_URI?.trim();
  if (full) return full;
  const relative = env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI?.trim();
  return relative ? `http://169.254.170.2${relative}` : null;
}

/** When the next renewal should run, well before the credentials lapse. */
export function refreshDelayMs(expiration: string | undefined, now = Date.now()): number {
  const at = expiration ? Date.parse(expiration) : NaN;
  if (!Number.isFinite(at)) return MAX_REFRESH_MS;
  return Math.min(MAX_REFRESH_MS, Math.max(MIN_REFRESH_MS, at - now - REFRESH_AHEAD_MS));
}

export async function fetchTaskCredentials(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<TaskCredentials> {
  const headers: Record<string, string> = {};
  const token = process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN?.trim();
  if (token) headers.Authorization = token;
  const response = await fetchImpl(url, {
    headers,
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`ECS credentials endpoint answered ${response.status}`);
  const body = (await response.json()) as Partial<TaskCredentials>;
  if (!body.AccessKeyId || !body.SecretAccessKey || !body.Token) {
    throw new Error("ECS credentials endpoint returned an incomplete credential");
  }
  return body as TaskCredentials;
}

/** Put the task role where Google's auth library reads AWS credentials. */
export function applyTaskCredentials(creds: TaskCredentials, env: NodeJS.ProcessEnv = process.env) {
  env.AWS_ACCESS_KEY_ID = creds.AccessKeyId;
  env.AWS_SECRET_ACCESS_KEY = creds.SecretAccessKey;
  env.AWS_SESSION_TOKEN = creds.Token;
  if (!env.AWS_REGION && !env.AWS_DEFAULT_REGION) env.AWS_REGION = "us-east-1";
}

let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Start the bridge. Returns false when there is nothing to bridge (a laptop,
 * static keys, or no Vertex project), true when a renewal loop is running.
 */
export function armEcsAwsCredentialBridge(env: NodeJS.ProcessEnv = process.env): boolean {
  const url = ecsCredentialsUrl(env);
  if (!url) return false;
  if (!env.GOOGLE_CLOUD_PROJECT?.trim()) return false;
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) return false;
  if (timer) return true;
  let announced = false;
  const renew = async () => {
    let delay = RETRY_MS;
    try {
      const creds = await fetchTaskCredentials(url);
      applyTaskCredentials(creds, env);
      delay = refreshDelayMs(creds.Expiration);
      if (!announced) {
        announced = true;
        console.info(
          `[agent] AWS task role bridged for Vertex federation; renewing every ${Math.round(delay / 60_000)} min`
        );
      }
    } catch (error) {
      console.error(
        "[agent] could not read the ECS task credentials for Vertex:",
        error instanceof Error ? error.message : error
      );
    }
    timer = setTimeout(renew, delay);
    timer.unref?.();
  };
  timer = setTimeout(renew, 0);
  timer.unref?.();
  return true;
}
