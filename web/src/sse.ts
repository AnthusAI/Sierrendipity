export interface SseEvent {
  id?: string;
  event: string;
  data: string;
}

/** Minimal Server-Sent Events parser over a fetch body (EventSource cannot send headers). */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let current: { id?: string; event: string; data: string[] } = { event: "message", data: [] };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.search(/\r\n|\n|\r/)) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + (buffer.startsWith("\r\n", newline) ? 2 : 1));
      if (line === "") {
        if (current.data.length > 0) yield { id: current.id, event: current.event, data: current.data.join("\n") };
        current = { event: "message", data: [] };
      } else if (!line.startsWith(":")) {
        const colon = line.indexOf(":");
        const field = colon < 0 ? line : line.slice(0, colon);
        const val = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
        if (field === "data") current.data.push(val);
        else if (field === "event") current.event = val;
        else if (field === "id") current.id = val;
      }
    }
  }
}
