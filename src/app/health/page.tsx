"use client";

import { useState, useEffect } from "react";
import { MOCK_BUSES, BusTelemetry } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export default function HealthPage() {
  const [buses, setBuses] = useState<BusTelemetry[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    setBuses(MOCK_BUSES);
    // Simulate minor fluctuations in telemetry
    const interval = setInterval(() => {
      setBuses((current) =>
        current.map((bus) => ({
          ...bus,
          effective_fps: bus.status === 'ACTIVE' ? Math.max(0, bus.effective_fps + (Math.random() - 0.5) * 2) : 0,
          mean_latency_ms: bus.status === 'ACTIVE' ? Math.max(10, bus.mean_latency_ms + (Math.random() - 0.5) * 5) : 0,
        }))
      );
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  if (!isMounted) return null;

  return (
    <div className="w-full h-full bg-base-900 p-6 overflow-y-auto">
      <header className="mb-8 border-b border-base-700 pb-4 flex justify-between items-end">
        <div>
          <h1 className="font-sans font-bold text-xl tracking-widest text-base-100">FLEET_HEALTH</h1>
          <div className="font-mono text-xs text-base-500 mt-1">NODE_STATUS | EDGE_INFERENCE_STATS</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] text-base-400">ACTIVE_NODES: {buses.filter(b => b.status === 'ACTIVE').length}/{buses.length}</div>
          <div className="font-mono text-[10px] text-severity-critical animate-pulse mt-1">OFFLINE: {buses.filter(b => b.status === 'OFFLINE').length}</div>
        </div>
      </header>

      <div className="border border-base-700 bg-base-800 rounded-sm overflow-hidden">
        <table className="w-full text-left font-mono text-xs">
          <thead className="bg-base-900 border-b border-base-700 text-base-400 text-[10px] uppercase tracking-wider">
            <tr>
              <th className="p-3 font-normal">NODE_ID</th>
              <th className="p-3 font-normal">ROUTE</th>
              <th className="p-3 font-normal">STATUS</th>
              <th className="p-3 font-normal text-right">EFF_FPS</th>
              <th className="p-3 font-normal text-right">LATENCY(MS)</th>
              <th className="p-3 font-normal">THERMAL</th>
              <th className="p-3 font-normal">PROVIDER</th>
              <th className="p-3 font-normal text-right">Q_DEPTH</th>
              <th className="p-3 font-normal">LAST_SYNC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-base-700/50">
            {buses.map((bus) => (
              <tr key={bus.id} className="hover:bg-base-700/30 transition-colors">
                <td className="p-3 text-base-200 font-bold">{bus.id}</td>
                <td className="p-3 text-base-400">{bus.route}</td>
                <td className="p-3">
                  <span className={cn(
                    "px-1.5 py-0.5 text-[9px] border",
                    bus.status === 'ACTIVE' ? "bg-severity-success/10 text-severity-success border-severity-success/30" : 
                    bus.status === 'OFFLINE' ? "bg-severity-critical/10 text-severity-critical border-severity-critical/30" :
                    "bg-severity-warning/10 text-severity-warning border-severity-warning/30"
                  )}>
                    {bus.status}
                  </span>
                </td>
                <td className={cn(
                  "p-3 text-right",
                  bus.effective_fps < 15 ? "text-severity-warning" : "text-base-300"
                )}>
                  {bus.effective_fps.toFixed(1)}
                </td>
                <td className={cn(
                  "p-3 text-right",
                  bus.mean_latency_ms > 50 ? "text-severity-warning" : "text-base-300"
                )}>
                  {Math.round(bus.mean_latency_ms)}
                </td>
                <td className="p-3">
                  <span className={cn(
                    bus.thermal_status === 'critical' ? "text-severity-critical" :
                    bus.thermal_status === 'elevated' ? "text-severity-warning" : "text-base-500"
                  )}>
                    {bus.thermal_status.toUpperCase()}
                  </span>
                </td>
                <td className="p-3 text-base-400">{bus.provider}</td>
                <td className={cn(
                  "p-3 text-right",
                  bus.queue_depth > 50 ? "text-severity-critical" : 
                  bus.queue_depth > 10 ? "text-severity-warning" : "text-base-500"
                )}>
                  {bus.queue_depth}
                </td>
                <td className="p-3 text-[10px] text-base-500">
                  {new Date(bus.last_sync).toLocaleTimeString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
