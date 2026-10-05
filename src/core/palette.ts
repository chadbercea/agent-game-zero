import { Color } from 'three';

/** Stoplight status. Every status pairs a color with drone motion and the light of what it stands over. */
export type Status = 'working' | 'waiting' | 'stopped';

export const STATUSES: readonly Status[] = ['stopped', 'waiting', 'working'];

export const STATUS_COLOR: Record<Status, Color> = {
  working: new Color('#22d36b'),
  waiting: new Color('#ffb81f'),
  stopped: new Color('#ff3b3b'),
};

/**
 * Lineage palette. Hues are kept clear of the stoplight red / amber / green
 * bands so identity never reads as status.
 */
export const LINEAGE = {
  cyan: new Color('#4cc9f0'),
  blue: new Color('#3a6df0'),
  indigo: new Color('#5b4bdb'),
  violet: new Color('#9b5de5'),
  magenta: new Color('#e04fc4'),
} as const;

export type Lineage = keyof typeof LINEAGE;

export const LINEAGES = Object.keys(LINEAGE) as Lineage[];

/** Neutral body materials from the reference: soft white shell, graphite hardware. */
export const NEUTRAL = {
  shell: new Color('#e8e8eb'),
  shellShade: new Color('#cfd0d4'),
  graphite: new Color('#3a3b40'),
  graphiteDark: new Color('#232428'),
  glass: new Color('#0d0e11'),
  /** An unpowered light: gates that are off. */
  offLight: new Color('#9aa0aa'),
  /** Packets are neutral: information, not identity. */
  packet: new Color('#8d9099'),
  backdrop: new Color('#ffffff'),
} as const;
