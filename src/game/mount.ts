import Phaser from 'phaser';
import { DeskController } from './controller';
import { DeskScene } from './desk-scene';
import { HudScene } from './hud-scene';
import { renderResolution } from './display';

export function mountGame(parent: HTMLElement, controller: DeskController) {
  const game = new Phaser.Game({
    type: Phaser.WEBGL, parent, backgroundColor: '#243e36',
    resolution: renderResolution(),
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight, autoCenter: Phaser.Scale.NO_CENTER },
    render: { antialias: true, roundPixels: false },
    input: { activePointers: 2 },
    audio: { disableWebAudio: false },
    scene: [new DeskScene(controller), new HudScene(controller)],
    callbacks: { postBoot: () => { game.canvas.setAttribute('aria-hidden', 'true'); } },
  });
  return game;
}
