// Preset observer locations. `ref: true` marks the spread of cities used as
// simultaneous observers for the sight-line and fit comparisons.
export const CITIES = [
  { name: 'Tromsø', lat: 69.65, lon: 18.96, ref: true },
  { name: 'Anchorage', lat: 61.22, lon: -149.9 },
  { name: 'Moscow', lat: 55.76, lon: 37.62 },
  { name: 'London', lat: 51.51, lon: -0.13, ref: true },
  { name: 'New York', lat: 40.71, lon: -74.01, ref: true },
  { name: 'Tokyo', lat: 35.68, lon: 139.69, ref: true },
  { name: 'Los Angeles', lat: 34.05, lon: -118.24, ref: true },
  { name: 'Cairo', lat: 30.04, lon: 31.24, ref: true },
  { name: 'Delhi', lat: 28.61, lon: 77.21, ref: true },
  { name: 'Dubai', lat: 25.2, lon: 55.27 },
  { name: 'Honolulu', lat: 21.31, lon: -157.86, ref: true },
  { name: 'Mexico City', lat: 19.43, lon: -99.13 },
  { name: 'Singapore', lat: 1.35, lon: 103.82, ref: true },
  { name: 'Quito', lat: -0.18, lon: -78.47, ref: true },
  { name: 'Nairobi', lat: -1.29, lon: 36.82, ref: true },
  { name: 'São Paulo', lat: -23.55, lon: -46.63, ref: true },
  { name: 'Johannesburg', lat: -26.2, lon: 28.05 },
  { name: 'Perth', lat: -31.95, lon: 115.86, ref: true },
  { name: 'Santiago', lat: -33.45, lon: -70.67, ref: true },
  { name: 'Sydney', lat: -33.87, lon: 151.21, ref: true },
  { name: 'Cape Town', lat: -33.92, lon: 18.42, ref: true },
  { name: 'Buenos Aires', lat: -34.6, lon: -58.38 },
  { name: 'Auckland', lat: -36.85, lon: 174.76 },
  { name: 'Punta Arenas', lat: -53.16, lon: -70.91, ref: true },
  { name: 'McMurdo Station', lat: -77.85, lon: 166.67 },
];

export const REF_CITIES = CITIES.filter((c) => c.ref);
