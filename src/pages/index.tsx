import dynamic from "next/dynamic";
import Head from "next/head";
const GameHost = dynamic(() => import("../components/GameHost"), { ssr: false, loading: () => <div className="boot-note">修復机を準備しています…</div> });
export default function Home() {
  return <><Head><title>青空の修復机 — 青空パズル</title><meta name="description" content="一度読んだ情景を手掛かりに、原稿用紙の切れ端をつなぎ直す青空文庫の文章パズル。" /></Head><GameHost /></>;
}
