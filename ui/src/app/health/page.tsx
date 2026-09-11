import { getDashboardData } from "@/lib/api";
import { cn } from "@/lib/utils";
import { connection } from "next/server";

const healthNumber = (health: Record<string, unknown>, key: string): number | null =>
  typeof health[key] === "number" ? health[key] : null;
const healthString = (health: Record<string, unknown>, key: string): string | null =>
  typeof health[key] === "string" ? health[key] : null;

export default async function HealthPage() {
  await connection();
  const data = await getDashboardData();
  return (
    <div className="w-full h-full bg-base-900 p-6 overflow-y-auto">
      <header className="mb-8 border-b border-base-700 pb-4 flex justify-between items-end">
        <div><h1 className="font-sans font-bold text-xl tracking-widest text-base-100">FLEET_HEALTH</h1><div className="font-mono text-xs text-base-500 mt-1">DEVICE_STATUS | EDGE_REPORTED_HEALTH</div></div>
        <div className="text-right"><div className="font-mono text-[10px] text-base-400">ACTIVE_NODES: {data.summary.activeDevices}/{data.devices.length}</div><div className="font-mono text-[10px] text-severity-critical mt-1">OFFLINE: {data.summary.offlineDevices}</div></div>
      </header>
      {data.error && <div className="mb-6 border border-severity-warning/50 p-3 font-mono text-xs text-severity-warning">API_OFFLINE: {data.error}</div>}
      <div className="border border-base-700 bg-base-800 rounded-sm overflow-hidden">
        <table className="w-full text-left font-mono text-xs">
          <thead className="bg-base-900 border-b border-base-700 text-base-400 text-[10px] uppercase tracking-wider"><tr><th className="p-3 font-normal">NODE_ID</th><th className="p-3 font-normal">STATUS</th><th className="p-3 font-normal">BUS</th><th className="p-3 font-normal text-right">EFF_FPS</th><th className="p-3 font-normal text-right">LATENCY(MS)</th><th className="p-3 font-normal">THERMAL</th><th className="p-3 font-normal">EDGE / MODEL</th><th className="p-3 font-normal text-right">Q_DEPTH</th><th className="p-3 font-normal">LAST_SYNC</th></tr></thead>
          <tbody className="divide-y divide-base-700/50">
            {data.devices.map((device) => {
              const fps = healthNumber(device.health, "effectiveFps");
              const latency = healthNumber(device.health, "meanLatencyMs");
              const queueDepth = healthNumber(device.health, "queueDepth");
              const thermal = healthString(device.health, "thermalStatus");
              return <tr key={device.id} className="hover:bg-base-700/30"><td className="p-3 text-base-200 font-bold">{device.displayName ?? device.externalId}</td><td className="p-3"><span className={cn("px-1.5 py-0.5 text-[9px] border", device.status === "active" ? "text-severity-success border-severity-success/30" : "text-severity-critical border-severity-critical/30")}>{device.status.toUpperCase()}</span></td><td className="p-3 text-base-400">{device.assignedBusId ?? "—"}</td><td className="p-3 text-right text-base-300">{fps?.toFixed(1) ?? "—"}</td><td className="p-3 text-right text-base-300">{latency?.toFixed(0) ?? "—"}</td><td className="p-3 text-base-400">{thermal?.toUpperCase() ?? "—"}</td><td className="p-3 text-base-400">{device.softwareVersion ?? "—"} / {device.modelVersion ?? "—"}</td><td className="p-3 text-right text-base-500">{queueDepth ?? "—"}</td><td className="p-3 text-[10px] text-base-500">{device.lastSeenAt ? new Date(device.lastSeenAt).toISOString() : "NEVER"}</td></tr>;
            })}
            {data.devices.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-base-500">NO_DEVICES</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
