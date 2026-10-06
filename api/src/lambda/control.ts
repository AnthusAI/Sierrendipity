import { createRemoteJWKSet, jwtVerify } from "jose";
import { createControlHandler } from "../control";
import { EcsTasks } from "./ecs-tasks";

const { REGION, USER_POOL_ID, CLIENT_ID, SESSION_KEY } = process.env as Record<string, string>;
const issuer = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`;
// createRemoteJWKSet caches the keys across invocations of a warm Lambda.
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, jwks, { issuer });
  // Access tokens carry client_id, ID tokens carry aud.
  const use = payload.token_use;
  const audience = use === "access" ? payload.client_id : use === "id" ? payload.aud : undefined;
  if (audience !== CLIENT_ID || !payload.sub) throw new Error("wrong token");
  return { sub: payload.sub };
}

export const handler = createControlHandler({
  tasks: new EcsTasks(),
  verifyToken,
  signingKey: SESSION_KEY,
  now: Date.now,
});
