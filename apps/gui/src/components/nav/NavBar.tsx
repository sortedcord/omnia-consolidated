"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/play", label: "Play" },
  { href: "/config", label: "Config" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="navbar">
      <Link href="/" className="nav-brand">
        Omnia
      </Link>
      <div className="nav-links">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={pathname === link.href ? "nav-link active" : "nav-link"}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <style>{`
        .navbar {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #e5e7eb;
          background: #fff;
        }
        .nav-brand {
          font-weight: 700;
          font-size: 1rem;
          color: #111;
          text-decoration: none;
        }
        .nav-links {
          display: flex;
          gap: 0.5rem;
        }
        .nav-link {
          padding: 0.25rem 0.75rem;
          border-radius: 4px;
          font-size: 0.875rem;
          color: #555;
          text-decoration: none;
        }
        .nav-link:hover {
          background: #f3f4f6;
          color: #111;
        }
        .nav-link.active {
          background: #eff6ff;
          color: #2563eb;
          font-weight: 500;
        }
      `}</style>
    </nav>
  );
}
