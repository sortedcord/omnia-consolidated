"use client";

import type { ReactNode } from "react";
import { Jersey_25, JetBrains_Mono, Space_Mono } from "next/font/google";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "./globals.css";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from "@/components/ui/navigation-menu";

const jersey25 = Jersey_25({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-head",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
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
      <body className={`${jersey25.variable} ${jetbrainsMono.variable} ${spaceMono.variable} min-h-dvh bg-background text-foreground font-sans`}>
        <nav className="border-b border-dotted border-border/20 bg-secondary/30">
          <div className="mx-auto max-w-[800px] px-10 py-3 flex items-center justify-center gap-8">
            <Link href="/" className="font-head text-headline-sm text-primary no-underline tracking-wide hover:opacity-85">
              Omnia
            </Link>
            <NavigationMenu viewport={false}>
              <NavigationMenuList>
                {links.map((link) => (
                  <NavigationMenuItem key={link.href}>
                    <NavigationMenuLink asChild active={pathname === link.href}>
                      <Link href={link.href} className="text-foreground no-underline font-medium text-sm">
                        {link.label}
                      </Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                ))}
              </NavigationMenuList>
            </NavigationMenu>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
