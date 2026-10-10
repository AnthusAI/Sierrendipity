import { UI_BUTTONS } from "@sierrendipity/lesson-core";

/**
 * Stable `data-coach-id` values: the UI targets a scene may spotlight and a ghost may point at. The set is
 * defined by `knownTarget` in lesson-core (the loader rejects any other target), so a stage must give each
 * element it draws one of these ids:
 *   button:step|back|run|pause|reset   card:<n> (0-based)   glass:<n> (with ui.glass)   box:<register>   tab:<name>   diagram:D1..D14   banner:rule
 */
export const coachId = {
  button: (name: (typeof UI_BUTTONS)[number]) => `button:${name}`,
  card: (index: number) => `card:${index}`,
  glass: (index: number) => `glass:${index}`,
  box: (register: string) => `box:${register}`,
  tab: (name: string) => `tab:${name}`,
  diagram: (n: number) => `diagram:D${n}`,
  banner: (name: "rule") => `banner:${name}`,
};

export const COACH_ID_KINDS = ["button", "card", "glass", "box", "tab", "diagram", "banner"] as const;

/** The element carrying a coach id, or null. */
export const findCoachTarget = (id: string, root: ParentNode = document): HTMLElement | null => root.querySelector<HTMLElement>(`[data-coach-id="${id}"]`);
