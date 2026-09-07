"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { INITIAL_EVENTS, SapseedEvent, generateMockEvents } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { AlertCircle, Camera, Crosshair, MapPin, Search } from "lucide-react";

// Dynamically import the map component with SSR disabled
const FleetMap = dynamic(() => import("@/components/map"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-base-900 text-base-500 font-mono">
      INITIALIZING MAP_LAYER...
    </div>
  ),
});

export default function Home() {
  const [events, setEvents] = useState<SapseedEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<SapseedEvent | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Simulate incoming live events
  useEffect(() => {
    setIsMounted(true);
    setEvents(INITIAL_EVENTS);
    const interval = setInterval(() => {
      const newEvents = generateMockEvents(1);
      setEvents((current) => [...newEvents, ...current].slice(0, 100)); // keep last 100
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!isMounted) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-base-900 text-base-500 font-mono">
        INITIALIZING_SYSTEM...
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-row relative">
      {/* MAP LAYER */}
      <div className="flex-1 h-full relative z-0">
        <FleetMap events={events} onEventClick={setSelectedEvent} />
      </div>

      {/* LIVE EVENT FEED (SIDEBAR) */}
      <div className="w-80 h-full bg-base-900/95 border-l border-base-700 flex flex-col z-10 backdrop-blur-sm">
        <div className="p-4 border-b border-base-700 flex justify-between items-center bg-base-800/50">
          <div>
            <h2 className="font-sans font-bold text-sm text-base-200 tracking-wider">
              LIVE TELEMETRY
            </h2>
            <div className="text-[10px] font-mono text-base-500 mt-1">
              SYS_STAT: NOMINAL | Q_DEPTH: 14
            </div>
          </div>
          <div className="flex gap-2">
            <Search className="w-4 h-4 text-base-400" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-2 flex flex-col gap-2">
          {events.map((evt) => (
            <div
              key={evt.id}
              onClick={() => setSelectedEvent(evt)}
              className={cn(
                "p-3 rounded-sm border cursor-pointer hover:bg-base-800 transition-colors group",
                evt.severity === "critical"
                  ? "border-severity-critical/30 bg-severity-critical/5"
                  : evt.severity === "warning"
                  ? "border-severity-warning/30 bg-severity-warning/5"
                  : "border-base-700 bg-base-800/30"
              )}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="font-mono text-[10px] text-base-400">
                  {new Date(evt.timestamp).toLocaleTimeString("en-US", {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </div>
                <div className="font-mono text-[10px] text-base-400">{evt.bus_id}</div>
              </div>
              <div className="font-sans font-semibold text-sm text-base-200 uppercase mb-1 flex items-center gap-2">
                {evt.severity === "critical" && (
                  <AlertCircle className="w-3 h-3 text-severity-critical" />
                )}
                {evt.label.replace("_", " ")}
              </div>
              <div className="flex justify-between items-end mt-3">
                <div className="font-mono text-[11px] text-base-300">
                  CONF: {(evt.confidence * 100).toFixed(1)}%
                </div>
                <div className="font-mono text-[9px] text-base-500">
                  {evt.provider}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* EVENT DETAIL PANEL OVERLAY */}
      {selectedEvent && (
        <div className="absolute top-4 left-4 w-96 bg-base-900 border border-base-700 shadow-2xl z-50 flex flex-col rounded-sm overflow-hidden animate-in fade-in slide-in-from-left-4 duration-200">
          <div className="p-3 border-b border-base-700 bg-base-800 flex justify-between items-center">
            <span className="font-sans font-bold text-sm tracking-wider text-base-200">
              INCIDENT_REPORT
            </span>
            <button
              onClick={() => setSelectedEvent(null)}
              className="text-base-400 hover:text-base-100 p-1"
            >
              &times;
            </button>
          </div>
          
          <div className="relative w-full aspect-video bg-black border-b border-base-700 overflow-hidden">
            {/* Mock evidence photo */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={selectedEvent.jpeg_url} 
              alt="Evidence" 
              className="w-full h-full object-cover opacity-80 mix-blend-luminosity grayscale"
            />
            {/* Bounding box overlay (mocked) */}
            <div className="absolute top-[30%] left-[40%] w-[20%] h-[30%] border-2 border-accent shadow-[0_0_8px_#00ffcc_inset,0_0_8px_#00ffcc]">
              <div className="absolute -top-5 left-0 bg-accent text-black font-mono text-[9px] px-1 font-bold">
                {selectedEvent.label} {(selectedEvent.confidence * 100).toFixed(0)}%
              </div>
              <Crosshair className="w-full h-full text-accent opacity-30" strokeWidth={0.5} />
            </div>
            {/* Overlays */}
            <div className="absolute bottom-2 left-2 flex gap-2">
              <span className="bg-black/80 px-1 text-accent font-mono text-[9px] border border-accent/30 flex items-center gap-1">
                <Camera className="w-3 h-3" /> CAM_01
              </span>
              <span className="bg-black/80 px-1 text-base-300 font-mono text-[9px] border border-base-600">
                {selectedEvent.bus_id}
              </span>
            </div>
          </div>

          <div className="p-4 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[9px] font-mono text-base-500 mb-1">TYPE</div>
                <div className="font-sans font-semibold text-sm uppercase text-base-100">
                  {selectedEvent.label.replace("_", " ")}
                </div>
              </div>
              <div>
                <div className="text-[9px] font-mono text-base-500 mb-1">SEVERITY</div>
                <div className={cn(
                  "font-sans font-semibold text-sm uppercase",
                  selectedEvent.severity === "critical" ? "text-severity-critical" : selectedEvent.severity === "warning" ? "text-severity-warning" : "text-base-300"
                )}>
                  {selectedEvent.severity}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-[9px] font-mono text-base-500 mb-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> LOCATION
                </div>
                <div className="font-mono text-xs text-base-300">
                  LAT: {selectedEvent.lat.toFixed(6)} <br/>
                  LNG: {selectedEvent.lng.toFixed(6)}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-2 pt-4 border-t border-base-700">
              <button className="flex-1 bg-accent/10 hover:bg-accent/20 text-accent border border-accent/50 py-2 font-sans text-xs font-bold tracking-wider transition-colors">
                CONFIRM
              </button>
              <button className="flex-1 bg-base-800 hover:bg-base-700 text-base-200 border border-base-600 py-2 font-sans text-xs font-bold tracking-wider transition-colors">
                DISMISS
              </button>
              {selectedEvent.severity === "critical" && (
                <button className="flex-1 bg-severity-critical/20 hover:bg-severity-critical/30 text-severity-critical border border-severity-critical/50 py-2 font-sans text-xs font-bold tracking-wider transition-colors">
                  ESCALATE
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
