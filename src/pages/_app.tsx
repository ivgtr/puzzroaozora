import "@/styles/globals.css";
import type { AppProps } from "next/app";
import Head from "next/head";

const SITE_NAME = "青空パズル";
const SITE_DESCRIPTION =
  "青空文庫の文学作品から抜粋した一節を並び替えるワードパズルゲーム";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>{SITE_NAME}</title>
        <meta name="description" content={SITE_DESCRIPTION} />
        <meta property="og:title" content={SITE_NAME} />
        <meta property="og:description" content={SITE_DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={SITE_NAME} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={SITE_NAME} />
        <meta name="twitter:description" content={SITE_DESCRIPTION} />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
