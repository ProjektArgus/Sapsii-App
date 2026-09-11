"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Map, Activity, Server, LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: Map, label: "MAP" },
  { href: "/analytics", icon: Activity, label: "ANALYTICS" },
  { href: "/health", icon: Server, label: "HEALTH" },
];

export function Sidebar({ authenticationEnabled = false }: { authenticationEnabled?: boolean }) {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <aside className="w-16 h-full flex flex-col items-center py-4 bg-base-800 border-r border-base-700 shrink-0">
      <div className="mb-8" title="Sapsii — Argus urban sentinel">
        <Image src="/argus-mark.svg" width={36} height={36} alt="Sapsii" priority />
      </div>
      <nav className="flex-1 flex flex-col gap-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "w-12 h-12 flex flex-col items-center justify-center rounded-sm transition-colors group",
                isActive
                  ? "bg-base-700 text-accent"
                  : "text-base-400 hover:text-base-100 hover:bg-base-700/50"
              )}
              title={item.label}
            >
              <item.icon className="w-5 h-5" strokeWidth={1.5} />
              <span className="text-[9px] mt-1 font-sans font-bold tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col items-center gap-3">
        {authenticationEnabled && (
          <form action={logout}>
            <button type="submit" className="flex h-9 w-9 items-center justify-center text-base-500 hover:bg-base-700/50 hover:text-base-100" title="SIGN_OUT">
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        )}
        <div className="flex flex-col items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-severity-success animate-pulse" />
          <span className="text-[10px] font-mono text-base-500">LIVE</span>
        </div>
      </div>
    </aside>
  );
}
