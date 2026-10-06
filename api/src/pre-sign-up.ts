export type PreSignUpEvent = { request: { userAttributes: Record<string, string> } };

/** Fail closed: no list, no email or an unlisted email is never allowed. `raw` is comma-separated. */
export function isAllowed(raw: string | undefined, email: string | undefined): boolean {
  const allowed = new Set((raw ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
  const e = email?.trim().toLowerCase();
  return !!e && allowed.has(e);
}

/** `getAllowlist` returns the raw comma-separated list, or undefined when it is not configured. */
export function createPreSignUpHandler(deps: { getAllowlist: () => Promise<string | undefined> }) {
  return async <E extends PreSignUpEvent>(event: E): Promise<E> => {
    const raw = await deps.getAllowlist().catch(() => undefined);
    if (!isAllowed(raw, event.request.userAttributes.email)) throw new Error("This account is not allowed to sign in.");
    return event;
  };
}
