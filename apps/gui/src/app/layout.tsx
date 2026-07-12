"use client";

import type { ReactNode } from "react";
import { Archivo_Black, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "./globals.css";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from "@/components/ui/navigation-menu";

const archivoBlack = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-head",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const links = [
  { href: "/", label: "Home" },
  { href: "/play", label: "Play" },
  { href: "/config", label: "Config" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <html lang="en">
      <body className={`${archivoBlack.variable} ${spaceGrotesk.variable} min-h-dvh bg-background text-foreground font-sans`}>
        <nav className="flex items-center gap-4 border-b-2 px-4 py-3">
          <Link href="/" className="font-head text-base font-bold no-underline text-foreground">
            Omnia
          </Link>
          <NavigationMenu viewport={false}>
            <NavigationMenuList>
              {links.map((link) => (
                <NavigationMenuItem key={link.href}>
                  <NavigationMenuLink asChild active={pathname === link.href}>
                    <Link href={link.href}>{link.label}</Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        </nav>
        {children}
      </body>
    </html>
  );
}
