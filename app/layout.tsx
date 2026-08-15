import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "みんなのウェディングフォト",
  description: "結婚式で撮った写真や動画を新郎新婦へ送るページ",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
