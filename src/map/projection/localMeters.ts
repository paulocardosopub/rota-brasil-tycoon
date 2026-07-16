const EARTH_RADIUS_METERS = 6_371_008.8;

export function latLonToLocalMeters(lat: number, lon: number, origin: { lat: number; lon: number }) {
  const deg = Math.PI / 180;
  return {
    x: (lon - origin.lon) * deg * EARTH_RADIUS_METERS * Math.cos(origin.lat * deg),
    y: -(lat - origin.lat) * deg * EARTH_RADIUS_METERS
  };
}

export function localMetersToLatLon(x: number, y: number, origin: { lat: number; lon: number }) {
  const deg = Math.PI / 180;
  return {
    lat: origin.lat - y / (deg * EARTH_RADIUS_METERS),
    lon: origin.lon + x / (deg * EARTH_RADIUS_METERS * Math.cos(origin.lat * deg))
  };
}
