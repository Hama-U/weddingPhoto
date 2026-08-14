import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "みんなのウェディングフォト",
  description: "結婚式の写真をみんなで共有するページ",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
