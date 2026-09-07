"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MOCK_BUSES, SapseedEvent, BusTelemetry } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Camera, MapPin, AlertCircle, Clock } from "lucide-react";

// Fix Leaflet default icon paths in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
  iconUrl: require("leaflet/dist/images/marker-icon.png"),
  shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
});

const customBusIcon = L.divIcon({
  className: "bg-transparent",
  html: `<div class="w-4 h-4 bg-accent border-2 border-base-900 rounded-full flex items-center justify-center shadow-[0_0_10px_#00ffcc]"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const severityColors = {
  critical: "#ef4444",
  warning: "#f59e0b",
  normal: "#9ca3af",
};

export default function FleetMap({
  events,
  onEventClick,
}: {
  events: SapseedEvent[];
  onEventClick: (event: SapseedEvent) => void;
}) {
  const [buses, setBuses] = useState<BusTelemetry[]>(MOCK_BUSES);

  // Animate buses slightly over time
  useEffect(() => {
    const interval = setInterval(() => {
      setBuses((current) =>
        current.map((bus) => ({
          ...bus,
          lat: bus.lat + (Math.random() - 0.5) * 0.001,
          lng: bus.lng + (Math.random() - 0.5) * 0.001,
        }))
      );
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <MapContainer
      center={[28.6139, 77.2090]}
      zoom={13}
      className="w-full h-full bg-base-900 z-0"
      zoomControl={false}
    >
      {/* 
        If you are using Mapbox, the URL looks like this:
        url={`https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${process.env.NEXT_PUBLIC_MAP_API_KEY}`}
        
        If you are using another API, replace the url below with your API's tile URL format.
      */}
      <TileLayer
        url={
          process.env.NEXT_PUBLIC_MAP_API_KEY && process.env.NEXT_PUBLIC_MAP_API_KEY !== ''
            ? process.env.NEXT_PUBLIC_MAP_API_KEY.startsWith('pk.')
              ? `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${process.env.NEXT_PUBLIC_MAP_API_KEY}`
              : `https://api.maptiler.com/maps/dataviz-dark/{z}/{x}/{y}.png?key=${process.env.NEXT_PUBLIC_MAP_API_KEY}`
            : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        }
        attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> | &copy; MapTiler / Mapbox'
      />

      {buses.map((bus) => (
        <Marker key={bus.id} position={[bus.lat, bus.lng]} icon={customBusIcon}>
          <Popup className="sapseed-popup">
            <div className="bg-base-800 text-base-100 p-2 font-mono text-xs w-48 rounded border border-base-700">
              <div className="font-sans font-bold text-accent mb-2">
                {bus.id} ({bus.route})
              </div>
              <div className="flex justify-between">
                <span className="text-base-400">FPS:</span>
                <span>{bus.effective_fps.toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-400">LATENCY:</span>
                <span>{bus.mean_latency_ms}ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-400">THERMAL:</span>
                <span className={bus.thermal_status === "critical" ? "text-severity-critical" : bus.thermal_status === "elevated" ? "text-severity-warning" : "text-severity-success"}>
                  {bus.thermal_status.toUpperCase()}
                </span>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}

      {events.map((event) => {
        const iconHtml = `<div class="w-3 h-3 rounded-sm border" style="background-color: ${severityColors[event.severity]}; border-color: ${severityColors[event.severity]}; box-shadow: 0 0 8px ${severityColors[event.severity]}40;"></div>`;
        const eventIcon = L.divIcon({
          className: "bg-transparent",
          html: iconHtml,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });

        return (
          <Marker
            key={event.id}
            position={[event.lat, event.lng]}
            icon={eventIcon}
            eventHandlers={{
              click: () => onEventClick(event),
            }}
          />
        );
      })}
    </MapContainer>
  );
}
