import type { BetterAuthPlugin } from "better-auth";
import { timingSafeEqual } from "node:crypto";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { jwtVerify } from "jose";
import { env } from "@reactive-resume/env/server";
import { toUsername } from "@reactive-resume/utils/string";

/**
 * ResumeIQ single sign-on. ResumeIQ (the job-search app this editor is embedded in) owns the user's
 * account; this editor gives each ResumeIQ user their own editor account, created on demand, and signs
 * them in without a second login. Both endpoints trust only RESUMEIQ_SSO_SECRET, shared with the
 * ResumeIQ server – nothing here is reachable without it.
 *
 * - POST /api/auth/resumeiq/provision (server to server, `Authorization: Bearer <secret>`):
 *   { email, name } → makes sure an editor account exists for that email and returns a new API key
 *   owned by it, so ResumeIQ creates that user's resumes in their own account.
 * - GET /api/auth/resumeiq/sign-in?token=<JWT> (in the browser / embedded frame): a JWT signed by
 *   the ResumeIQ server with the secret (HS256, ≤ 2 minutes, iss "resumeiq", aud "resumeiq-editor",
 *   claims email + redirect) → signs that account in and redirects within this editor.
 */

const ISSUER = "resumeiq";
const AUDIENCE = "resumeiq-editor";

function ssoSecret(): string {
	const secret = env.RESUMEIQ_SSO_SECRET?.trim();
	if (!secret || secret.length < 32) throw new APIError("NOT_FOUND"); // SSO is off unless configured
	return secret;
}

function sameSecret(given: string, expected: string): boolean {
	const a = Buffer.from(given);
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}

/** Only paths inside this editor (no other hosts, no protocol-relative "//"). */
function safeRedirect(value: unknown): string {
	return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

// Set once the auth instance exists (config.ts) – creating API keys goes through the auth API itself.
let createApiKey: ((userId: string) => Promise<string>) | undefined;
export function setResumeiqApiKeyCreator(fn: (userId: string) => Promise<string>) {
	createApiKey = fn;
}

export function resumeiqSso() {
	return {
		id: "resumeiq-sso",
		endpoints: {
			resumeiqProvision: createAuthEndpoint(
				"/resumeiq/provision",
				{ method: "POST", requireHeaders: true },
				async (ctx) => {
					const secret = ssoSecret();
					const bearer = (ctx.headers?.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
					if (!sameSecret(bearer, secret)) throw new APIError("UNAUTHORIZED");

					const body = (ctx.body ?? {}) as { email?: unknown; name?: unknown };
					const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
					if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
						throw new APIError("BAD_REQUEST", { message: "email is required" });
					const local = email.split("@")[0] ?? "user";
					const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 100) : local;

					let user = (await ctx.context.internalAdapter.findUserByEmail(email))?.user;
					if (!user) {
						// Usernames are unique: the email's local part plus a short random suffix.
						const base = toUsername(local).slice(0, 40) || "user";
						const username = `${base}-${crypto.randomUUID().slice(0, 6)}`;
						user = await ctx.context.internalAdapter.createUser(
							{ email, name, emailVerified: true, username, displayUsername: username },
							{ method: "resumeiq-sso" } as never,
						);
					}
					if (!user) throw new APIError("INTERNAL_SERVER_ERROR", { message: "Couldn't create the editor account" });

					if (!createApiKey) throw new APIError("INTERNAL_SERVER_ERROR", { message: "API keys aren't available" });
					return ctx.json({ userId: user.id, apiKey: await createApiKey(user.id) });
				},
			),

			resumeiqSignIn: createAuthEndpoint("/resumeiq/sign-in", { method: "GET", requireHeaders: true }, async (ctx) => {
				const token = String((ctx.query as { token?: unknown } | undefined)?.token ?? "");
				let payload: { email?: unknown; redirect?: unknown };
				try {
					const verified = await jwtVerify(token, new TextEncoder().encode(ssoSecret()), {
						issuer: ISSUER,
						audience: AUDIENCE,
						maxTokenAge: "2m",
					});
					payload = verified.payload as { email?: unknown; redirect?: unknown };
				} catch {
					throw ctx.redirect(new URL("/auth/login?error=resumeiq_link_expired", ctx.context.baseURL).toString());
				}

				const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
				const user = email ? (await ctx.context.internalAdapter.findUserByEmail(email))?.user : undefined;
				if (!user)
					throw ctx.redirect(new URL("/auth/login?error=resumeiq_account_missing", ctx.context.baseURL).toString());

				const session = await ctx.context.internalAdapter.createSession(user.id);
				if (!session) throw new APIError("INTERNAL_SERVER_ERROR", { message: "Couldn't sign in" });
				await setSessionCookie(ctx, { session, user });
				throw ctx.redirect(new URL(safeRedirect(payload.redirect), ctx.context.baseURL).toString());
			}),
		},
	} satisfies BetterAuthPlugin;
}
