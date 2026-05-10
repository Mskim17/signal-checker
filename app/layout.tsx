import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signal Checker | 통신 속도 기록",
  description: "GPS 위치 기반 인터넷 속도 측정 및 음영지역 기록",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <body>{children}</body>
    </html>
  );
}