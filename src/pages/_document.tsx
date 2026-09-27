import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  // Generated local unicode-range stylesheet; Next font subsetting would omit arbitrary imported works.
  // eslint-disable-next-line @next/next/no-css-tags
  return <Html lang="ja"><Head><link rel="stylesheet" href="/fonts/fonts.css" /></Head><body><Main /><NextScript /></body></Html>;
}
