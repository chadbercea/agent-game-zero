import type { Object3D } from 'three';
import { ConnectionReveal } from '../animation/ConnectionReveal';
import type { Drone } from '../primitives/drone/Drone';
import { Connection } from '../primitives/connection/Connection';
import type { DetailHost } from '../stage/Stage';

/**
 * The drone family tree (Detail view): a parent agent and every copy of it
 * out on the grid. Focused, the family stays at full strength and everything
 * else veils; a dotted line in the family's lineage color draws from the
 * parent to each copy and follows it as it flies (copies that come out while
 * it's open join in). Unfocused, the lines draw back into the parent and the
 * veil lifts.
 */
export class FamilyTree {
  /** The family is in Detail view. */
  focused = false;
  private readonly lines = new Map<Drone, { connection: Connection; reveal: ConnectionReveal }>();

  constructor(
    private readonly stage: DetailHost,
    private readonly parent: Drone,
    /** The parent's copies out right now (read every frame). */
    private readonly children: () => Drone[],
  ) {
    stage.onTick((dt) => this.tick(dt));
  }

  /** Copies with a line to the parent drawn (or drawing). */
  get connected(): Drone[] {
    return [...this.lines.entries()].filter(([, l]) => l.reveal.shown).map(([d]) => d);
  }

  focus(on: boolean): void {
    if (on === this.focused) return;
    this.focused = on;
    if (!on) {
      for (const line of this.lines.values()) line.reveal.shown = false;
      this.stage.setDetail(null);
      return;
    }
    this.stage.setDetail(() => [this.parent, ...this.children(), ...[...this.lines.values()].map((l) => l.connection)] as Object3D[]);
  }

  private tick(dt: number): void {
    const out = new Set(this.children());
    if (this.focused) {
      for (const child of out) {
        const line = this.lines.get(child);
        if (line) line.reveal.shown = true;
        else this.connect(child);
      }
    }
    for (const [child, line] of this.lines) {
      // A copy that's gone home takes its line with it.
      if (!out.has(child)) line.reveal.shown = false;
      line.reveal.update(dt);
      if (line.reveal.gone) {
        line.connection.dispose();
        this.lines.delete(child);
      }
    }
  }

  private connect(child: Drone): void {
    const connection = new Connection(child.lineage);
    this.stage.add(connection);
    this.lines.set(child, { connection, reveal: new ConnectionReveal(connection, this.parent.rig.hover, child.rig.hover) });
  }
}
