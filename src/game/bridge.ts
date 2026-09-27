export interface AccessibleAction { id: string; label: string }
export interface DeskSnapshot {
  mode: string;
  title: string;
  status: string;
  original?: string;
  actions: AccessibleAction[];
  pieces: { id: string; text: string; selected: boolean }[];
  importField?: { x: number; y: number; width: number; initial: string };
}
export interface HostBridge {
  publish(snapshot: DeskSnapshot): void;
  readImport(): string;
  fail(error: Error): void;
}
export interface GamePort {
  dispatch(id: string): void;
  focus(id: string): void;
  destroy(): void;
}
