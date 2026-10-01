import dynamic from "next/dynamic";
import Head from "next/head";
const GameHost = dynamic(() => import("../components/GameHost"), { ssr: false, loading: () => <div className="boot-note">青空パズルを準備しています…</div> });
export default function Home() {
  return <><Head><title>青空パズル</title><meta name="description" content="紙片の言葉を手掛かりに、原稿用紙の切れ端をつなぎ直す青空文庫の文章パズル。" /></Head><GameHost /></>;
}
