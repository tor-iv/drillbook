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
        <div className="mx-auto max-w-lg px-4 pb-24 pt-4 pl-14">
          {children}
          {/* Visible from every page incl. the public login page — A2P
              vetting must find the privacy policy from the site root. */}
          <footer className="mt-10 pb-2 text-xs text-pencil">
            <a href="/privacy" className="underline">
              Privacy Policy
            </a>
            {" · "}
            <a href="/terms" className="underline">
              Terms of Service
            </a>
            {" · SMS: reply STOP to opt out, HELP for help"}
          </footer>
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
