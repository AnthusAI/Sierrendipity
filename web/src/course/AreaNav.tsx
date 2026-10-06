import { BookOpen, Code2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { areaOf, Link, useRouter, type Area } from "./router";

const AREAS: { area: Area; to: string; label: string; icon: typeof BookOpen }[] = [
  { area: "learn", to: "/learn", label: "Learn", icon: BookOpen },
  { area: "workspace", to: "/workspace", label: "Workspace", icon: Code2 },
];

/** The two top-level areas as a small segmented control in the header. These are links, so back and forward work. */
export function AreaNav() {
  const { path } = useRouter();
  const current = areaOf(path);
  return (
    <nav aria-label="Areas" className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5">
      {AREAS.map(({ area, to, label, icon: Icon }) => (
        <Link
          key={area}
          to={to}
          aria-current={current === area ? "page" : undefined}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
            current === area ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon aria-hidden className="size-3.5" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
