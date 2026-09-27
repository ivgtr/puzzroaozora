import Head from 'next/head';
import GameHost from '@/components/game/GameHost';

export default function Home() {
  return <><Head><title>青空パズル — 原稿修復室</title><meta name="description" content="一度読んだ言葉を手掛かりに、散らばった原稿用紙を好きなところからつなぎ直す。" /></Head><GameHost /></>;
}
