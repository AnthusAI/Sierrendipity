import { Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MODE_PREFERENCES, type ModePreference } from "./settings";
import { useAppearance } from "./theme/appearance";
import { THEMES, THEME_LABELS, resolveTheme, type Mode, type ThemeName } from "./theme/palette";

const MODE_OPTIONS: Record<ModePreference, { label: string; icon: ReactNode; hint: string }> = {
  light: { label: "Light", icon: <Sun aria-hidden className="size-4" />, hint: "Always light" },
  dark: { label: "Dark", icon: <Moon aria-hidden className="size-4" />, hint: "Always dark" },
  system: { label: "System", icon: <Monitor aria-hidden className="size-4" />, hint: "Match this device" },
};

const THEME_HINTS: Record<ThemeName, string> = {
  cool: "Slate with an indigo accent",
  warm: "Sand with an orange accent",
  neutral: "Gray and calm",
};

/** A miniature of the interface painted with one theme's colors (in the mode currently in effect). */
function Preview({ theme, mode }: { theme: ThemeName; mode: Mode }) {
  const c = resolveTheme(theme, mode);
  return (
    <span
      aria-hidden
      data-swatch
      className="flex h-14 w-full flex-col overflow-hidden rounded-md border"
      style={{ background: c.background, borderColor: c.border }}
    >
      <span data-swatch className="flex h-3.5 items-center gap-1 px-1.5" style={{ background: c.chrome, borderBottom: `1px solid ${c.border}` }}>
        <span className="size-1.5 rounded-full" style={{ background: c["muted-foreground"] }} />
        <span className="size-1.5 rounded-full" style={{ background: c["muted-foreground"] }} />
      </span>
      <span className="flex flex-1 items-center gap-1.5 px-1.5">
        <span data-swatch className="h-3 w-6 rounded-sm" style={{ background: c.primary }} />
        <span data-swatch className="h-1.5 flex-1 rounded-full" style={{ background: c.foreground, opacity: 0.75 }} />
        <span data-swatch className="size-2.5 rounded-full" style={{ background: c.link }} />
      </span>
    </span>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  );
}

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { appearance, mode, setAppearance } = useAppearance();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-6">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Your choices are saved in this browser for your account.</DialogDescription>
        </DialogHeader>
        <h2 className="-mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Appearance</h2>
        <Section title="Mode" hint="System follows your device's light or dark setting.">
          <RadioGroup
            aria-label="Mode"
            className="grid-cols-3"
            value={appearance.mode}
            onValueChange={(value) => setAppearance({ mode: value as ModePreference })}
          >
            {MODE_PREFERENCES.map((option) => (
              <RadioGroupItem key={option} value={option} aria-label={MODE_OPTIONS[option].label} className="flex-col items-start gap-1">
                <span className="flex items-center gap-2 font-medium">
                  {MODE_OPTIONS[option].icon} {MODE_OPTIONS[option].label}
                </span>
                <span className="text-xs text-muted-foreground">{MODE_OPTIONS[option].hint}</span>
              </RadioGroupItem>
            ))}
          </RadioGroup>
        </Section>
        <Section title="Color theme" hint="Each theme has a light and a dark version.">
          <RadioGroup
            aria-label="Color theme"
            className="grid-cols-3"
            value={appearance.theme}
            onValueChange={(value) => setAppearance({ theme: value as ThemeName })}
          >
            {THEMES.map((theme) => (
              <RadioGroupItem key={theme} value={theme} aria-label={THEME_LABELS[theme]} className="flex-col items-stretch gap-2">
                <Preview theme={theme} mode={mode} />
                <span className="font-medium">{THEME_LABELS[theme]}</span>
                <span className="text-xs text-muted-foreground">{THEME_HINTS[theme]}</span>
              </RadioGroupItem>
            ))}
          </RadioGroup>
        </Section>
      </DialogContent>
    </Dialog>
  );
}
