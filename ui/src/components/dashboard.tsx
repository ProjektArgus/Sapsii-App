"use client";

import { ObservationFrame } from "@/components/observation-frame";
import type { DashboardData, Device, Issue, IssueDetails, Observation } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AlertCircle, BusFront, Columns3, Crosshair, MapPin, Radio, RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const FleetMap = dynamic(() => import("@/components/map"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-base-900 text-base-500 font-mono">
      INITIALIZING MAP_LAYER...
    </div>
  ),
});

type SidebarSection = "telemetry" | "fleets" | "issues";
type IssueStatus = Issue["status"];

const ISSUE_STATUSES: IssueStatus[] = ["candidate", "confirmed", "resolved", "dismissed"];

export function Dashboard({ data }: { data: DashboardData }) {
  const [dashboardData, setDashboardData] = useState(data);
  const [selectedIssue, setSelectedIssue] = useState<IssueDetails | null>(null);
  const [selectedMapObservation, setSelectedMapObservation] = useState<Observation | null>(null);
  const [devices, setDevices] = useState<Device[]>(data.devices);
  const [sidebarSection, setSidebarSection] = useState<SidebarSection>("telemetry");
  const [visibleIssueStatuses, setVisibleIssueStatuses] = useState<IssueStatus[]>(["candidate", "confirmed"]);
  const [selectedObservationId, setSelectedObservationId] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{ key: string; latitude: number; longitude: number; zoom?: number } | null>(null);
  const selectedDevice = devices.find((device) => device.id === selectedDeviceId);
  const visibleIssues = dashboardData.issues.filter((issue) => visibleIssueStatuses.includes(issue.status));

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const response = await fetch("/bff/dashboard", { cache: "no-store" });
        if (response.ok && !cancelled) setDashboardData(await response.json() as DashboardData);
      } finally {
        if (!cancelled) timer = setTimeout(poll, 10_000);
      }
    };
    timer = setTimeout(poll, 10_000);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const response = await fetch("/bff/devices", { cache: "no-store" });
        if (response.ok) {
          const body = await response.json() as { items: Device[] };
          if (!cancelled) setDevices(body.items);
        }
      } finally {
        if (!cancelled) timer = setTimeout(poll, 750);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const refreshNow = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const [dashboardResponse, devicesResponse] = await Promise.all([
        fetch("/bff/dashboard", { cache: "no-store" }),
        fetch("/bff/devices", { cache: "no-store" }),
      ]);
      if (dashboardResponse.ok) setDashboardData(await dashboardResponse.json() as DashboardData);
      if (devicesResponse.ok) setDevices((await devicesResponse.json() as { items: Device[] }).items);
    } finally {
      window.setTimeout(() => setIsRefreshing(false), 350);
    }
  };

  const chooseSection = (section: SidebarSection) => {
    setSidebarSection(section);
    setSelectedDeviceId(null);
    if (section !== "telemetry") setSelectedObservationId(null);
  };

  const openIssue = (issue: Issue) => {
    setSelectedMapObservation(null);
    setSelectedIssue({ ...issue, observations: [] });
    void fetch(`/bff/issues/${encodeURIComponent(issue.id)}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const details = await response.json() as IssueDetails;
      setSelectedIssue((current) => current?.id === details.id ? details : current);
    });
  };

  const openObservation = (observation: Observation) => {
    setSelectedIssue(null);
    setSelectedMapObservation(observation);
  };

  const pinnedObservation = selectedMapObservation ??
    selectedIssue?.observations.find((observation) => observation.evidenceIds.length > 0) ??
    selectedIssue?.observations[0] ?? null;

  return (
    <div className="w-full h-full flex flex-row relative">
      <div className="flex-1 h-full relative z-0">
        <FleetMap
          issues={visibleIssues}
          observations={dashboardData.observations}
          trafficMeasurements={dashboardData.trafficMeasurements}
          devices={devices}
          focusTarget={focusTarget}
          selectedDeviceId={selectedDeviceId}
          onIssueClick={openIssue}
          onObservationClick={openObservation}
        />
        {dashboardData.error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] bg-base-900/95 border border-severity-warning/50 px-4 py-2 font-mono text-xs text-severity-warning shadow-xl">
            API_OFFLINE: {dashboardData.error}
          </div>
        )}
      </div>

      <aside className="w-80 h-full bg-base-900/95 border-l border-base-700 flex flex-col z-10 backdrop-blur-sm">
        <div className="grid grid-cols-3 border-b border-base-700 bg-base-950/80">
          <button
            type="button"
            aria-pressed={sidebarSection === "telemetry"}
            onClick={() => chooseSection("telemetry")}
            className={cn(
              "flex items-center justify-center gap-2 px-2 py-3 border-r border-base-700 font-mono text-[10px] tracking-wider transition-colors",
              sidebarSection === "telemetry" ? "bg-accent/10 text-accent" : "text-base-500 hover:text-base-200 hover:bg-base-800/60",
            )}
          >
            <Radio className="w-3.5 h-3.5" /> TELEMETRY
          </button>
          <button
            type="button"
            aria-pressed={sidebarSection === "fleets"}
            onClick={() => chooseSection("fleets")}
            className={cn(
              "flex items-center justify-center gap-1 px-1 py-3 border-r border-base-700 font-mono text-[9px] tracking-wider transition-colors",
              sidebarSection === "fleets" ? "bg-accent/10 text-accent" : "text-base-500 hover:text-base-200 hover:bg-base-800/60",
            )}
          >
            <BusFront className="w-3.5 h-3.5" /> FLEETS
          </button>
          <button
            type="button"
            aria-pressed={sidebarSection === "issues"}
            onClick={() => chooseSection("issues")}
            className={cn(
              "flex items-center justify-center gap-1 px-1 py-3 font-mono text-[9px] tracking-wider transition-colors",
              sidebarSection === "issues" ? "bg-accent/10 text-accent" : "text-base-500 hover:text-base-200 hover:bg-base-800/60",
            )}
          >
            <Columns3 className="w-3.5 h-3.5" /> ISSUES
          </button>
        </div>

        <div className="p-4 border-b border-base-700 bg-base-800/50">
          <div className="flex justify-between items-center">
            <h2 className="font-sans font-bold text-sm text-base-200 tracking-wider">
              {sidebarSection === "telemetry" ? "LIVE TELEMETRY" : sidebarSection === "fleets" ? "PUBLIC FLEETS" : "ISSUE KANBAN"}
            </h2>
            <button
              type="button"
              onClick={() => void refreshNow()}
              disabled={isRefreshing}
              className="rounded-sm p-1 text-base-500 transition-colors hover:bg-base-700 hover:text-accent disabled:text-accent"
              aria-label={isRefreshing ? "Refreshing dashboard" : "Refresh dashboard"}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            </button>
          </div>
          {sidebarSection === "issues" ? (
            <div className="text-[10px] font-mono text-base-500 mt-1">
              RECONCILED: {dashboardData.issues.length} | MAP: {visibleIssues.length}
            </div>
          ) : (
            <>
              <div className="text-[10px] font-mono text-base-500 mt-1">
                DEVICES: {dashboardData.summary.activeDevices} ONLINE / {dashboardData.summary.offlineDevices} OFFLINE
              </div>
              <div className="text-[10px] font-mono text-base-500 mt-0.5">
                {sidebarSection === "telemetry"
                  ? `OBS_24H: ${dashboardData.summary.observationsLast24Hours} | ISSUES: ${dashboardData.summary.confirmedIssues}`
                  : `FLEET_UNITS: ${devices.length} | SELECT TO TRACK`}
              </div>
            </>
          )}
          {sidebarSection === "fleets" && selectedDevice && (
            <div className="text-[10px] font-mono text-accent mt-1 animate-pulse">
              TRACKING: {selectedDevice.instanceExternalId ?? selectedDevice.busExternalId ?? selectedDevice.externalId}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-2 flex flex-col gap-2">
          {sidebarSection === "telemetry" ? (
            <>
              {dashboardData.observations.length === 0 && (
                <div className="p-4 border border-base-700 text-base-500 font-mono text-xs">
                  {dashboardData.configured ? "NO_OBSERVATIONS" : "API_NOT_CONFIGURED"}
                </div>
              )}
              {dashboardData.observations.map((observation) => (
                <article
                  key={observation.id}
                  className={cn(
                    "w-full shrink-0 overflow-hidden rounded-sm border bg-base-800/30 transition-colors",
                    selectedObservationId === observation.id ? "border-accent/80 bg-accent/10" : "border-base-700 hover:border-accent/50 hover:bg-base-800/70",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedObservationId(observation.id);
                      setSelectedDeviceId(null);
                      openObservation(observation);
                      setFocusTarget({ key: `${observation.id}-${Date.now()}`, latitude: observation.latitude, longitude: observation.longitude, zoom: 17 });
                    }}
                    className="w-full p-3 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent"
                    aria-label={`Show ${observation.className.replaceAll("_", " ")} on map`}
                  >
                    <div className="mb-2 flex items-start justify-between">
                      <div className="font-mono text-[10px] text-base-400">
                        {new Date(observation.capturedAt).toLocaleTimeString("en-US", { hour12: false })}
                      </div>
                      <div className="font-mono text-[10px] text-base-400">
                        {devices.find((device) => device.provisionedDeviceId === observation.deviceId)?.busExternalId ?? observation.deviceId.slice(0, 8)}
                      </div>
                    </div>
                    <div className="mb-1 flex items-center gap-2 font-sans text-sm font-semibold uppercase text-base-200">
                      {observation.confidence >= 0.9 && <AlertCircle className="h-3 w-3 text-severity-warning" />}
                      {observation.className.replaceAll("_", " ")}
                    </div>
                    <div className="mt-3 flex items-end justify-between">
                      <div className="font-mono text-[11px] text-base-300">CONF: {(observation.confidence * 100).toFixed(1)}%</div>
                      <div className="font-mono text-[9px] text-base-500">{observation.cameraId}</div>
                    </div>
                  </button>
                </article>
              ))}
            </>
          ) : sidebarSection === "fleets" ? (
            <>
              {devices.length === 0 && <div className="p-4 border border-base-700 text-base-500 font-mono text-xs">NO_FLEET_UNITS</div>}
              {devices.map((device) => {
                const hasPosition = device.lastLatitude !== null && device.lastLongitude !== null;
                const displayName = device.instanceExternalId ?? device.busExternalId ?? device.displayName ?? device.externalId;
                const presenceLabel = device.status === "active" ? (device.online ? "online" : "stale") : device.status;
                return (
                  <button
                    type="button"
                    key={device.id}
                    disabled={!hasPosition}
                    onClick={() => {
                      setSelectedDeviceId(device.id);
                      setSelectedObservationId(null);
                      setFocusTarget(null);
                    }}
                    className={cn(
                      "w-full text-left p-3 rounded-sm border bg-base-800/30 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-not-allowed",
                      selectedDeviceId === device.id
                        ? "border-accent/80 bg-accent/10"
                        : device.online
                          ? "border-base-700 hover:border-accent/50 hover:bg-base-800/70"
                          : "border-severity-critical/45 bg-severity-critical/10 hover:border-severity-critical/70",
                    )}
                    aria-label={hasPosition ? `Track ${displayName} on map` : `${displayName} has no current position`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-sans font-semibold text-sm text-base-200">{displayName}</div>
                        <div className="font-mono text-[9px] text-base-500 mt-1">PROVISIONED: {device.externalId}</div>
                      </div>
                      <span className={cn("font-mono text-[9px] uppercase", device.online ? "text-accent" : "text-severity-critical")}>
                        {presenceLabel}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 font-mono text-[10px]">
                      <div className="text-base-500">ROUTE <span className="text-base-300">{device.routeCode ?? "--"}</span></div>
                      <div className="text-base-500 text-right">SPEED <span className="text-base-300">{device.speedMetersPerSecond === null ? "--" : `${(device.speedMetersPerSecond * 3.6).toFixed(1)} km/h`}</span></div>
                      <div className="col-span-2 text-base-500">GPS <span className={hasPosition ? "text-base-300" : "text-severity-warning"}>{hasPosition ? `±${device.positionAccuracyMeters?.toFixed(1) ?? "--"}m` : "NO POSITION"}</span></div>
                    </div>
                  </button>
                );
              })}
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-1">
                {ISSUE_STATUSES.map((status) => {
                  const active = visibleIssueStatuses.includes(status);
                  const count = dashboardData.issues.filter((issue) => issue.status === status).length;
                  return (
                    <button
                      key={status}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setVisibleIssueStatuses((current) =>
                        current.includes(status) ? current.filter((item) => item !== status) : [...current, status]
                      )}
                      className={cn(
                        "flex items-center justify-between border px-2 py-2 font-mono text-[9px] uppercase transition-colors",
                        active ? "border-accent/70 bg-accent/10 text-accent" : "border-base-700 text-base-500 hover:border-base-500",
                      )}
                    >
                      <span>{status}</span><span>{count}</span>
                    </button>
                  );
                })}
              </div>
              {visibleIssues.length === 0 && (
                <div className="p-4 border border-base-700 text-base-500 font-mono text-xs">NO_ISSUES_IN_FILTER</div>
              )}
              {visibleIssues.map((issue) => (
                <button
                  key={issue.id}
                  type="button"
                  onClick={() => {
                    openIssue(issue);
                    setSelectedDeviceId(null);
                    setFocusTarget({ key: `${issue.id}-${Date.now()}`, latitude: issue.latitude, longitude: issue.longitude, zoom: 17 });
                  }}
                  className="w-full shrink-0 rounded-sm border border-base-700 bg-base-800/30 p-3 text-left transition-colors hover:border-accent/60 hover:bg-base-800/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-sans text-xs font-semibold uppercase text-base-200">{issue.issueType.replaceAll("_", " ")}</span>
                    <span className={cn(
                      "font-mono text-[8px] uppercase",
                      issue.status === "confirmed" ? "text-accent" : issue.status === "candidate" ? "text-severity-warning" : "text-base-500",
                    )}>{issue.status}</span>
                  </div>
                  <div className="mt-2 flex justify-between font-mono text-[9px] text-base-500">
                    <span>{issue.observationCount} sightings / {issue.independentDeviceCount} devices</span>
                    <span>{issue.severity}</span>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </aside>

      {(selectedIssue || selectedMapObservation) && (
        <div className="absolute top-4 left-4 w-96 bg-base-900 border border-base-700 shadow-2xl z-[600] rounded-sm overflow-hidden">
          <div className="p-3 border-b border-base-700 bg-base-800 flex justify-between items-center">
            <span className="font-sans font-bold text-sm tracking-wider text-base-200">
              {selectedIssue ? "INFRASTRUCTURE_ISSUE" : "RAW_OBSERVATION"}
            </span>
            <button
              onClick={() => { setSelectedIssue(null); setSelectedMapObservation(null); }}
              className="text-base-400 hover:text-base-100 p-1"
              aria-label="Close"
            >
              &times;
            </button>
          </div>
          {pinnedObservation ? (
            <ObservationFrame
              observation={pinnedObservation}
              compact
              missingFallback={<Crosshair className="w-12 h-12 text-accent opacity-40" strokeWidth={0.7} />}
            />
          ) : (
            <div className="relative h-24 bg-black/60 border-b border-base-700 flex items-center justify-center">
              <Crosshair className="w-12 h-12 text-accent opacity-40" strokeWidth={0.7} />
            </div>
          )}
          <div className="p-4 grid grid-cols-2 gap-4">
            <div>
              <div className="text-[9px] font-mono text-base-500 mb-1">TYPE</div>
              <div className="font-sans font-semibold text-sm uppercase text-base-100">
                {(selectedIssue?.issueType ?? selectedMapObservation!.className).replaceAll("_", " ")}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-mono text-base-500 mb-1">
                {selectedIssue ? "STATUS / SEVERITY" : "CONFIDENCE"}
              </div>
              {selectedIssue ? (
                <div className={cn("font-sans font-semibold text-sm uppercase", selectedIssue.severity === "critical" ? "text-severity-critical" : "text-severity-warning")}>
                  {selectedIssue.status} / {selectedIssue.severity}
                </div>
              ) : (
                <div className="font-mono text-xs text-base-300">{(selectedMapObservation!.confidence * 100).toFixed(1)}%</div>
              )}
            </div>
            <div>
              <div className="text-[9px] font-mono text-base-500 mb-1">{selectedIssue ? "SIGHTINGS" : "CAMERA"}</div>
              <div className="font-mono text-xs text-base-300">
                {selectedIssue
                  ? `${selectedIssue.observationCount} (${selectedIssue.independentDeviceCount} devices)`
                  : selectedMapObservation!.cameraId}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-mono text-base-500 mb-1">{selectedIssue ? "LAST SEEN" : "CAPTURED"}</div>
              <div className="font-mono text-xs text-base-300">
                {new Date(selectedIssue?.lastSeenAt ?? selectedMapObservation!.capturedAt).toLocaleString()}
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-[9px] font-mono text-base-500 mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> LOCATION</div>
              <div className="font-mono text-xs text-base-300">
                LAT: {(selectedIssue?.latitude ?? selectedMapObservation!.latitude).toFixed(6)}<br />
                LNG: {(selectedIssue?.longitude ?? selectedMapObservation!.longitude).toFixed(6)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
