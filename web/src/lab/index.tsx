import type { ComponentType } from "react";

type Section = { default: ComponentType; title?: string };
const sections = import.meta.glob<Section>("./sections/*.tsx", { eager: true });

/** Developer gallery at /lab: one section per component family. Holds no user data. */
export function Lab() {
  const entries = Object.entries(sections).sort(([a], [b]) => a.localeCompare(b));
  return (
    <main className="mx-auto max-w-5xl space-y-12 p-6">
      <h1 className="text-xl font-semibold">Component lab</h1>
      {entries.map(([path, mod]) => {
        const Section = mod.default;
        return (
          <section key={path} aria-label={mod.title ?? path} data-lab-section={path}>
            <h2 className="mb-3 text-lg font-medium">{mod.title ?? path}</h2>
            <Section />
          </section>
        );
      })}
    </main>
  );
}
