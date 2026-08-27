import type { Metadata, Viewport } from "next";
import { Staatliches, Permanent_Marker } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/bottom-nav";

const staatliches = Staatliches({ weight: "400", subsets: ["latin"], variable: "--font-staatliches" });
const marker = Permanent_Marker({ weight: "400", subsets: ["latin"], variable: "--font-marker" });

export const metadata: Metadata = {
  title: "Drillbook",
  description: "Daily drills, logged. No excuses.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Drillbook" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#f7f4ec",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${staatliches.variable} ${marker.variable}`}>
      <body className="paper min-h-dvh">
        <div className="mx-auto max-w-lg px-4 pb-24 pt-4 pl-14">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}
