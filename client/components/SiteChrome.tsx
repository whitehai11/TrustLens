"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SupportChat } from "@/components/SupportChat";

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminPage = pathname?.startsWith("/admin");

  return (
    <>
      <Navbar />
      {children}
      {!isAdminPage && <Footer />}
      {!isAdminPage && <SupportChat />}
    </>
  );
}
