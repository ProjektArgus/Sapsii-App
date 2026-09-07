"use client";

import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area } from "recharts";
import { INITIAL_EVENTS } from "@/lib/mock-data";

const timeSeriesData = Array.from({ length: 24 }).map((_, i) => ({
  time: `${i.toString().padStart(2, '0')}:00`,
  incidents: Math.floor(Math.random() * 50) + 10,
  latency: Math.floor(Math.random() * 20) + 20,
}));

const categoryData = [
  { name: "POTHOLE", count: 142 },
  { name: "MISSING_CROSSING", count: 56 },
  { name: "WATERLOGGING", count: 23 },
  { name: "DAMAGED_SIGN", count: 89 },
  { name: "HIGH_DENSITY", count: 210 },
];

export default function AnalyticsPage() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  return (
    <div className="w-full h-full bg-base-900 p-6 overflow-y-auto">
      <header className="mb-8 border-b border-base-700 pb-4">
        <h1 className="font-sans font-bold text-xl tracking-widest text-base-100">SYSTEM_ANALYTICS</h1>
        <div className="font-mono text-xs text-base-500 mt-1">LAST_24_HOURS | ALL_ZONES</div>
      </header>

      <div className="grid grid-cols-2 gap-6">
        {/* Incident Volume over Time */}
        <div className="bg-base-800 border border-base-700 p-4 rounded-sm">
          <h2 className="font-sans font-semibold text-xs tracking-wider text-base-300 mb-4">INCIDENT_VOLUME (24H)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeSeriesData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis dataKey="time" stroke="#737373" fontSize={10} fontFamily="monospace" tickMargin={10} />
                <YAxis stroke="#737373" fontSize={10} fontFamily="monospace" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#171717', borderColor: '#262626', fontFamily: 'monospace', fontSize: '10px' }}
                  itemStyle={{ color: '#00ffcc' }}
                />
                <Area type="monotone" dataKey="incidents" stroke="#00ffcc" fill="#00ffcc" fillOpacity={0.1} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Incidents by Category */}
        <div className="bg-base-800 border border-base-700 p-4 rounded-sm">
          <h2 className="font-sans font-semibold text-xs tracking-wider text-base-300 mb-4">DETECTIONS_BY_CATEGORY</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" horizontal={false} />
                <XAxis type="number" stroke="#737373" fontSize={10} fontFamily="monospace" />
                <YAxis dataKey="name" type="category" stroke="#a3a3a3" fontSize={9} fontFamily="monospace" width={100} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#171717', borderColor: '#262626', fontFamily: 'monospace', fontSize: '10px' }}
                  itemStyle={{ color: '#00ffcc' }}
                  cursor={{ fill: '#262626' }}
                />
                <Bar dataKey="count" fill="#404040" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Mean Inference Latency */}
        <div className="bg-base-800 border border-base-700 p-4 rounded-sm col-span-2">
          <h2 className="font-sans font-semibold text-xs tracking-wider text-base-300 mb-4">MEAN_INFERENCE_LATENCY (MS)</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeSeriesData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis dataKey="time" stroke="#737373" fontSize={10} fontFamily="monospace" tickMargin={10} />
                <YAxis stroke="#737373" fontSize={10} fontFamily="monospace" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#171717', borderColor: '#262626', fontFamily: 'monospace', fontSize: '10px' }}
                  itemStyle={{ color: '#e5e5e5' }}
                />
                <Line type="stepAfter" dataKey="latency" stroke="#a3a3a3" strokeWidth={1} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
