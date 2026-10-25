import "server-only";
import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { NextResponse } from "next/server";

export function isAuthConfigured() {
  return ["AUTH0_DOMAIN", "AUTH0_CLIENT_ID", "AUTH0_CLIENT_SECRET", "AUTH0_SECRET", "APP_BASE_URL"].every(
    (key) => Boolean(process.env[key]?.trim()),
  );
}

let client: Auth0Client | undefined;
export function getAuth0() {
  if (!isAuthConfigured()) throw new Error("Auth0 setup is incomplete. See DEVELOPMENT.md.");
  if (!client) {
    const base = new URL(process.env.APP_BASE_URL!);
    if (base.pathname !== "/" || base.search || base.hash || base.username || base.password ||
        (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname)))) {
      throw new Error("APP_BASE_URL must be an HTTPS origin, or HTTP localhost for development.");
    }
    client = new Auth0Client({
      signInReturnToPath: "/profile",
      authorizationParameters: { scope: "openid profile" },
      enableAccessTokenEndpoint: false,
      routes: { login: "/auth/login", logout: "/auth/logout", callback: "/auth/callback", profile: "/auth/profile", accessToken: "/auth/access-token" },
      session: { cookie: { secure: base.protocol === "https:", sameSite: "lax" } },
      // Every login returns through profile gating. Do not display raw OAuth
      // callback errors or forward arbitrary caller-supplied destinations.
      onCallback: async (error) => NextResponse.redirect(new URL(error ? "/sign-in-error" : "/profile", base)),
    });
  }
  return client;
}

export async function getSubject(): Promise<string | null> {
  if (!isAuthConfigured()) return null;
  const session = await getAuth0().getSession();
  return session?.user?.sub || null;
}
