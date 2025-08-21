import { Geist, Geist_Mono } from "next/font/google";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function Home() {
  return (
    <div
      className={`${geistSans.variable} ${geistMono.variable} min-h-screen flex items-center justify-center`}
    >
      <main className="text-center">
        <h1 className="text-4xl font-bold mb-4">
          Aozora Puzzle
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Next.jsアプリケーションの開発を開始してください
        </p>
      </main>
    </div>
  );
}
