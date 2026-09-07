export type EventLabel = 'pothole' | 'missing_crossing' | 'waterlogging' | 'damaged_sign' | 'vehicle_density_high' | 'accident';
export type Severity = 'critical' | 'warning' | 'normal';
export type Provider = 'ONNX' | 'LiteRT';
export type ThermalStatus = 'normal' | 'elevated' | 'critical';

export interface SapseedEvent {
  id: string;
  label: EventLabel;
  confidence: number;
  lat: number;
  lng: number;
  timestamp: string;
  provider: Provider;
  thermal_status: ThermalStatus;
  jpeg_url: string;
  severity: Severity;
  bus_id: string;
}

export interface BusTelemetry {
  id: string;
  route: string;
  lat: number;
  lng: number;
  heading: number;
  effective_fps: number;
  mean_latency_ms: number;
  thermal_status: ThermalStatus;
  provider: Provider;
  queue_depth: number;
  last_sync: string;
  status: 'ACTIVE' | 'OFFLINE' | 'MAINTENANCE';
}

const generateId = () => Math.random().toString(36).substring(2, 9).toUpperCase();

export const MOCK_BUSES: BusTelemetry[] = [
  { id: 'BUS-104A', route: 'R42', lat: 40.7128, lng: -74.0060, heading: 45, effective_fps: 28.5, mean_latency_ms: 35, thermal_status: 'normal', provider: 'ONNX', queue_depth: 0, last_sync: new Date().toISOString(), status: 'ACTIVE' },
  { id: 'BUS-219B', route: 'R17', lat: 40.7282, lng: -73.9942, heading: 120, effective_fps: 29.8, mean_latency_ms: 33, thermal_status: 'normal', provider: 'LiteRT', queue_depth: 2, last_sync: new Date().toISOString(), status: 'ACTIVE' },
  { id: 'BUS-099C', route: 'R09', lat: 40.7580, lng: -73.9855, heading: 270, effective_fps: 15.2, mean_latency_ms: 85, thermal_status: 'elevated', provider: 'ONNX', queue_depth: 14, last_sync: new Date(Date.now() - 5000).toISOString(), status: 'ACTIVE' },
  { id: 'BUS-404D', route: 'R55', lat: 40.7484, lng: -73.9857, heading: 90, effective_fps: 0, mean_latency_ms: 0, thermal_status: 'critical', provider: 'LiteRT', queue_depth: 120, last_sync: new Date(Date.now() - 3600000).toISOString(), status: 'OFFLINE' },
  { id: 'BUS-112E', route: 'R12', lat: 40.7060, lng: -74.0088, heading: 15, effective_fps: 27.0, mean_latency_ms: 38, thermal_status: 'normal', provider: 'ONNX', queue_depth: 0, last_sync: new Date().toISOString(), status: 'ACTIVE' },
];

export const generateMockEvents = (count: number): SapseedEvent[] => {
  const labels: { l: EventLabel; s: Severity }[] = [
    { l: 'pothole', s: 'warning' },
    { l: 'missing_crossing', s: 'normal' },
    { l: 'waterlogging', s: 'warning' },
    { l: 'damaged_sign', s: 'normal' },
    { l: 'vehicle_density_high', s: 'normal' },
    { l: 'accident', s: 'critical' },
  ];

  return Array.from({ length: count }).map(() => {
    const bus = MOCK_BUSES[Math.floor(Math.random() * MOCK_BUSES.length)];
    const labelObj = labels[Math.floor(Math.random() * labels.length)];
    
    // Add some random scatter around the bus position
    const lat = bus.lat + (Math.random() - 0.5) * 0.02;
    const lng = bus.lng + (Math.random() - 0.5) * 0.02;

    return {
      id: `EVT-${generateId()}`,
      label: labelObj.l,
      confidence: 0.65 + Math.random() * 0.34, // 65% to 99%
      lat,
      lng,
      timestamp: new Date(Date.now() - Math.random() * 10000000).toISOString(),
      provider: bus.provider,
      thermal_status: bus.thermal_status,
      jpeg_url: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&q=80&w=600&h=400', // Mock placeholder image of a road
      severity: labelObj.s,
      bus_id: bus.id,
    };
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

export const INITIAL_EVENTS = generateMockEvents(50);
