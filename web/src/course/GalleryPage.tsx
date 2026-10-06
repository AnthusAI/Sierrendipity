import { describe } from "@sierrendipity/explorer";
import { RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "../dialogs";
import { useCourse } from "./CourseProvider";
import { PIXEL_SIDE, type GalleryItem } from "./gallery";
import { useRouter } from "./router";

export const EMPTY_GALLERY = "Nothing here yet. Things you make in lessons will show up here.";

/** A 16 by 16 picture painted with the theme's field colors (index 0 is empty). */
export function PixelPicture({ pixels, label }: { pixels: number[]; label: string }) {
  return (
    <div role="img" aria-label={label} className="grid aspect-square w-32 overflow-hidden rounded-md border bg-muted" style={{ gridTemplateColumns: `repeat(${PIXEL_SIDE}, 1fr)` }}>
      {pixels.map((color, i) => (
        <span key={i} data-pixel={color} style={color === 0 ? undefined : { background: `var(--field-${color})` }} />
      ))}
    </div>
  );
}

function Frame({ item, onReplay, onRemove }: { item: GalleryItem; onReplay: () => void; onRemove: () => void }) {
  return (
    <li data-gallery-item={item.title} data-layout-item={item.title} className="grid content-start gap-3 rounded-xl border bg-card p-4 text-card-foreground">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold">{item.title}</h2>
        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${item.title}`} onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
      {item.kind === "pixels" ? (
        <PixelPicture pixels={item.data.pixels} label={`${item.title}, a 16 by 16 pixel picture`} />
      ) : (
        <>
          <ol className="grid list-decimal gap-0.5 pl-5 text-sm">
            {item.data.words.map((word, i) => (
              <li key={i}>{describe(word).text}</li>
            ))}
          </ol>
          <div>
            <Button variant="outline" size="sm" aria-label={`Replay ${item.title}`} onClick={onReplay}>
              <RotateCcw />
              Replay
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

/** The things the student made: pictures as pixel grids, programs as card lists with Replay. */
export function GalleryView({ items, onReplay, onRemove }: { items: GalleryItem[]; onReplay: (item: GalleryItem) => void; onRemove: (item: GalleryItem) => void }) {
  const [removing, setRemoving] = useState<GalleryItem | null>(null);
  return (
    <section aria-label="Gallery" className="grid gap-4">
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-muted p-6 text-muted-foreground">{EMPTY_GALLERY}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-4">
          {items.map((item) => (
            <Frame key={item.id} item={item} onReplay={() => onReplay(item)} onRemove={() => setRemoving(item)} />
          ))}
        </ul>
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.title} from your Gallery?`}
          description="It will be gone for good. You can make it again in its lesson."
          confirm="Remove"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            onRemove(removing);
            setRemoving(null);
          }}
        />
      )}
    </section>
  );
}

export function GalleryPage() {
  const { galleryItems, gallery, userId } = useCourse();
  const { navigate } = useRouter();
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Gallery</h1>
      <GalleryView
        items={[...galleryItems].reverse()}
        onReplay={(item) => navigate(`/learn/${item.lessonId}?replay=${encodeURIComponent(item.id)}`)}
        onRemove={(item) => gallery.remove(userId, item.id)}
      />
    </div>
  );
}
