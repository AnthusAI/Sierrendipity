export type PreSignUpEvent = { request: { userAttributes: Record<string, string> } };

/** `getAllowlist` returns the raw comma-separated list, or undefined when it is not configured. */
export function createPreSignUpHandler(deps: { getAllowlist: () => Promise<string | undefined> }) {
  return async <E extends PreSignUpEvent>(event: E): Promise<E> => {
    const raw = await deps.getAllowlist().catch(() => undefined);
    const allowed = new Set((raw ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
    const email = event.request.userAttributes.email?.trim().toLowerCase();
    // Fail closed: no list, no email or an unlisted email all reject.
    if (!email || !allowed.has(email)) throw new Error("This account is not allowed to sign in.");
    return event;
  };
}
