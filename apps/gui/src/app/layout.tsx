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
  { href: "/config", label: "Config" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <html lang="en">
      <body className={`${jersey25.variable} ${jetbrainsMono.variable} ${spaceMono.variable} min-h-dvh bg-background text-foreground font-sans`}>
        <nav className="border-b border-dotted border-border/20 bg-secondary/30">
          <div className="mx-auto max-w-[800px] px-10 py-3 flex items-center justify-center">
            <NavigationMenu viewport={false}>
              <NavigationMenuList>
                {links.map((link) => {
                  const isActive = pathname === link.href || (link.href !== "/" && pathname?.startsWith(link.href));
                  return (
                    <NavigationMenuItem key={link.href}>
                      <NavigationMenuLink asChild active={isActive}>
                        <Link
                          href={link.href}
                          className={`text-foreground no-underline font-medium text-sm p-2 transition-all outline-none ${
                            isActive ? "bg-primary/15 text-primary" : "hover:bg-secondary hover:text-foreground"
                          }`}
                        >
                          {link.label}
                        </Link>
                      </NavigationMenuLink>
                    </NavigationMenuItem>
                  );
                })}
              </NavigationMenuList>
            </NavigationMenu>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
