/**
 * Ghost scripts: recorded UI event scripts that "Show me" replays (a ghost cursor does the step, then
 * hands control back). Plain data, validated by hand; times are milliseconds from the start.
 */
export const GHOST_CONTROLS = ["step", "back", "run", "pause", "reset"] as const;
export type GhostControl = (typeof GHOST_CONTROLS)[number];

export type GhostEvent =
  | { at: number; type: "point"; target: string }
  | { at: number; type: "press"; control: GhostControl }
  | { at: number; type: "spin"; card: number; to: number }
  | { at: number; type: "toggle"; card: number; bit: number }
  /** Move a card within the list (`from`), or drag tray card `tray` into the list at `to`. */
  | { at: number; type: "drag"; from: number; to: number }
  | { at: number; type: "drag"; tray: number; to: number }
  | { at: number; type: "type"; text: string };

export interface Ghost {
  id: string;
  events: GhostEvent[];
}

export const GHOST_EVENT_TYPES = ["point", "press", "spin", "toggle", "drag", "type"] as const;
export const MAX_GHOST_EVENTS = 200;
export const MAX_GHOST_MS = 60_000;
/** A UI target such as "button:step", "card:2", "box:a2", "band:rd", "lamp:3", "flip" or "tray". */
export const TARGET_PATTERN = /^[a-z][a-z-]*(?::[A-Za-z0-9_-]+)?$/;

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** Validate parsed JSON as a ghost. Returns the ghost, or a list of problems. */
export function validateGhost(value: unknown, expectedId?: string): { ghost: Ghost } | { errors: string[] } {
  const errors: string[] = [];
  const obj = value as Record<string, unknown> | null;
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return { errors: ["a ghost must be a JSON object"] };
  if (typeof obj.id !== "string" || !/^[a-z0-9-]+$/.test(obj.id)) errors.push("id must be a lowercase slug");
  else if (expectedId !== undefined && obj.id !== expectedId) errors.push(`id "${obj.id}" does not match the file name "${expectedId}"`);
  for (const k of Object.keys(obj)) if (k !== "id" && k !== "events") errors.push(`unknown key "${k}"`);
  const events = obj.events;
  if (!Array.isArray(events) || events.length === 0) errors.push("events must be a non-empty array");
  else {
    if (events.length > MAX_GHOST_EVENTS) errors.push(`at most ${MAX_GHOST_EVENTS} events`);
    let last = 0;
    events.forEach((raw, i) => {
      const at = `events[${i}]`;
      const e = raw as Record<string, unknown> | null;
      if (typeof e !== "object" || e === null) return void errors.push(`${at} must be an object`);
      if (!isInt(e.at, 0, MAX_GHOST_MS)) errors.push(`${at}.at must be a whole number of milliseconds from 0 to ${MAX_GHOST_MS}`);
      else {
        if (e.at < last) errors.push(`${at}.at must not be earlier than the event before it`);
        last = e.at;
      }
      const need = (keys: string[]) => {
        for (const k of Object.keys(e)) if (k !== "at" && k !== "type" && !keys.includes(k)) errors.push(`${at}: unknown key "${k}"`);
      };
      switch (e.type) {
        case "point":
          need(["target"]);
          if (typeof e.target !== "string" || !TARGET_PATTERN.test(e.target)) errors.push(`${at}.target must look like "button:step"`);
          break;
        case "press":
          need(["control"]);
          if (!GHOST_CONTROLS.includes(e.control as GhostControl)) errors.push(`${at}.control must be one of ${GHOST_CONTROLS.join(", ")}`);
          break;
        case "spin":
          need(["card", "to"]);
          if (!isInt(e.card, 0, 255)) errors.push(`${at}.card must be a card index from 0 to 255`);
          if (!isInt(e.to, 0, 0xffffffff)) errors.push(`${at}.to must be a 32-bit word`);
          break;
        case "toggle":
          need(["card", "bit"]);
          if (!isInt(e.card, 0, 255)) errors.push(`${at}.card must be a card index from 0 to 255`);
          if (!isInt(e.bit, 0, 31)) errors.push(`${at}.bit must be 0 to 31`);
          break;
        case "drag":
          need(["from", "tray", "to"]);
          if (e.from !== undefined && e.tray !== undefined) errors.push(`${at}: a drag moves a card (from) or a tray card (tray), not both`);
          else if (e.tray !== undefined) {
            if (!isInt(e.tray, 0, 255)) errors.push(`${at}.tray must be a tray position from 0 to 255`);
          } else if (!isInt(e.from, 0, 255)) errors.push(`${at}.from must be a card index from 0 to 255`);
          if (!isInt(e.to, 0, 255)) errors.push(`${at}.to must be a card index from 0 to 255`);
          break;
        case "type":
          need(["text"]);
          if (typeof e.text !== "string" || e.text.length === 0 || e.text.length > 200) errors.push(`${at}.text must be 1 to 200 characters`);
          break;
        default:
          errors.push(`${at}: unknown type "${String(e.type)}" (use ${GHOST_EVENT_TYPES.join(", ")})`);
      }
    });
  }
  if (errors.length) return { errors };
  return { ghost: { id: obj.id as string, events: events as GhostEvent[] } };
}
