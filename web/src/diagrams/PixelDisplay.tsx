import { PIXEL_PALETTE } from "./palette";
import { TEST_CLOCK, type MachineTimeline } from "./useMachineTimeline";

/** The screen is 256 bytes of memory starting here: one byte per pixel, 16 pixels per row. */
export const PIXEL_BASE = 1024;
export const PIXEL_SIDE = 16;

interface Props {
  timeline: MachineTimeline;
  /** Number rows and columns from 0 (default) or from 1. */
  base?: 0 | 1;
}

/** E10, the 16 by 16 pixel display: a live view of `readMem(1024, 256)` at the timeline's position. */
export function PixelDisplay({ timeline: tl, base = 0 }: Props) {
  const bytes = tl.readMem(PIXEL_BASE, PIXEL_SIDE * PIXEL_SIDE);
  const latest = tl.lastMemWrite(PIXEL_BASE, bytes.length);
  const latestIndex = latest ? latest.addr - PIXEL_BASE : -1;
  return (
    <div data-diagram-surface data-animation-t={TEST_CLOCK ? tl.t : undefined} className="flex flex-wrap items-start gap-6 rounded-lg border bg-card p-4 text-card-foreground">
      <div role="group" aria-label="Pixel screen" className="grid w-fit gap-px rounded-md border bg-border p-px" style={{ gridTemplateColumns: `repeat(${PIXEL_SIDE}, 1.5rem)` }}>
        {Array.from(bytes, (value, i) => {
          const row = Math.floor(i / PIXEL_SIDE) + base;
          const col = (i % PIXEL_SIDE) + base;
          const color = PIXEL_PALETTE[value];
          const name = color ? `color ${value} (${color.label})` : `color ${value} (not in the palette)`;
          const label = `pixel (${row}, ${col}) = ${name}`;
          return (
            <div
              key={i}
              role="img"
              aria-label={label}
              title={label}
              data-pixel
              data-row={row}
              data-col={col}
              data-color={value}
              data-latest={i === latestIndex ? "true" : undefined}
              className={`flex size-6 items-center justify-center text-[10px] font-medium leading-none tabular-nums ${i === latestIndex ? "outline-2 -outline-offset-2 outline-foreground" : ""}`}
              style={{ backgroundColor: color?.bg ?? "var(--muted)", color: color?.fg ?? "var(--foreground)" }}
            >
              {value !== 0 && (color ? value : "?")}
            </div>
          );
        })}
      </div>
      <div>
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
              </span>
              {" "}
              <span>{color.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
