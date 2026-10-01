import Phaser from "phaser";
import { DeskScene, UI_TEXT, passagePreview } from "./DeskScene.ts";
import { prepareFont } from "./fonts.ts";
import { PASSAGES } from "../data/passages.ts";
import type { GamePort, HostBridge } from "./bridge.ts";

export async function startGame(parent: HTMLElement, bridge: HostBridge, signal: AbortSignal): Promise<GamePort> {
  await prepareFont(UI_TEXT + PASSAGES.map((passage) => passage.title + passage.author + passagePreview(passage.original)).join(""), "DeskSans");
  await prepareFont("…0123456789青空の修復机" + PASSAGES.map((passage) => passage.title).join(""), "DeskSerif");
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const scene = new DeskScene(bridge, () => queueMicrotask(() => {
      if (stopped) return;
      clearTimeout(timeout); booted = true;
      resolve({ dispatch: (id) => scene.dispatch(id), focus: (id) => scene.focus(id), destroy });
    }));
    let game: Phaser.Game | undefined;
    let stopped = false;
    let booted = false;
    const destroy = () => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      game?.destroy(true);
    };
    const abort = () => { destroy(); if (!booted) reject(new DOMException("起動を中止しました", "AbortError")); };
    const timeout = window.setTimeout(() => {
      destroy(); reject(new Error("ゲームを起動できませんでした。WebGLの有効化とブラウザの設定を確認して再試行してください。"));
    }, 15000);
    signal.addEventListener("abort", abort, { once: true });
    try {
      game = new Phaser.Game({
        type: Phaser.WEBGL,
        parent,
        width: parent.clientWidth,
        height: parent.clientHeight,
        backgroundColor: "#3e5149",
        scene,
        autoFocus: false,
        disableContextMenu: true,
        banner: false,
        input: { activePointers: 3, keyboard: false, mouse: { preventDefaultWheel: true }, touch: { capture: true } },
        scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.NO_CENTER },
        render: { antialias: true, roundPixels: false },
        fps: { target: 60, limit: 60 },
      });
    } catch (error) {
      destroy(); reject(error instanceof Error ? error : new Error("WebGLを初期化できませんでした。"));
    }
  });
}
