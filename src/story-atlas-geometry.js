// Shared Paris frame for the hourly atlas in the story and the pitch.
export function createAtlasPath(data) {
  const points = [...data.ring, ...data.cells.flatMap(cell => cell.ring)];
  const west = Math.min(...points.map(point => point[0]));
  const east = Math.max(...points.map(point => point[0]));
  const south = Math.min(...points.map(point => point[1]));
  const north = Math.max(...points.map(point => point[1]));
  const cosLat = Math.cos(48.86 * Math.PI / 180);
  const dx = (east - west) * cosLat, dy = north - south;
  const scale = Math.min(530 / dx, 370 / dy);
  return ring => ring.map(([lon, lat], index) => {
    const x = (550 - dx * scale) / 2 + (lon - west) * cosLat * scale;
    const y = 32 + (370 - dy * scale) / 2 + (north - lat) * scale;
    return (index ? "L" : "M") + x.toFixed(2) + "," + y.toFixed(2);
  }).join(" ") + " Z";
}
