import type { ReactNode } from "react";
import { NavBar } from "@/components/nav/NavBar";
import "./globals.css";

export const metadata = {
  title: "Omnia GUI",
  description: "Omnia Narrative Simulation Engine — Web Interface",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-[#fafafa] text-[#111]">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
