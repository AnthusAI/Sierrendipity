import { UI_BUTTONS } from "@sierrendipity/lesson-core";

/**
 * Stable `data-coach-id` values: the UI targets a scene may spotlight and a ghost may point at. The set is
 * defined by `knownTarget` in lesson-core (the loader rejects any other target), so a stage must give each
 * element it draws one of these ids:
 *   button:step|back|run|pause|reset   card:<n> (0-based)   box:<register>   tab:<name>   diagram:D1..D14
 */
export const coachId = {
  button: (name: (typeof UI_BUTTONS)[number]) => `button:${name}`,
  card: (index: number) => `card:${index}`,
  box: (register: string) => `box:${register}`,
  tab: (name: string) => `tab:${name}`,
  diagram: (n: number) => `diagram:D${n}`,
};

export const COACH_ID_KINDS = ["button", "card", "box", "tab", "diagram"] as const;

/** The element carrying a coach id, or null. */
export const findCoachTarget = (id: string, root: ParentNode = document): HTMLElement | null => root.querySelector<HTMLElement>(`[data-coach-id="${id}"]`);
