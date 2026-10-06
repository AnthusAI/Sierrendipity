import { useState, type ReactNode } from "react";
import { BAND_NAMES, BinaryCounter, BitLamps, CardFace, CardFlip, CarryRipple, FieldBands, WordEditor, type Lens } from "@/lamps";

export const title = "Lamps, bands and flip";

/** The three words used throughout: add a2,a0,a1 / sub a2,a0,a1 / addi a0,zero,5. */
const ADD = 0x00b50633;
const ADDI = 0x00500513;

/** One example of each instruction format (the word is what the machine would read). */
const FORMATS: [string, number, string][] = [
  ["R", ADD, "add a2, a0, a1"],
  ["I", ADDI, "addi a0, zero, 5"],
  ["S", 0x00b52423, "sw a1, 8(a0)"],
  ["B", 0x00b50463, "beq a0, a1, 8"],
  ["U", 0x12345537, "lui a0, 0x12345"],
  ["J", 0x008000ef, "jal ra, 8"],
  ["load", 0x0085a503, "lw a0, 8(a1)"],
  ["jalr", 0x000500e7, "jalr ra, 0(a0)"],
  ["ecall", 0x00000073, "ecall"],
];

function Demo({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">{name}</h3>
      {children}
    </div>
  );
}

function BandExplorer({ word = ADD, name = "Band explorer" }: { word?: number; name?: string }) {
  const [hot, setHot] = useState<string | null>(null);
  const [clicked, setClicked] = useState<string | null>(null);
  return (
    <div role="group" aria-label={name} className="space-y-3">
      <FieldBands word={word} label={`${name} bands`} onHoverField={setHot} onFieldClick={setClicked} />
      <CardFace word={word} highlight={hot} />
      <p className="text-sm">{`Pointing at: ${hot ?? "nothing"}`}</p>
      <p className="text-sm">Click the band that says which box gets the answer</p>
      {clicked && (
        <p role="status" aria-label="Answer to the question" className="text-sm font-medium">
          {clicked === "rd"
            ? "Yes, the band for rd says which box gets the answer."
            : `Not that one: ${BAND_NAMES[clicked]?.label ?? clicked} is something else. Try again.`}
        </p>
      )}
    </div>
  );
}

export default function LampsSection() {
  const [number, setNumber] = useState(0);
  const [eight, setEight] = useState(0);
  const [word, setWord] = useState(ADD);
  const [limited, setLimited] = useState(ADD);
  const [lens, setLens] = useState<Lens>("card");

  return (
    <div className="space-y-10">
      <Demo name="Bit lamps">
        <BitLamps label="Bit lamps demo" value={number} onChange={setNumber} signed />
      </Demo>
      <Demo name="Too many lamps (64 asked for, 32 shown)">
        <BitLamps label="Too many lamps demo" value={1} width={64} readOnly showTotal={false} />
      </Demo>
      <Demo name="Eight lamps">
        <BitLamps label="Eight lamps demo" value={eight} onChange={setEight} width={8} />
      </Demo>
      <Demo name="Read-only lamps">
        <BitLamps label="Read-only lamps demo" value={0x41} width={8} readOnly />
      </Demo>

      <Demo name="Binary counter">
        <BinaryCounter label="Binary counter" intervalMs={500} />
      </Demo>
      <Demo name="Make this number">
        <BinaryCounter label="Make this number" target={12} width={8} />
        <BinaryCounter label="Make zero" target={0} width={8} />
        <BinaryCounter label="Make 300 with eight lamps" target={300} width={8} />
      </Demo>

      <Demo name="Carry ripple">
        <div className="grid gap-6 md:grid-cols-2">
          <CarryRipple a={5} b={7} label="Carry ripple 5 + 7" intervalMs={400} />
          <CarryRipple a={15} b={1} label="Carry ripple 15 + 1" intervalMs={400} />
        </div>
      </Demo>

      <Demo name="Carry ripple, a full 32-lamp sum and bad input">
        <div className="space-y-6">
          <CarryRipple a={0xffffffff} b={1} label="Carry ripple 4294967295 + 1" />
          <CarryRipple a={-1} b={1} label="Carry ripple of a negative number" />
        </div>
      </Demo>

      <Demo name="Field bands, one word of each format">
        <div className="space-y-4">
          {FORMATS.map(([format, w, text]) => (
            <div key={format} className="space-y-1">
              <p className="text-xs text-muted-foreground">{`${format} format: ${text}`}</p>
              <FieldBands word={w} label={`Field bands for ${format} word`} lamps={false} />
            </div>
          ))}
        </div>
      </Demo>
      <Demo name="Pointing at bands and clicking them">
        <BandExplorer />
        <BandExplorer word={0x00a50533} name="Repeated boxes explorer" />
      </Demo>

      <Demo name="Card flip (addi a0, zero, 5)">
        <CardFlip word={ADDI} label="Card flip demo" lens={lens} onLensChange={setLens} />
        <p className="text-sm">{`Card flip demo view: ${lens}`}</p>
      </Demo>
      <Demo name="Card flip showing plain assembly (no aliases)">
        <CardFlip word={ADDI} label="Card flip plain demo" aliases={false} />
      </Demo>
      <Demo name="Card flip with no views offered: just the card">
        <CardFlip word={ADDI} label="Card only demo" lenses={[]} />
      </Demo>
      <Demo name="Card flip with only the first two views">
        <CardFlip word={ADDI} label="Early card flip demo" lenses={["card", "lamps"]} />
      </Demo>

      <Demo name="Word editor: flip lamps to turn add into sub">
        <WordEditor word={word} onChange={setWord} label="Word editor demo" />
      </Demo>
      <Demo name="Word editor: flip only bit 30">
        <WordEditor word={limited} onChange={setLimited} label="Flip only bit 30" lenses={["card", "lamps", "hex"]} allowedBits={[30]} />
      </Demo>
    </div>
  );
}
