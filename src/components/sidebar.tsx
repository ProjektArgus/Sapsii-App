"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Map, Activity, Server, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: Map, label: "MAP" },
  { href: "/analytics", icon: Activity, label: "ANALYTICS" },
  { href: "/health", icon: Server, label: "HEALTH" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-16 h-full flex flex-col items-center py-4 bg-base-800 border-r border-base-700 shrink-0">
      <div className="mb-8 text-accent">
        <AlertTriangle className="w-8 h-8" />
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
      <div className="mt-auto flex flex-col items-center gap-1">
        <div className="w-2 h-2 rounded-full bg-severity-success animate-pulse" />
        <span className="text-[10px] font-mono text-base-500">LIVE</span>
      </div>
    </aside>
  );
}
