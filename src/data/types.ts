export type Point = { x: number; y: number };

export type LabelSide = 'left' | 'right' | 'above' | 'below';

export type RegionId =
  | 'one-model-call'
  | 'tool-calling'
  | 'agent-loop'
  | 'evaluation'
  | 'permissions'
  | 'context-memory'
  | 'multi-agent';

export type Source = { title: string; url: string };

export type ConceptStop = {
  id: string;
  title: string;
  /** Offset from the landmark, in world units. */
  dx: number;
  dy: number;
  side: LabelSide;
  detour?: true;
};

export type Landmark = {
  id: RegionId;
  title: string;
  kind: 'main' | 'branch';
  /** Roman numeral for main landmarks, letter for branches. */
  mark: string;
  x: number;
  y: number;
  side: LabelSide;
  /** Label side on narrow screens, when it differs. */
  compactSide?: LabelSide;
  /** The question this landmark answers, shown first on the concept tour. */
  question: string;
  /** One-line answer to “what do I build here?” */
  builds: string;
  /** How this landmark applies the one idea behind the whole trail. */
  idea: string;
  /** Articles that go deeper on this landmark's idea. */
  sources?: Source[];
  /** For branches: the landmark they leave from. */
  from?: RegionId;
  concepts: ConceptStop[];
};

/** A path through world space, as a start point plus cubic segments. */
export type CubicSeg = { c1: Point; c2: Point; to: Point };

export type TerrainName = { text: string; x: number; y: number; rotate?: number };
