import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { AuthStorage } from "./storage.ts";
import { parseIncomingLink, pendingPath } from "./links.ts";
import { authMessages as messages } from "./messages.ts";

export type AuthState = {
  status: "loading" | "ready" | "signedOut" | "error";
  session: Session | null;
  busy: boolean;
  message: string | null;
  pending: string | null;
  revision: number;
};
type Attempt = { owner: string | null; expires: number };
type NativeAuth = {
  openBrowser(
    url: string,
    redirect: string,
  ): Promise<{ type: string; url?: string }>;
  appleCredential(): Promise<{ token: string; nonce: string }>;
};

/** Platform-independent coordinator; credentials never leave the Supabase client. */
export class AuthController {
  private state: AuthState = {
    status: "loading",
    session: null,
    busy: false,
    message: null,
    pending: null,
    revision: 0,
  };
  private listeners = new Set<() => void>();
  private epoch = 0;
  private validating: Promise<void> | null = null;
  private exchanging: Promise<void> | null = null;
  private interactive = false;
  private lastCallback: string | null = null;
  private unsubscribe: (() => void) | null = null;
  private client: SupabaseClient;
  private storage: AuthStorage;
  private key: string;
  private scheme: string;
  private native: NativeAuth;

  constructor(
    client: SupabaseClient,
    storage: AuthStorage,
    key: string,
    scheme: string,
    native: NativeAuth,
  ) {
    this.client = client;
    this.storage = storage;
    this.key = key;
    this.scheme = scheme;
    this.native = native;
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<AuthState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private accept(session: Session | null) {
    const changed = this.state.session?.user.id !== session?.user.id;
    this.update({
      session,
      status: session ? "ready" : "signedOut",
      revision: this.state.revision + (changed ? 1 : 0),
    });
  }
  private async clearAttempt() {
    await this.storage.removeItem(`${this.key}.attempt`);
    await this.storage.removeItem(`${this.key}-code-verifier`);
  }
  private async clearLocal(preservePending = false) {
    this.epoch++;
    this.accept(null); // Unmount user-owned state before any async cleanup.
    if (!preservePending) this.update({ pending: null });
    // A durable tombstone prevents restoring a session if sign-out is interrupted.
    await this.storage.setItem(
      `${this.key}.signed-out`,
      preservePending ? "expired" : "1",
    );
    if (!preservePending) {
      await this.storage.removeItem(`${this.key}.pending`);
    }
    await this.clearAttempt();
    let revocationFailed = false;
    try {
      const { error } = await this.client.auth.signOut({ scope: "local" });
      revocationFailed = !!error;
    } catch {
      revocationFailed = true;
    }
    // Even offline, erase the refresh token. No privileged revocation endpoint.
    await this.storage.removeItem(this.key);
    await this.storage.removeItem(`${this.key}-user`);
    if (revocationFailed)
      this.update({
        message:
          "Sesión cerrada en este dispositivo. No se pudo confirmar la revocación remota.",
      });
  }
  async start(initialUrl: string | null) {
    this.unsubscribe?.();
    const { data } = this.client.auth.onAuthStateChange((event) => {
      // Never await Supabase methods inside its auth lock.
      if (event === "SIGNED_OUT") {
        this.epoch++;
        this.accept(null);
      }
      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setTimeout(() => {
          if (!this.state.busy) void this.validate();
        }, 0);
      }
    });
    this.unsubscribe = () => data.subscription.unsubscribe();
    try {
      const tombstone = await this.storage.getItem(`${this.key}.signed-out`);
      if (tombstone) await this.clearLocal(tombstone === "expired");
      const pending = await this.storage.getItem(`${this.key}.pending`);
      this.update({ pending: pending ? pendingPath(pending) : null });
      if (initialUrl) await this.handleUrl(initialUrl);
      await this.validate();
    } catch {
      this.update({
        status: "error",
        session: null,
        message: messages.storage,
      });
    }
  }
  stop() {
    this.unsubscribe?.();
    void this.client.auth.stopAutoRefresh();
  }
  async foreground(active: boolean) {
    try {
      if (active) {
        // The provider transaction verifies the resulting account before routes
        // become accessible; foregrounding the auth browser must not race it.
        if (!this.state.busy) await this.validate();
        await this.client.auth.startAutoRefresh();
      } else await this.client.auth.stopAutoRefresh();
    } catch {
      this.update({
        status: "error",
        session: null,
        message: messages.unavailable,
      });
    }
  }
  validate = (): Promise<void> => {
    if (this.validating) return this.validating;
    const epoch = this.epoch;
    this.validating = (async () => {
      try {
        const { data, error } = await this.client.auth.getSession();
        if (epoch !== this.epoch) return;
        if (error) throw error;
        if (!data.session) {
          if (this.state.status === "error") this.update({ message: null });
          this.accept(null);
          return;
        }
        // getSession only loads local state; getUser verifies against Auth.
        const verified = await this.client.auth.getUser();
        if (epoch !== this.epoch) return;
        if (verified.error) {
          if (verified.error.status === 401 || verified.error.status === 403) {
            try {
              await this.clearLocal(true);
              this.update({ message: messages.expired });
            } catch {
              this.update({
                status: "error",
                session: null,
                message: messages.storage,
              });
            }
            return;
          }
          throw verified.error;
        }
        if (verified.data.user.id !== data.session.user.id)
          throw new Error("Account changed");
        if (this.state.status === "error") this.update({ message: null });
        this.accept({ ...data.session, user: verified.data.user });
      } catch {
        if (epoch === this.epoch)
          this.update({
            status: "error",
            session: null,
            message: messages.unavailable,
            revision: this.state.revision + 1,
          });
      }
    })().finally(() => {
      this.validating = null;
    });
    return this.validating;
  };
  async handleUrl(raw: string) {
    const link = parseIncomingLink(raw, this.scheme);
    if (link.kind === "destination") {
      try {
        await this.storage.setItem(`${this.key}.pending`, link.path);
        this.update({ pending: link.path });
      } catch {
        this.update({ message: messages.storage });
      }
      return;
    }
    if (link.kind !== "callback") return;
    // Browser completion and the native Linking event can deliver the same URL.
    if (this.lastCallback === raw) return this.exchanging;
    if (this.exchanging) return this.exchanging;
    this.lastCallback = raw;
    this.exchanging = (async () => {
      this.update({ busy: true, message: null });
      let attempt: Attempt | null = null;
      try {
        const saved = await this.storage.getItem(`${this.key}.attempt`);
        attempt = saved ? (JSON.parse(saved) as Attempt) : null;
        if (
          link.failed ||
          !link.code ||
          !attempt ||
          !Number.isFinite(attempt.expires) ||
          attempt.expires < Date.now()
        )
          throw new Error("Invalid callback");
        const current = await this.client.auth.getSession();
        if (
          current.error ||
          (current.data.session?.user.id ?? null) !== attempt.owner
        )
          throw new Error("Account changed");
        const { data, error } = await this.client.auth.exchangeCodeForSession(
          link.code,
        );
        if (error || !data.session) throw error ?? new Error("Missing session");
        if (attempt.owner && data.session.user.id !== attempt.owner) {
          await this.clearLocal();
          throw new Error("Link changed account");
        }
        await this.validate();
        if (this.state.status === "ready" && attempt.owner)
          this.update({ message: "Proveedor vinculado a tu cuenta." });
      } catch {
        this.update({
          message: attempt?.owner ? messages.linking : messages.callback,
        });
      } finally {
        try {
          await this.clearAttempt();
        } catch {
          this.update({ message: messages.storage });
        }
        this.update({ busy: this.interactive });
      }
    })().finally(() => {
      this.exchanging = null;
    });
    return this.exchanging;
  }
  async signIn(provider: "google" | "apple", link = false) {
    if (
      this.state.busy ||
      (link ? this.state.status !== "ready" : this.state.status !== "signedOut")
    )
      return;
    this.interactive = true;
    this.update({ busy: true, message: null });
    const owner = this.state.session?.user.id ?? null;
    try {
      if (this.validating) await this.validating;
      if (
        (this.state.session?.user.id ?? null) !== owner ||
        (link
          ? this.state.status !== "ready"
          : this.state.status !== "signedOut")
      )
        return;
      await this.clearAttempt();
      await this.storage.removeItem(`${this.key}.signed-out`);
      if (provider === "apple") {
        const credential = await this.native.appleCredential();
        const args = {
          provider: "apple" as const,
          token: credential.token,
          nonce: credential.nonce,
        };
        const { data, error } = link
          ? await this.client.auth.linkIdentity(args)
          : await this.client.auth.signInWithIdToken(args);
        if (error || !("session" in data) || !data.session)
          throw error ?? new Error("Missing session");
        if (owner && data.session.user.id !== owner) {
          await this.clearLocal();
          throw new Error("Account changed");
        }
        await this.validate();
        if (link && this.state.status === "ready")
          this.update({ message: "Apple vinculado a tu cuenta." });
      } else {
        const redirectTo = `${this.scheme}://auth/callback`;
        await this.storage.setItem(
          `${this.key}.attempt`,
          JSON.stringify({
            owner,
            expires: Date.now() + 10 * 60_000,
          } satisfies Attempt),
        );
        const args = {
          provider: "google" as const,
          options: {
            redirectTo,
            skipBrowserRedirect: true,
            queryParams: { prompt: "select_account" },
          },
        };
        const { data, error } = link
          ? await this.client.auth.linkIdentity(args)
          : await this.client.auth.signInWithOAuth(args);
        if (error || !data.url)
          throw error ?? new Error("Missing provider URL");
        const result = await this.native.openBrowser(data.url, redirectTo);
        if (result.type === "success" && result.url)
          await this.handleUrl(result.url);
        else {
          // A Linking event can finish just before the browser reports dismissal.
          if (this.exchanging) await this.exchanging;
          if (await this.storage.getItem(`${this.key}.attempt`)) {
            await this.clearAttempt();
            this.update({ message: messages.cancelled });
          }
        }
      }
    } catch (error) {
      const cancelled =
        !!error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ERR_REQUEST_CANCELED";
      this.update({
        message: cancelled
          ? messages.cancelled
          : link
            ? messages.linking
            : messages.failed,
      });
      try {
        await this.clearAttempt();
      } catch {
        this.update({ message: messages.storage });
      }
    } finally {
      this.interactive = false;
      this.update({ busy: false });
    }
  }
  signOut = async () => {
    if (this.state.busy) return;
    this.update({ busy: true, message: null });
    try {
      await this.clearLocal();
    } catch {
      this.update({
        status: "error",
        session: null,
        message: messages.storage,
      });
    } finally {
      this.update({ busy: false });
    }
  };
  dismissPending = async () => {
    try {
      await this.storage.removeItem(`${this.key}.pending`);
      this.update({ pending: null });
    } catch {
      this.update({ message: messages.storage });
    }
  };
}
