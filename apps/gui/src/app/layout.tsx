"use client";

import { useEffect, type ReactNode } from "react";
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
  { href: "/builder", label: "Builder" },
  { href: "/config", label: "Config" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    document.title = "Omnia";
  }, []);

  return (
    <html lang="en">
      <body
        className={`${jersey25.variable} ${jetbrainsMono.variable} ${spaceMono.variable} flex flex-col h-dvh overflow-hidden bg-background text-foreground font-sans`}
      >
        {!pathname?.startsWith("/play") && (
          <video
            className="fixed inset-0 w-full h-full object-cover pointer-events-none"
            src="/output.webm"
            poster="/background.png"
            autoPlay
            loop
            muted
            playsInline
          />
        )}
        <nav className="border-b border-dotted border-border/20 bg-secondary/30 shrink-0">
          <div className="mx-auto max-w-[800px] px-10 py-3 flex items-center justify-center">
            <NavigationMenu viewport={false}>
              <NavigationMenuList>
                {links.map((link) => {
                  const isActive =
                    pathname === link.href ||
                    (link.href !== "/" && pathname?.startsWith(link.href));
                  return (
                    <NavigationMenuItem key={link.href}>
                      <NavigationMenuLink asChild active={isActive}>
                        <Link
                          href={link.href}
                          className={`text-foreground no-underline font-medium text-sm p-2 transition-all outline-none ${
                            isActive
                              ? "bg-primary/15 text-primary"
                              : "hover:bg-secondary hover:text-foreground"
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
        <main className="flex-1 flex flex-col min-h-0">{children}</main>
      </body>
    </html>
  );
}
