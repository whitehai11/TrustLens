import type { Metadata } from "next";
import "./globals.css";
import { SiteChrome } from "@/components/SiteChrome";

export const metadata: Metadata = {
  title: "TrustLens Project",
  description: "Transparent domain risk intelligence"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
