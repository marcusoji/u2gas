import { env } from "./env";

/**
 * Minimal Supabase auth client.
 *
 * The Worker only needs the access token (`Authorization: Bearer …`) and reads
 * the role from the database, so the app does not need the full supabase-js
 * runtime — a small GoTrue client keeps `web/` dependency-free and therefore a
 * true carbon copy of the uploaded frontend. Password auth, refresh and session
 * persistence are all it takes to sign in.
 */

const STORAGE_KEY = "u2gas_session_v1";

export interface AuthUser {
  id: string;
  email: string | null;
  email_confirmed_at?: string | null;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  /** Epoch milliseconds at which `access_token` stops being valid. */
  expires_at: number;
  user: AuthUser;
}

type Listener = (session: AuthSession | null) => void;

const listeners = new Set<Listener>();
let current: AuthSession | null = null;
let refreshInFlight: Promise<AuthSession | null> | null = null;

function authUrl(path: string): string {
  return `${env.supabaseUrl.replace(/\/$/, "")}/auth/v1${path}`;
}

function persist(session: AuthSession | null): void {
  current = session;
  if (typeof window === "undefined") return;
  if (session) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  for (const listener of listeners) listener(session);
}

interface RawSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: AuthUser;
}

function toSession(raw: RawSession): AuthSession {
  return {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    // Refresh a minute early so an in-flight call never races the expiry.
    expires_at: Date.now() + (raw.expires_in - 60) * 1000,
    user: raw.user,
  };
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const response = await fetch(authUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.supabaseKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message =
      (payload as { msg?: string; error_description?: string } | null)?.msg ||
      (payload as { error_description?: string } | null)?.error_description ||
      "SIGN IN FAILED";
    throw new Error(message);
  }
  return payload as T;
}

/** Load any persisted session. Safe to call on the server (returns null). */
export function loadSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  if (current) return current;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    current = JSON.parse(raw) as AuthSession;
    return current;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function getSession(): AuthSession | null {
  return loadSession();
}

export function onAuthStateChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<AuthSession> {
  const raw = await post<RawSession>("/token?grant_type=password", {
    email,
    password,
  });
  const session = toSession(raw);
  persist(session);
  return session;
}

export interface SignUpResult {
  session: AuthSession | null;
  /** True when the project requires the address to be confirmed first. */
  needsConfirmation: boolean;
}

export async function signUp(
  email: string,
  password: string,
  meta?: { display_name?: string; phone?: string },
): Promise<SignUpResult> {
  const raw = await post<RawSession & { user: AuthUser | null }>("/signup", {
    email,
    password,
    data: meta,
  });
  if (raw.access_token && raw.user) {
    const session = toSession(raw as RawSession);
    persist(session);
    return { session, needsConfirmation: false };
  }
  return { session: null, needsConfirmation: true };
}

export async function signOut(): Promise<void> {
  const session = loadSession();
  persist(null);
  if (session) {
    // Best effort: clearing locally is what signs the person out.
    try {
      await post("/logout", {}, session.access_token);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Send a magic link. This is how the drawn login screen signs a real account
 * in: there is no password field in the design, and the Worker documents
 * passwordless auth as the only method.
 *
 * The redirect has to be an allow-listed URL on the Supabase project (Phase 4
 * of the deployment guide). The caller passes the page that will read the
 * returned session — `/auth/callback`.
 */
export async function requestMagicLink(
  email: string,
  emailRedirectTo: string,
): Promise<void> {
  await post("/otp", { email, create_user: false, email_redirect_to: emailRedirectTo });
}

/**
 * Adopt the session Supabase appends to the redirect URL.
 *
 * A magic link returns to `…/auth/callback#access_token=…&refresh_token=…`
 * (the implicit flow) or `?code=…` (PKCE). Both are handled here so the
 * callback page does not care which one the project is configured for.
 * Returns null when the URL carries no session.
 */
export async function adoptSessionFromUrl(): Promise<AuthSession | null> {
  if (typeof window === "undefined") return null;

  const search = new URLSearchParams(window.location.search);
  const code = search.get("code");
  if (code) {
    // PKCE: exchange the one-time code for a session.
    const raw = await post<RawSession>("/token?grant_type=pkce", {
      auth_code: code,
    });
    const session = toSession(raw);
    persist(session);
    return session;
  }

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (!accessToken || !refreshToken) return null;

  const session: AuthSession = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Date.now() + Number(hash.get("expires_in") ?? 3600) * 1000 - 60_000,
    user: { id: hash.get("user_id") ?? "", email: hash.get("email") },
  };
  persist(session);
  // Strip the tokens from the address bar so they are not left in history.
  window.history.replaceState(null, "", window.location.pathname);
  return session;
}

/**
 * Only ever redirect within this app. A magic link carries a `next` deep link,
 * and sending the browser to an unvalidated one is an open redirect.
 */
export function safeNext(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

/**
 * Return a session whose access token is currently valid, refreshing it when
 * it is close to expiry. Returns null when there is nothing to refresh.
 */
export async function ensureFreshSession(): Promise<AuthSession | null> {
  const session = loadSession();
  if (!session) return null;
  if (session.expires_at > Date.now()) return session;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const raw = await post<RawSession>("/token?grant_type=refresh_token", {
        refresh_token: session.refresh_token,
      });
      const next = toSession(raw);
      persist(next);
      return next;
    } catch {
      // The refresh token is spent or revoked: the person must sign in again.
      persist(null);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}
