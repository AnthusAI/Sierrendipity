import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { createPreSignUpHandler } from "../pre-sign-up";

const ssm = new SSMClient({});

export const handler = createPreSignUpHandler({
  async getAllowlist() {
    const out = await ssm.send(new GetParameterCommand({ Name: "/sierrendipity/allowed-emails", WithDecryption: true }));
    return out.Parameter?.Value;
  },
});
