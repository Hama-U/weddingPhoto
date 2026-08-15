import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yuki & Akari Wedding Photo Share",
  description: "みなさんがとった写真を新郎新婦にも見せてください！！",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
