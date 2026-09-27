import { useEffect, useRef, useState } from 'react';
import type { GetServerSideProps } from 'next';
import type Phaser from 'phaser';
import { FONT_SPECIMEN, prepareText } from '@/game/fonts';
import { renderResolution } from '@/game/display';

export const getServerSideProps: GetServerSideProps = async () => process.env.NODE_ENV === 'production' ? { notFound: true } : { props: {} };
export default function Study() {
  const parent = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false, game: Phaser.Game | undefined;
    void (async () => {
      const [{ default: Phaser }, { TypeStudy, STUDY_COPY }] = await Promise.all([import('phaser'), import('@/game/type-study')]);
      await Promise.all([prepareText(STUDY_COPY + FONT_SPECIMEN), prepareText(STUDY_COPY + FONT_SPECIMEN, false, 400), prepareText(STUDY_COPY, true)]);
      if (!disposed && parent.current) game = new Phaser.Game({ type: Phaser.WEBGL, parent: parent.current, width: parent.current.clientWidth, height: parent.current.clientHeight, resolution: renderResolution(), scene: TypeStudy });
    })().catch((cause: Error) => { if (!disposed) setError(cause.message); });
    return () => { disposed = true; game?.destroy(true); };
  }, []);
  return <main className="game-host"><div ref={parent} className="game-canvas" />{error && <p className="game-boot">{error}</p>}</main>;
}
