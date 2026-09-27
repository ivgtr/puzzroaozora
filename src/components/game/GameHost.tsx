import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type Phaser from 'phaser';
import { DeskController } from '@/game/controller';
import { prepareText } from '@/game/fonts';
import { UI_COPY } from '@/game/ui-copy';

function GameAccess({ controller }: { controller: DeskController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [url, setUrl] = useState('');
  const selected = state.chains.find((chain) => chain.id === state.selected);
  return <>
    <p className="game-live" aria-live="polite">{state.announcement}</p>
    {state.view === 'error' && <p role="alert" className="game-error-detail">{state.error}</p>}
    {state.importOpen && <section role="dialog" aria-modal="true" aria-labelledby="import-heading" className="import-panel">
      <h2 id="import-heading">作品を蔵書に加える</h2>
      <p>青空文庫の図書カード、または本文のURLを貼り付けてください。</p>
      <form onSubmit={(event) => { event.preventDefault(); void controller.importBook(url); }}>
        <label htmlFor="book-url">青空文庫のURL</label>
        <input id="book-url" type="url" autoFocus required value={url} onChange={(event) => setUrl(event.target.value)} disabled={state.importing} />
        {state.error && <p role="alert">{state.error}</p>}
        <div><button disabled={state.importing} type="submit">{state.importing ? '取り込み中…' : '取り込む'}</button>
          <button disabled={state.importing} type="button" onClick={() => controller.showImport(false)}>閉じる</button></div>
      </form>
    </section>}
    <section className="game-access" aria-label="キーボードと読み上げ用の操作" inert={state.importOpen}>
      <button type="button" onClick={() => controller.library()}>作品一覧へ</button>
      <button type="button" onClick={() => controller.toggleSound()}>{state.muted ? '音を出す' : '音を消す'}</button>
      {state.view === 'library' && <>
        <h2>作品を選ぶ</h2>
        <button aria-pressed={state.difficulty === 'easy'} onClick={() => controller.setDifficulty('easy')}>Easy・2枚で確定</button>
        <button aria-pressed={state.difficulty === 'normal'} onClick={() => controller.setDifficulty('normal')}>Normal・3枚で確定</button>
        {state.choices.map((choice) => <div key={choice.id}>
          <button onClick={() => void controller.choose(choice.id)}>{choice.title}／{choice.author}（{choice.detail}）</button>
          {choice.kind === 'saved' && <button onClick={() => { if (window.confirm(`${choice.title}を蔵書から外しますか？`)) void controller.removeBook(choice.id); }}>蔵書から外す</button>}
        </div>)}
        <button onClick={() => controller.showImport(true)}>作品を取り込む</button>
      </>}
      {state.original !== undefined && <>
        <h2>{state.title}／{state.author}</h2><p data-original>{state.original}</p>
        {state.source && <a href={state.source} target="_blank" rel="noreferrer">青空文庫の原典を開く</a>}
        <button onClick={() => state.view === 'reading' ? controller.command({ type: 'begin' }) : controller.next()}>{state.view === 'reading' ? '組み立てる' : '次の原稿'}</button>
      </>}
      {state.view === 'assembling' && <>
        <h2>作業台</h2><p>紙片を選び、相手の前か後へつなぎます。仮の境界だけを外せます。</p>
        {selected && <p>選択中：{selected.text}</p>}
        {state.chains.map((chain) => <div key={chain.id} data-chain={chain.id}>
          <button onClick={() => controller.select(chain.id)} aria-pressed={chain.id === state.selected}>{chain.text}</button>
          {state.selected && state.selected !== chain.id && <>
            <button onClick={() => controller.command({ type: 'join', moving: state.selected!, target: chain.id, end: 'before' })}>この塊の前につなぐ</button>
            <button onClick={() => controller.command({ type: 'join', moving: state.selected!, target: chain.id, end: 'after' })}>この塊の後につなぐ</button>
          </>}
          {chain.boundaries.map((confirmed, index) => !confirmed && <button key={index} onClick={() => controller.command({ type: 'split', chain: chain.id, boundary: index })}>{index + 1}番目の仮の継ぎ目を外す</button>)}
        </div>)}
      </>}
      {state.view === 'error' && <button onClick={() => controller.retry()}>再試行</button>}
      {['reading', 'assembling', 'complete'].includes(state.view) && <div>
        {([{ text: '左へ', x: -180, y: 0 }, { text: '右へ', x: 180, y: 0 }, { text: '上へ', x: 0, y: -180 }, { text: '下へ', x: 0, y: 180 }]).map((direction) => <button key={direction.text} onClick={() => controller.cameraAction?.({ type: 'pan', x: direction.x, y: direction.y })}>{direction.text}</button>)}
        <button onClick={() => controller.cameraAction?.({ type: 'zoom', amount: 0.15 })}>拡大</button>
        <button onClick={() => controller.cameraAction?.({ type: 'zoom', amount: -0.15 })}>縮小</button>
      </div>}
    </section>
  </>;
}

export default function GameHost() {
  const parent = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState<DeskController>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new DeskController();
    let cancelled = false;
    let game: Phaser.Game | undefined;
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target.closest('input, textarea, button, a') || event.target.isContentEditable)) return;
      if (controller.getSnapshot().importOpen) return;
      const direction: Record<string, [number, number]> = { ArrowLeft: [-160, 0], ArrowRight: [160, 0], ArrowUp: [0, -160], ArrowDown: [0, 160] };
      if (direction[event.key]) { event.preventDefault(); const [x, y] = direction[event.key]; controller.cameraAction?.({ type: 'pan', x, y }); }
      if (event.key === '+' || event.key === '-') controller.cameraAction?.({ type: 'zoom', amount: event.key === '+' ? 0.15 : -0.15 });
      if (event.key === 'Escape') controller.select();
    };
    async function start() {
      try {
        await Promise.all([prepareText(UI_COPY), prepareText(UI_COPY, true)]);
        if (cancelled) return;
        const { mountGame } = await import('@/game/mount');
        if (cancelled || !parent.current) return;
        game = mountGame(parent.current, controller);
        window.addEventListener('keydown', keydown);
        setReady(controller); setError(undefined);
        await controller.initialize();
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : 'ゲームの起動に失敗しました。'); }
    }
    void start();
    return () => {
      cancelled = true; controller.dispose(); window.removeEventListener('keydown', keydown);
      // Destroy on the game loop, including all scenes, input, sound and textures.
      game?.destroy(true);
    };
  }, [attempt]);
  return <main className="game-host" aria-label="青空パズル">
    <div ref={parent} className="game-canvas" />
    {!ready && !error && <p className="game-boot" role="status">原稿用紙を用意しています…</p>}
    {error && <section className="game-boot" role="alert"><p>{error}</p><button onClick={() => { setReady(undefined); setError(undefined); setAttempt((value) => value + 1); }}>再試行</button></section>}
    {ready && <GameAccess controller={ready} />}
  </main>;
}
