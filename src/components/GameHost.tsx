import { useEffect, useRef, useState } from "react";
import type { DeskSnapshot, GamePort } from "../game/bridge.ts";

export default function GameHost() {
  const mount = useRef<HTMLDivElement>(null);
  const port = useRef<GamePort | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<DeskSnapshot | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const parent = mount.current!;
    void import("../game/runtime.ts").then(({ startGame }) => startGame(parent, {
      publish: (value) => { if (active) setSnapshot(value); },
      fail: (failure) => { if (active) setError(failure.message); },
    }, controller.signal)).then((game) => {
      if (!active) { game.destroy(); return; }
      port.current = game; setReady(true);
    }).catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : "ゲームを起動できませんでした。"); });
    return () => {
      active = false; controller.abort(); port.current?.destroy(); port.current = null;
    };
  }, [attempt]);

  function retry() { setError(""); setReady(false); setSnapshot(null); setAttempt((value) => value + 1); }
  return <main className="game-host" data-game-mode={snapshot?.mode ?? "boot"}>
    <div className="game-mount" ref={mount} />
    {(!ready || error) && <div className="boot-note" role={error ? "alert" : "status"}>
      <p>{error || "原稿用紙と書体を準備しています…"}</p>
      {error && <button onClick={retry}>再試行</button>}
    </div>}
    {snapshot && !error && <section className="sr-only" aria-label={`${snapshot.title}の操作`}>
      <h1>{snapshot.title}</h1>
      <p role="status" aria-live="polite">{snapshot.status}</p>
      {snapshot.original !== undefined && <p data-original>{snapshot.original}</p>}
      {snapshot.pieces.map((piece) => <button key={piece.id} data-piece={piece.id} aria-pressed={piece.selected} onFocus={() => port.current?.focus(`piece:${piece.id}`)} onClick={() => port.current?.dispatch(`piece:${piece.id}`)}>{piece.text}</button>)}
      {snapshot.actions.map((action) => <button key={action.id} data-action={action.id} onFocus={() => port.current?.focus(action.id)} onClick={() => port.current?.dispatch(action.id)}>{action.label}</button>)}
    </section>}
  </main>;
}
