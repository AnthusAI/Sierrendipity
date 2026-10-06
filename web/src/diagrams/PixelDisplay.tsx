import { OTHER_COLOR, PIXEL_PALETTE } from "./palette";
import { TEST_CLOCK, type MachineTimeline } from "./useMachineTimeline";

/** The screen is 256 bytes of memory starting here: one byte per pixel, 16 pixels per row. */
export const PIXEL_BASE = 1024;
export const PIXEL_SIDE = 16;
const PIXELS = PIXEL_SIDE * PIXEL_SIDE;

/** A striped fill for bytes above 15, so "other" never looks like blank or like a palette color. */
const stripes = "repeating-linear-gradient(45deg, var(--foreground) 0 2px, var(--muted) 2px 6px)";

interface Props {
  timeline: MachineTimeline;
  /** Number rows and columns from 0 (default) or from 1. */
  base?: 0 | 1;
}

/** E10, the 16 by 16 pixel display: a live view of `readMem(1024, 256)` at the timeline's position. */
export function PixelDisplay({ timeline: tl, base = 0 }: Props) {
  const bytes = tl.readMem(PIXEL_BASE, PIXELS);
  // Every pixel the most recent store touched (a word store lights four), clipped to the screen. A store
  // elsewhere in memory is still the most recent store, so it clears the highlight.
  const latest = tl.lastMemWrite(0, 2 ** 32);
  const first = latest ? Math.max(latest.addr, PIXEL_BASE) - PIXEL_BASE : 0;
  const last = latest ? Math.min(latest.addr + latest.length, PIXEL_BASE + PIXELS) - PIXEL_BASE : 0;
  return (
    <div data-diagram-surface data-animation-t={TEST_CLOCK ? tl.t : undefined} className="flex flex-wrap items-start gap-6 rounded-lg border bg-card p-4 text-card-foreground">
      <div className="min-w-[16rem] max-w-[26rem] flex-1">
        <div
          role="group"
          aria-label="Pixel screen"
          className="grid w-full gap-px rounded-md border bg-border p-px"
          style={{ gridTemplateColumns: `repeat(${PIXEL_SIDE}, minmax(0, 1fr))` }}
        >
          {Array.from(bytes, (value, i) => {
            const row = Math.floor(i / PIXEL_SIDE) + base;
            const col = (i % PIXEL_SIDE) + base;
            const color = PIXEL_PALETTE[value];
            const isLatest = i >= first && i < last;
            const label = `pixel (${row}, ${col}) = color ${value} (${color ? color.label : OTHER_COLOR.label})`;
            return (
              <div
                key={i}
                role="img"
                aria-label={label}
                aria-current={isLatest ? "true" : undefined}
                title={label}
                data-pixel
                data-row={row}
                data-col={col}
                data-color={value}
                data-latest={isLatest ? "true" : undefined}
                className={`flex aspect-square min-w-0 items-center justify-center overflow-hidden text-[10px] font-medium leading-none tabular-nums ${isLatest ? "outline-2 -outline-offset-2 outline-foreground" : ""}`}
                style={color ? { backgroundColor: color.bg, color: color.fg } : { backgroundColor: OTHER_COLOR.bg, backgroundImage: stripes }}
              >
                {color && value !== 0 && value}
              </div>
            );
          })}
        </div>
      </div>
      <div className="shrink-0">
        <p className="mb-2 text-sm font-medium">Colours</p>
        <ul aria-label="Colour legend" data-legend className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {PIXEL_PALETTE.map((color) => (
            <li key={color.value} data-color={color.value} className="flex items-center gap-2 text-foreground">
              <span
                data-swatch
                className="flex size-6 items-center justify-center rounded-sm border text-[10px] font-medium tabular-nums"
                style={{ backgroundColor: color.bg, color: color.fg }}
              >
                {color.value}
              </span>{" "}
              <span>{color.label}</span>
            </li>
          ))}
          <li data-color="other" className="col-span-2 flex items-center gap-2 text-foreground">
            <span
              data-swatch="other"
              className="flex size-6 items-center justify-center rounded-sm border text-[10px] font-medium"
              style={{ backgroundColor: OTHER_COLOR.bg, backgroundImage: stripes, color: OTHER_COLOR.fg }}
            >
              <span className="rounded-sm bg-background px-0.5">+</span>
            </span>{" "}
            <span>other: a byte from 16 to 255 is not in the palette</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
