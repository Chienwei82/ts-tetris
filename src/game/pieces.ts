import type { PieceKind, RotationState, Vec2 } from './types.js';

/** Spawn-orientation cells relative to the piece origin. */
const BASE_CELLS: Record<PieceKind, Vec2[]> = {
  I: [
    { x: -1, y: 0 },
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 }
  ],
  O: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 }
  ],
  T: [
    { x: -1, y: 0 },
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 }
  ],
  S: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: 1 },
    { x: 0, y: 1 }
  ],
  Z: [
    { x: -1, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 }
  ],
  J: [
    { x: -1, y: 0 },
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: 1 }
  ],
  L: [
    { x: -1, y: 0 },
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 }
  ]
};

/** Rotate a cell 90° clockwise in a y-up board space. */
export function rotateCWCell(c: Vec2): Vec2 {
  return { x: -c.y, y: c.x };
}

/** Rotate a cell 90° counter-clockwise. */
export function rotateCCWCell(c: Vec2): Vec2 {
  return { x: c.y, y: -c.x };
}

/** Cells of a piece kind in a given rotation state (0 = spawn). */
export function cellsForRotation(kind: PieceKind, rotation: RotationState): Vec2[] {
  if (kind === 'O') return BASE_CELLS.O.map((c) => ({ ...c }));
  const base = BASE_CELLS[kind];
  const steps = ((rotation % 4) + 4) % 4;
  let cells = base.map((c) => ({ ...c }));
  for (let i = 0; i < steps; i++) cells = cells.map(rotateCWCell);
  return cells;
}

/** Absolute board cells for an active piece. */
export function cellsForPiece(
  kind: PieceKind,
  rotation: RotationState,
  px: number,
  py: number
): Vec2[] {
  return cellsForRotation(kind, rotation).map((c) => ({ x: px + c.x, y: py + c.y }));
}

type KickTable = Record<string, Vec2[]>;

const JLSTZ_KICKS: KickTable = {
  '0>1': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: 1 }, { x: 0, y: -2 }, { x: -1, y: -2 }],
  '1>0': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: -1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
  '1>2': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: -1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
  '2>1': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: 1 }, { x: 0, y: -2 }, { x: -1, y: -2 }],
  '2>3': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: -2 }, { x: 1, y: -2 }],
  '3>2': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: 2 }, { x: -1, y: 2 }],
  '3>0': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: 2 }, { x: -1, y: 2 }],
  '0>3': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: -2 }, { x: 1, y: -2 }]
};

const I_KICKS: KickTable = {
  '0>1': [{ x: 0, y: 0 }, { x: -2, y: 0 }, { x: 1, y: 0 }, { x: -2, y: -1 }, { x: 1, y: 2 }],
  '1>0': [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: -1, y: 0 }, { x: 2, y: 1 }, { x: -1, y: -2 }],
  '1>2': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 2, y: 0 }, { x: -1, y: 2 }, { x: 2, y: -1 }],
  '2>1': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -2, y: 0 }, { x: 1, y: -2 }, { x: -2, y: 1 }],
  '2>3': [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: -1, y: 0 }, { x: 2, y: 1 }, { x: -1, y: -2 }],
  '3>2': [{ x: 0, y: 0 }, { x: -2, y: 0 }, { x: 1, y: 0 }, { x: -2, y: -1 }, { x: 1, y: 2 }],
  '3>0': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -2, y: 0 }, { x: 1, y: -2 }, { x: -2, y: 1 }],
  '0>3': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 2, y: 0 }, { x: -1, y: 2 }, { x: 2, y: -1 }]
};

/** SRS wall-kick offsets to try when rotating from `from` to `to`. */
export function getKicks(kind: PieceKind, from: RotationState, to: RotationState): Vec2[] {
  if (kind === 'O') return [{ x: 0, y: 0 }];
  const key = `${from}>${to}`;
  const table = kind === 'I' ? I_KICKS : JLSTZ_KICKS;
  return table[key] ?? [{ x: 0, y: 0 }];
}

/** 7-bag randomizer: shuffled bag of the 7 kinds. `rng` injectable for tests. */
export function shuffledBag(rng: () => number = Math.random): PieceKind[] {
  const bag: PieceKind[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = bag[i];
    const b = bag[j];
    if (a === undefined || b === undefined) continue;
    bag[i] = b;
    bag[j] = a;
  }
  return bag;
}
