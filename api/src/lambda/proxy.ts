import { Readable, type Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createProxyHandler, type ProxyEvent } from "../proxy";

// Provided by the Lambda Node.js runtime for response streaming.
declare const awslambda: {
  streamifyResponse(h: (event: ProxyEvent, stream: Writable) => Promise<void>): unknown;
  HttpResponseStream: { from(stream: Writable, meta: { statusCode: number; headers: Record<string, string> }): Writable };
};

const proxy = createProxyHandler({ key: process.env.SESSION_KEY!, now: Date.now, fetch });

export const handler = awslambda.streamifyResponse(async (event, stream) => {
  const res = await proxy(event);
  const out = awslambda.HttpResponseStream.from(stream, { statusCode: res.statusCode, headers: res.headers });
  await pipeline(Readable.from(res.body), out);
});
