"use client";

import type { DashboardData } from "@/lib/api";
import { useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function Analytics({ data }: { data: DashboardData }) {
  const { hourly, categories } = useMemo(() => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const buckets = Array.from({ length: 24 }, (_, index) => {
      const start = new Date(now.getTime() - (23 - index) * 60 * 60 * 1000);
      return { start, time: start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), observations: 0 };
    });
    const counts = new Map<string, number>();
    for (const observation of data.observations) {
      const timestamp = new Date(observation.capturedAt).getTime();
      const index = Math.floor((timestamp - buckets[0]!.start.getTime()) / (60 * 60 * 1000));
      if (index >= 0 && index < buckets.length) buckets[index]!.observations += 1;
      counts.set(observation.className, (counts.get(observation.className) ?? 0) + 1);
    }
    return {
      hourly: buckets.map(({ time, observations }) => ({ time, observations })),
      categories: [...counts.entries()].map(([name, count]) => ({ name: name.toUpperCase(), count })).sort((a, b) => b.count - a.count),
    };
  }, [data.observations]);

  return (
    <div className="w-full h-full bg-base-900 p-6 overflow-y-auto">
      <header className="mb-8 border-b border-base-700 pb-4">
        <h1 className="font-sans font-bold text-xl tracking-widest text-base-100">SYSTEM_ANALYTICS</h1>
        <div className="font-mono text-xs text-base-500 mt-1">LIVE API DATA | LAST_24_HOURS</div>
      </header>
      {data.error && <div className="mb-6 border border-severity-warning/50 p-3 font-mono text-xs text-severity-warning">API_OFFLINE: {data.error}</div>}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          ["OBSERVATIONS_24H", data.summary.observationsLast24Hours],
          ["CONFIRMED_ISSUES", data.summary.confirmedIssues],
          ["CANDIDATE_ISSUES", data.summary.candidateIssues],
          ["ACTIVE_DEVICES", data.summary.activeDevices],
        ].map(([label, value]) => (
          <div key={label} className="bg-base-800 border border-base-700 p-4"><div className="font-mono text-[10px] text-base-500">{label}</div><div className="font-sans text-2xl text-base-100 mt-2">{value}</div></div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-base-800 border border-base-700 p-4 rounded-sm">
          <h2 className="font-sans font-semibold text-xs tracking-wider text-base-300 mb-4">OBSERVATION_VOLUME (24H)</h2>
          <div className="h-64"><ResponsiveContainer width="100%" height="100%"><AreaChart data={hourly} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} /><XAxis dataKey="time" stroke="#737373" fontSize={10} /><YAxis stroke="#737373" fontSize={10} allowDecimals={false} /><Tooltip contentStyle={{ backgroundColor: "#171717", borderColor: "#262626", fontSize: "10px" }} /><Area type="monotone" dataKey="observations" stroke="#00ffcc" fill="#00ffcc" fillOpacity={0.1} /></AreaChart></ResponsiveContainer></div>
        </div>
        <div className="bg-base-800 border border-base-700 p-4 rounded-sm">
          <h2 className="font-sans font-semibold text-xs tracking-wider text-base-300 mb-4">DETECTIONS_BY_CLASS (RECENT 100)</h2>
          <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={categories} layout="vertical" margin={{ top: 5, right: 30, left: 55, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" stroke="#262626" horizontal={false} /><XAxis type="number" stroke="#737373" fontSize={10} allowDecimals={false} /><YAxis dataKey="name" type="category" stroke="#a3a3a3" fontSize={9} width={110} /><Tooltip contentStyle={{ backgroundColor: "#171717", borderColor: "#262626", fontSize: "10px" }} cursor={{ fill: "#262626" }} /><Bar dataKey="count" fill="#00ffcc" fillOpacity={0.45} /></BarChart></ResponsiveContainer></div>
        </div>
      </div>
    </div>
  );
}
