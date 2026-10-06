import { randomBytes } from "node:crypto";
import { CognitoIdentityProviderClient, GetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createControlHandler } from "../control";
import { EcsTasks } from "./ecs-tasks";

const { REGION, USER_POOL_ID, CLIENT_ID, SESSION_KEY } = process.env as Record<string, string>;
const issuer = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`;
// createRemoteJWKSet caches the keys across invocations of a warm Lambda.
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
const cognito = new CognitoIdentityProviderClient({});
const ssm = new SSMClient({});

async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, jwks, { issuer, algorithms: ["RS256"] });
  // Access tokens carry client_id, ID tokens carry aud.
  const use = payload.token_use;
  const audience = use === "access" ? payload.client_id : use === "id" ? payload.aud : undefined;
  if (audience !== CLIENT_ID || !payload.sub) throw new Error("wrong token");
  // Only ID tokens carry the email; for access tokens ask Cognito (GetUser takes the access token itself).
  let email = typeof payload.email === "string" ? payload.email : undefined;
  if (!email && use === "access") {
    const user = await cognito.send(new GetUserCommand({ AccessToken: token }));
    email = user.UserAttributes?.find((a) => a.Name === "email")?.Value;
  }
  return { sub: payload.sub, email };
}

export const handler = createControlHandler({
  tasks: new EcsTasks(),
  verifyToken,
  async getAllowlist() {
    const out = await ssm.send(new GetParameterCommand({ Name: "/sierrendipity/allowed-emails", WithDecryption: true }));
    return out.Parameter?.Value;
  },
  newSecret: () => randomBytes(32).toString("hex"),
  signingKey: SESSION_KEY,
  now: Date.now,
});
