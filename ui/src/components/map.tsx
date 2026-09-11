"use client";

import type { Device, Issue, Observation, TrafficMeasurement } from "@/lib/api";
import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import { type GeoJSONSource, Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

export interface MapFocusTarget {
  key: string;
  latitude: number;
  longitude: number;
  zoom?: number;
}

setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const CARTO_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const defectClasses = new Set(["pothole", "longitudinal_crack", "transverse_crack", "alligator_crack", "damaged_road", "waterlogging", "manhole"]);

const dataPoints = (issues: Issue[], devices: Device[]): [number, number][] => [
  ...issues.map((issue) => [issue.longitude, issue.latitude] as [number, number]),
  ...devices.flatMap((device) =>
    device.lastLatitude === null || device.lastLongitude === null
      ? []
      : [[device.lastLongitude, device.lastLatitude] as [number, number]],
  ),
];

const boundsForPoints = (points: [number, number][]): [[number, number], [number, number]] => {
  let minLongitude = points[0]![0];
  let maxLongitude = minLongitude;
  let minLatitude = points[0]![1];
  let maxLatitude = minLatitude;
  for (const [longitude, latitude] of points.slice(1)) {
    minLongitude = Math.min(minLongitude, longitude);
    maxLongitude = Math.max(maxLongitude, longitude);
    minLatitude = Math.min(minLatitude, latitude);
    maxLatitude = Math.max(maxLatitude, latitude);
  }
  if (minLongitude === maxLongitude) { minLongitude -= 0.001; maxLongitude += 0.001; }
  if (minLatitude === maxLatitude) { minLatitude -= 0.001; maxLatitude += 0.001; }
  return [[minLongitude, minLatitude], [maxLongitude, maxLatitude]];
};

const pointCollection = <T extends Record<string, unknown>>(
  rows: Array<{ longitude: number; latitude: number; properties: T }>,
): FeatureCollection<Point, T> => ({
  type: "FeatureCollection",
  features: rows.map((row) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [row.longitude, row.latitude] },
    properties: row.properties,
  })),
});

const setSource = (map: MapLibreMap, id: string, data: FeatureCollection) =>
  (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);

export default function FleetMap({
  issues,
  observations,
  trafficMeasurements,
  devices,
  onIssueClick,
  onObservationClick,
  focusTarget,
  selectedDeviceId,
}: {
  issues: Issue[];
  observations: Observation[];
  trafficMeasurements: TrafficMeasurement[];
  devices: Device[];
  onIssueClick: (issue: Issue) => void;
  onObservationClick: (observation: Observation) => void;
  focusTarget: MapFocusTarget | null;
  selectedDeviceId: string | null;
}) {
  const points = dataPoints(issues, devices);
  if (points.length === 0) {
    return (
      <div className="w-full h-full bg-base-900 flex items-center justify-center font-mono text-xs text-base-500">
        NO_GEOREFERENCED_DATA
      </div>
    );
  }
  return (
    <MapCanvas
      initialBounds={boundsForPoints(points)}
      issues={issues}
      observations={observations}
      trafficMeasurements={trafficMeasurements}
      devices={devices}
      onIssueClick={onIssueClick}
      onObservationClick={onObservationClick}
      focusTarget={focusTarget}
      selectedDeviceId={selectedDeviceId}
    />
  );
}

function MapCanvas({
  initialBounds,
  issues,
  observations,
  trafficMeasurements,
  devices,
  onIssueClick,
  onObservationClick,
  focusTarget,
  selectedDeviceId,
}: {
  initialBounds: [[number, number], [number, number]];
  issues: Issue[];
  observations: Observation[];
  trafficMeasurements: TrafficMeasurement[];
  devices: Device[];
  onIssueClick: (issue: Issue) => void;
  onObservationClick: (observation: Observation) => void;
  focusTarget: MapFocusTarget | null;
  selectedDeviceId: string | null;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const onIssueClickRef = useRef(onIssueClick);
  const onObservationClickRef = useRef(onObservationClick);
  const issuesRef = useRef(issues);
  const observationsRef = useRef(observations);
  const previousPositions = useRef(new Map<string, [number, number]>());
  const trails = useRef(new Map<string, [number, number][]>());
  const animationFrame = useRef<number | null>(null);
  const followedDeviceId = useRef<string | null>(null);
  const followTransitionUntil = useRef(0);
  const initialDataset = useRef([...issues.map((item) => `i:${item.id}`), ...devices.map((item) => `d:${item.id}`)].sort().join("|"));
  const [ready, setReady] = useState(false);
  const [fixedInitialBounds] = useState(initialBounds);

  useEffect(() => { onIssueClickRef.current = onIssueClick; }, [onIssueClick]);
  useEffect(() => { onObservationClickRef.current = onObservationClick; }, [onObservationClick]);
  useEffect(() => { issuesRef.current = issues; }, [issues]);
  useEffect(() => { observationsRef.current = observations; }, [observations]);

  useEffect(() => {
    if (!container.current) return;
    const cartoKey = process.env.NEXT_PUBLIC_CARTO_API_KEY;
    const instance = new MapLibreMap({
      container: container.current,
      style: cartoKey ? `${CARTO_STYLE}?key=${encodeURIComponent(cartoKey)}` : CARTO_STYLE,
      bounds: fixedInitialBounds,
      fitBoundsOptions: { padding: 48, maxZoom: 16 },
      maxZoom: 25,
      attributionControl: { compact: true },
    });
    map.current = instance;
    const exposeCameraState = () => {
      if (!container.current) return;
      const center = instance.getCenter();
      container.current.dataset.mapCenter = `${center.lat.toFixed(6)},${center.lng.toFixed(6)}`;
      container.current.dataset.mapZoom = instance.getZoom().toFixed(2);
    };
    instance.on("moveend", exposeCameraState);
    exposeCameraState();
    instance.addControl(new NavigationControl({ visualizePitch: true }), "bottom-left");
    instance.on("style.load", () => {
      instance.addSource("traffic", { type: "geojson", data: pointCollection([]) });
      instance.addLayer({ id: "traffic-heatmap", type: "heatmap", source: "traffic", maxzoom: 17, paint: {
        "heatmap-weight": ["interpolate", ["linear"], ["get", "count"], 0, 0, 40, 1],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 0.7, 16, 1.8],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 12, 16, 34],
        "heatmap-opacity": 0.48,
        "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.25, "#00b8ff", 0.55, "#00ffcc", 0.8, "#f59e0b", 1, "#ef4444"],
      } });
      instance.addSource("routes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      instance.addLayer({ id: "live-route-trails", type: "line", source: "routes", paint: { "line-color": "#00ffcc", "line-width": 2, "line-opacity": 0.42 } });
      instance.addSource("raw-defects", { type: "geojson", data: pointCollection([]) });
      instance.addLayer({ id: "raw-defect-points", type: "circle", source: "raw-defects", paint: { "circle-radius": 4, "circle-color": "#f59e0b", "circle-opacity": 0.65, "circle-stroke-width": 1, "circle-stroke-color": "#fff" } });
      instance.addSource("issues", { type: "geojson", data: pointCollection([]) });
      instance.addLayer({ id: "issue-points", type: "circle", source: "issues", paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 5, 17, 10],
        "circle-color": ["match", ["get", "severity"], "critical", "#ef4444", "high", "#f97316", "medium", "#f59e0b", "#9ca3af"],
        "circle-stroke-width": 2, "circle-stroke-color": "#111827",
      } });
      instance.addSource("devices", { type: "geojson", data: pointCollection([]) });
      instance.addLayer({ id: "device-points", type: "circle", source: "devices", paint: {
        "circle-radius": ["case", ["boolean", ["get", "selected"], false], 10, 7],
        "circle-color": ["case", ["boolean", ["get", "online"], false], "#00ffcc", "#ef4444"], "circle-stroke-width": ["case", ["boolean", ["get", "selected"], false], 3, 2],
        "circle-stroke-color": ["case", ["boolean", ["get", "selected"], false], "#ffffff", "#111827"],
      } });
      instance.addLayer({ id: "device-labels", type: "symbol", source: "devices", minzoom: 13, layout: {
        "text-field": ["coalesce", ["get", "bus"], ["get", "name"]], "text-size": 11, "text-offset": [0, 1.4], "text-anchor": "top", "text-allow-overlap": false,
      }, paint: { "text-color": "#d1fae5", "text-halo-color": "#111827", "text-halo-width": 1 } });
      instance.addSource("focus", { type: "geojson", data: pointCollection([]) });
      instance.addLayer({ id: "focus-point", type: "circle", source: "focus", paint: { "circle-radius": 14, "circle-color": "rgba(0,255,204,0.12)", "circle-stroke-width": 3, "circle-stroke-color": "#00ffcc" } });

      instance.on("click", (event) => {
        // Keep the existing pinned issue panel, but use a forgiving hit box
        // instead of requiring a pixel-perfect click on a small map dot.
        const hitBox: [[number, number], [number, number]] = [
          [event.point.x - 10, event.point.y - 10],
          [event.point.x + 10, event.point.y + 10],
        ];
        const interactiveLayers = ["issue-points", "raw-defect-points", "device-points"];
        const exactHits = instance.queryRenderedFeatures(event.point, { layers: interactiveLayers });
        const nearbyHits = exactHits.length > 0
          ? exactHits
          : instance.queryRenderedFeatures(hitBox, { layers: interactiveLayers });
        const feature = nearbyHits
          .filter((candidate) => candidate.geometry.type === "Point")
          .map((candidate) => {
            const [longitude, latitude] = candidate.geometry.type === "Point" ? candidate.geometry.coordinates : [0, 0];
            const projected = instance.project([longitude!, latitude!]);
            return { candidate, distance: Math.hypot(projected.x - event.point.x, projected.y - event.point.y) };
          })
          .sort((left, right) => left.distance - right.distance)[0]?.candidate;
        if (!feature || feature.geometry.type !== "Point") return;

        const id = String(feature.properties?.id ?? "");
        if (feature.layer.id === "issue-points") {
          const issue = issuesRef.current.find((item) => item.id === id);
          if (issue) onIssueClickRef.current(issue);
          return;
        }
        if (feature.layer.id === "raw-defect-points") {
          const observation = observationsRef.current.find((item) => item.id === id);
          if (observation) onObservationClickRef.current(observation);
          return;
        }

        const properties = feature.properties ?? {};
        const content = document.createElement("div");
        content.className = "sapsii-map-popup";
        const title = document.createElement("strong");
        title.textContent = String(properties.name ?? properties.externalId ?? "Device");
        const details = document.createElement("span");
        details.textContent = `${properties.bus ?? "Unassigned"}${properties.route ? ` / ${properties.route}` : ""} · ${properties.speed ?? "--"} km/h · GPS ±${properties.accuracy ?? "--"}m`;
        content.append(title, details);
        new Popup({ offset: 12, className: "sapsii-device-popup" }).setLngLat(feature.geometry.coordinates as [number, number]).setDOMContent(content).addTo(instance);
      });
      for (const layer of ["issue-points", "raw-defect-points", "device-points"]) {
        instance.on("mouseenter", layer, () => { instance.getCanvas().style.cursor = "pointer"; });
        instance.on("mouseleave", layer, () => { instance.getCanvas().style.cursor = ""; });
      }
      exposeCameraState();
      setReady(true);
    });
    return () => {
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
      instance.remove();
      map.current = null;
    };
  }, [fixedInitialBounds]);

  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance) return;
    setSource(instance, "issues", pointCollection(issues.map((issue) => ({ longitude: issue.longitude, latitude: issue.latitude, properties: { id: issue.id, severity: issue.severity, type: issue.issueType } }))));
    setSource(instance, "raw-defects", pointCollection(observations.filter((item) => defectClasses.has(item.className)).map((item) => ({ longitude: item.longitude, latitude: item.latitude, properties: { id: item.id, type: item.className, confidence: item.confidence } }))));
    setSource(instance, "traffic", pointCollection(trafficMeasurements.flatMap((item) => item.latitude === null || item.longitude === null ? [] : [{ longitude: item.longitude, latitude: item.latitude, properties: { id: item.id, count: item.rawDetectionCount } }])));
  }, [issues, observations, ready, trafficMeasurements]);

  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance) return;
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    const destinations = new Map<string, [number, number]>();
    for (const device of devices) {
      if (device.lastLongitude === null || device.lastLatitude === null) continue;
      const destination: [number, number] = [device.lastLongitude, device.lastLatitude];
      destinations.set(device.id, destination);
      const trail = trails.current.get(device.id) ?? [];
      const last = trail.at(-1);
      if (!last || Math.abs(last[0] - destination[0]) + Math.abs(last[1] - destination[1]) > 0.00001) {
        trails.current.set(device.id, [...trail, destination].slice(-120));
      }
    }
    const starts = new Map([...destinations].map(([id, destination]) => [id, previousPositions.current.get(id) ?? destination]));
    const startedAt = performance.now();
    const render = (time: number) => {
      const progress = Math.min((time - startedAt) / 1_100, 1);
      setSource(instance, "devices", pointCollection(devices.flatMap((device) => {
        const destination = destinations.get(device.id);
        if (!destination) return [];
        const start = starts.get(device.id)!;
        const rendered: [number, number] = [
          start[0] + (destination[0] - start[0]) * progress,
          start[1] + (destination[1] - start[1]) * progress,
        ];
        previousPositions.current.set(device.id, rendered);
        if (
          device.id === selectedDeviceId &&
          followedDeviceId.current === selectedDeviceId &&
          performance.now() >= followTransitionUntil.current
        ) {
          // Follow the same interpolated position as the marker. Updating the
          // camera only when 750 ms telemetry polls arrive makes tracking jump.
          instance.setCenter(rendered);
        }
        return [{
          longitude: rendered[0],
          latitude: rendered[1],
          properties: {
            id: device.id, externalId: device.externalId, name: device.instanceExternalId ?? device.displayName ?? device.externalId,
            bus: device.busExternalId, route: device.routeCode, online: device.online, speed: device.speedMetersPerSecond === null ? null : (device.speedMetersPerSecond * 3.6).toFixed(1),
            accuracy: device.positionAccuracyMeters?.toFixed(1) ?? null, selected: device.id === selectedDeviceId,
          },
        }];
      })));
      if (progress < 1) animationFrame.current = requestAnimationFrame(render);
    };
    animationFrame.current = requestAnimationFrame(render);
    const routeFeatures: Array<Feature<LineString>> = [];
    for (const [deviceId, coordinates] of trails.current) {
      if (coordinates.length > 1) routeFeatures.push({ type: "Feature", geometry: { type: "LineString", coordinates }, properties: { deviceId } });
    }
    setSource(instance, "routes", { type: "FeatureCollection", features: routeFeatures });
  }, [devices, ready, selectedDeviceId]);

  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance) return;
    setSource(instance, "focus", pointCollection(focusTarget ? [{ longitude: focusTarget.longitude, latitude: focusTarget.latitude, properties: { key: focusTarget.key } }] : []));
    if (focusTarget) instance.flyTo({ center: [focusTarget.longitude, focusTarget.latitude], zoom: focusTarget.zoom ?? 17, duration: 1350, essential: true });
  }, [focusTarget, ready]);

  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance) return;
    if (!selectedDeviceId) {
      followedDeviceId.current = null;
      followTransitionUntil.current = 0;
      return;
    }
    const selectedDevice = devices.find((device) => device.id === selectedDeviceId);
    if (!selectedDevice || selectedDevice.lastLongitude === null || selectedDevice.lastLatitude === null) return;
    const startingFollow = followedDeviceId.current !== selectedDeviceId;
    followedDeviceId.current = selectedDeviceId;
    if (startingFollow) {
      followTransitionUntil.current = performance.now() + 1_350;
      instance.easeTo({
        center: [selectedDevice.lastLongitude, selectedDevice.lastLatitude],
        zoom: 15,
        duration: 1_350,
        essential: true,
      });
      return;
    }
    // Subsequent camera movement is driven from the marker's requestAnimationFrame
    // interpolation above, preserving the user's zoom, pitch, and bearing.
  }, [devices, ready, selectedDeviceId]);

  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance) return;
    const dataset = [...issues.map((item) => `i:${item.id}`), ...devices.filter((item) => item.lastLatitude !== null && item.lastLongitude !== null).map((item) => `d:${item.id}`)].sort().join("|");
    if (!dataset || dataset === initialDataset.current) return;
    initialDataset.current = dataset;
    instance.fitBounds(boundsForPoints(dataPoints(issues, devices)), { padding: 48, maxZoom: 16, duration: 1100 });
  }, [devices, issues, ready]);

  return <div ref={container} className="w-full h-full bg-base-900" />;
}
