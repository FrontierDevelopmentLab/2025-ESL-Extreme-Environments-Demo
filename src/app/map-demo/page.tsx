"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import generatedGeojson from "../../data/generatedGeojson";

const MapContainer = dynamic(() => import("react-leaflet").then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then(mod => mod.Popup), { ssr: false });
const GeoJSON = dynamic(() => import("react-leaflet").then(mod => mod.GeoJSON), { ssr: false });

let Icon: any = null;
if (typeof window !== "undefined") {
  Icon = require("leaflet").Icon;
}

const coordinates = [
  { lat: 30.9655, lng: -100.4342, info: "Point 1: Example info" },
  { lat: 33.6106, lng: -100.9359, info: "Point 2: Example info" },
];

export default function MapDemo() {
  const [modal, setModal] = useState<{ open: boolean; content: string }>({ open: false, content: "" });
  const [selectedFeature, setSelectedFeature] = useState<any>(null);
  const mapRef = useRef<any>(null);

  // Helper to get color based on uncertainty
  function getColor(uncertainty: number) {
    if (uncertainty > 0.45) return "#e53935"; // red
    if (uncertainty > 0.3) return "#fbc02d"; // yellow
    return "#43a047"; // green
  }

  // Placeholder: In production, use a geocoding API
  function getLocationName(lat: number, lng: number) {
    return `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
  }

  // Gather all lat/lng points
  const allLatLngs = [
    ...coordinates.map(c => [c.lat, c.lng]),
    ...generatedGeojson.features
      .filter(f => f && f.geometry && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length === 2)
      .map(f => {
        if (!f) return [0, 0];
        return [f.geometry.coordinates[1], f.geometry.coordinates[0]];
      }) // [lat, lng]
  ];

  // Fit bounds after map loads
  useEffect(() => {
    if (mapRef.current && allLatLngs.length > 0) {
      const L = require("leaflet");
      const bounds = L.latLngBounds(allLatLngs);
      mapRef.current.fitBounds(bounds, { padding: [32, 32], maxZoom: 10 });
    }
  }, [allLatLngs]);

  // Memoize icons only on client
  const warningIcons = useMemo(() => {
    if (!Icon) return [];
    return generatedGeojson.features.map((feature) => {
      if (!feature || !feature.geometry || !Array.isArray(feature.geometry.coordinates) || feature.geometry.coordinates.length !== 2 || !feature.properties) return null;
      const uncertainty = feature.properties.uncertainty;
      const color = getColor(uncertainty);
      return new Icon({
        iconUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg width='32' height='32' viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg'><circle cx='16' cy='16' r='14' fill='${color}' stroke='black' stroke-width='2'/><text x='16' y='22' text-anchor='middle' font-size='18' fill='white' font-family='Arial' font-weight='bold'>!</text></svg>`)}`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      });
    });
  }, [Icon, generatedGeojson]);

  return (
    <div style={{ height: "100vh", width: "100%" }}>
      <MapContainer ref={mapRef} center={[0, 0]} zoom={2} minZoom={2} style={{ height: "100%", width: "100%" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {coordinates.map((coord, idx) => {
          // Find matching geojson feature for uncertainty
          const feature = generatedGeojson.features.find(f => f && f.properties && f.properties.filename && f.properties.filename.includes(coord.lat.toFixed(5)) && f.properties.filename.includes(coord.lng.toFixed(5)));
          const uncertainty = feature?.properties?.uncertainty ?? 0.2;
          const color = getColor(uncertainty);
          const icon = Icon ? new Icon({
            iconUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg width='32' height='32' viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg'><circle cx='16' cy='16' r='14' fill='${color}' stroke='black' stroke-width='2'/><text x='16' y='22' text-anchor='middle' font-size='18' fill='white' font-family='Arial' font-weight='bold'>!</text></svg>`)}`,
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32],
          }) : undefined;
          const handleClick = () => {
            setSelectedFeature(feature);
            if (mapRef.current) {
              mapRef.current.setView([coord.lat, coord.lng], 8);
            }
          };
          return (
            <Marker key={"coord-"+idx} position={[coord.lat, coord.lng]} icon={icon} eventHandlers={{ click: handleClick }} />
          );
        })}
        {/* Render each geojson point as a marker with custom icon */}
        {Icon && generatedGeojson.features.map((feature, idx) => {
          if (!feature || !feature.geometry || !Array.isArray(feature.geometry.coordinates) || feature.geometry.coordinates.length !== 2 || !feature.properties) return null;
          const [lon, lat] = feature.geometry.coordinates;
          const handleClick = () => {
            setSelectedFeature(feature);
            if (mapRef.current) {
              mapRef.current.setView([lat, lon], 8);
            }
          };
          return (
            <Marker
              key={"geojson-"+idx}
              position={[lat, lon]}
              icon={warningIcons[idx]}
              eventHandlers={{ click: handleClick }}
            />
          );
        })}
      </MapContainer>
      {modal.open && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", padding: 24, borderRadius: 8, minWidth: 300 }}>
            <h2>Info</h2>
            <pre>{modal.content}</pre>
            <button onClick={() => setModal({ open: false, content: "" })}>Close</button>
          </div>
        </div>
      )}
      {selectedFeature && (
        <div style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: "min(50vw, 600px)",
          background: "#fff",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.18)",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          padding: "40px 48px 32px 48px",
          color: "#222",
          fontFamily: "Inter, Arial, sans-serif",
        }}>
          <button style={{ alignSelf: "flex-end", marginBottom: 24, fontSize: 24, background: "none", border: "none", cursor: "pointer", color: "#888" }} onClick={() => setSelectedFeature(null)}>×</button>
          <strong style={{ fontSize: 26, marginBottom: 18, color: "#222" }}>{getLocationName(selectedFeature.geometry.coordinates[1], selectedFeature.geometry.coordinates[0])}</strong>
          <div style={{ display: "flex", gap: 24, marginBottom: 24, justifyContent: "center" }}>
            <img src={`/extreme_imgs/${selectedFeature.properties.filename.split("_").slice(0,2).join("_")}_predicted_mask.png`} alt="Predicted" style={{ width: 220, height: 220, objectFit: "contain", border: "1px solid #eee", borderRadius: 8, background: "#fafafa" }} />
            <img src={`/extreme_imgs/${selectedFeature.properties.filename.split("_").slice(0,2).join("_")}_probabilites.png`} alt="Probabilities" style={{ width: 220, height: 220, objectFit: "contain", border: "1px solid #eee", borderRadius: 8, background: "#fafafa" }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 16, color: "#555" }}>Uncertainty:</label>
            <div style={{ background: "#eee", borderRadius: 6, height: 22, width: "80%", maxWidth: 320, position: "relative", marginTop: 6 }}>
              <div style={{
                width: `${Math.round(selectedFeature.properties.uncertainty * 100)}%`,
                height: "100%",
                background: getColor(selectedFeature.properties.uncertainty),
                borderRadius: 6,
                position: "absolute",
                left: 0,
                top: 0,
                transition: "width 0.3s"
              }} />
            </div>
            <span style={{ fontSize: 16, marginLeft: 12, color: "#222" }}>{selectedFeature.properties.uncertainty}</span>
          </div>
        </div>
      )}
    </div>
  );
}
