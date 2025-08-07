"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";

const MapContainer = dynamic(() => import("react-leaflet").then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then(mod => mod.Marker), { ssr: false });

let Icon: any = null;
if (typeof window !== "undefined") {
  Icon = require("leaflet").Icon;
}

export default function MapDemo() {
  const [modal, setModal] = useState<{ open: boolean; content: string }>({ open: false, content: "" });
  const [selectedFeature, setSelectedFeature] = useState<any>(null);
  const [geojson, setGeojson] = useState<any>(null);
  const [locationInfo, setLocationInfo] = useState<string>("");
  const mapRef = useRef<any>(null);

  // Helper to get color based on Variance_pred_scaled
  function getColor(variance: number) {
    if (variance > 0.45) return "#e53935"; // red
    if (variance > 0.3) return "#fbc02d"; // yellow
    return "#43a047"; // green
  }

  // Helper to get color for ncdd_embeddings
  function getEmbeddingColor(embedding: number) {
    if (embedding > 0.45) return "#3949ab"; // blue
    if (embedding > 0.3) return "#26a69a"; // teal
    return "#8d6e63"; // brown
  }

  // Helper to get marker color based on reliability
  function getReliabilityColor(variance: number, ncdd: number) {
    const unreliableVariance = variance > 0.1;
    const unreliableNcdd = ncdd > -5.25;
    if (unreliableVariance && unreliableNcdd) return '#e53935'; // red
    if (unreliableVariance || unreliableNcdd) return '#fbc02d'; // orange
    return '#43a047'; // green
  }

  // Placeholder: In production, use a geocoding API
  function getLocationName(lat: number, lng: number) {
    return `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
  }

  // Load GeoJSON data dynamically
  useEffect(() => {
    fetch("/data/demo.geojson")
      .then(res => res.json())
      .then(setGeojson);
  }, []);

  // Gather all lat/lng points
  const allLatLngs = useMemo(() => {
    if (!geojson) return [];
    return geojson.features
      .filter((f: any) => f && f.geometry && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length === 2)
      .map((f: any) => [f.geometry.coordinates[1], f.geometry.coordinates[0]]); // [lat, lng]
  }, [geojson]);

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
    if (!Icon || !geojson) return [];
    return geojson.features.map((feature: any) => {
      if (!feature || !feature.geometry || !Array.isArray(feature.geometry.coordinates) || feature.geometry.coordinates.length !== 2 || !feature.properties) return null;
      const variance = feature.properties.Variance_pred_scaled;
      const color = getColor(variance);
      return new Icon({
        iconUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg width='32' height='32' viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg'><circle cx='16' cy='16' r='14' fill='${color}' stroke='black' stroke-width='2'/><text x='16' y='22' text-anchor='middle' font-size='18' fill='white' font-family='Arial' font-weight='bold'>!</text></svg>`)}`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      });
    });
  }, [Icon, geojson]);

  useEffect(() => {
    if (selectedFeature && selectedFeature.geometry && Array.isArray(selectedFeature.geometry.coordinates)) {
      const lat = selectedFeature.geometry.coordinates[1];
      const lon = selectedFeature.geometry.coordinates[0];
      fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`)
        .then(res => res.json())
        .then(data => {
          const city = data.city || data.locality || "";
          const state = data.principalSubdivision || "";
          const country = data.countryCode || "";
          setLocationInfo(`${city}${city ? ', ' : ''}${state}${state ? ', ' : ''}${country}`);
        })
        .catch(() => setLocationInfo(""));
    } else {
      setLocationInfo("");
    }
  }, [selectedFeature]);

  // Lookup table for glc_cl_smj land cover types
  const glc2000_classes: Record<number, string> = {
    2: "Broadleaf Deciduous Forest (Closed)",
    4: "Needleleaf Evergreen Forest",
    6: "Mixed Forest",
    11: "Evergreen Shrub Cover",
    12: "Deciduous Shrub Cover",
    13: "Herbaceous Cover",
    14: "Sparse Herb/Shrub",
    15: "Flooded Herb/Shrub",
    16: "Cultivated Areas",
    18: "Cropland Mosaic",
    20: "Water Bodies"
  };

  return (
    <div className="h-screen w-full">
      <MapContainer ref={mapRef} center={[0, 0]} zoom={2} minZoom={2} style={{ height: "100%", width: "100%" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {/* Render every 15th geojson point as a marker with custom icon */}
        {(() => {
          const latLonArr: [number, number][] = [];
          const markers = Icon && geojson && geojson.features.filter((_: any, idx: number) => idx % 15 === 0).map((feature: any, idx: number) => {
            if (!feature || !feature.geometry || !Array.isArray(feature.geometry.coordinates) || feature.geometry.coordinates.length !== 2 || !feature.properties) return null;
            const [lon, lat] = feature.geometry.coordinates;
            latLonArr.push([lat, lon]);
            const variance = feature.properties.Variance_pred_scaled;
            const ncdd = feature.properties.ncdd_embeddings;
            const markerColor = getReliabilityColor(variance, ncdd);
            const iconSvg = `<svg width='32' height='32' viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg'><circle cx='16' cy='16' r='14' fill='${markerColor}' stroke='black' stroke-width='2'/></svg>`;
            const markerIcon = new Icon({
              iconUrl: `data:image/svg+xml;utf8,${encodeURIComponent(iconSvg)}`,
              iconSize: [32, 32],
              iconAnchor: [16, 32],
              popupAnchor: [0, -32],
            });
            const handleClick = () => {
              setSelectedFeature(feature);
              if (mapRef.current) {
                mapRef.current.setView([lat, lon], 8);
              }
            };
            return (
              <Marker
                key={"geojson-" + idx}
                position={[lat, lon]}
                icon={markerIcon}
                eventHandlers={{ click: handleClick }}
              />
            );
          });
          if (latLonArr.length) {
            console.log('Lat/Lon combinations:', latLonArr);
          }
          return markers;
        })()}
      </MapContainer>
      {modal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg min-w-[300px]">
            <h2 className="text-xl font-bold mb-2">Info</h2>
            <pre className="mb-4 whitespace-pre-wrap break-words">{modal.content}</pre>
            <button className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition" onClick={() => setModal({ open: false, content: "" })}>Close</button>
          </div>
        </div>
      )}
      {selectedFeature && (
        <div className="fixed top-0 right-0 h-screen w-[min(50vw,600px)] bg-white shadow-[ -4px_0_24px_rgba(0,0,0,0.18)] z-[1000] flex flex-col p-10 pt-10 pb-8 text-[#222] font-sans overflow-y-auto">
          <button
            className="self-end mb-6 text-3xl bg-none border-none cursor-pointer text-gray-400 hover:text-gray-600"
            onClick={() => setSelectedFeature(null)}
          >
            &times;
          </button>


          <strong className="text-2xl mb-2 text-[#222]">
            {locationInfo || getLocationName(selectedFeature.geometry.coordinates[1], selectedFeature.geometry.coordinates[0])}
          </strong>

          <div className="mb-6">
            {/* <label className="text-base text-gray-600">Land Cover Type:</label> */}
            <div className="text-lg text-[#222] mt-1">
              {glc2000_classes[selectedFeature.properties.glc_cl_smj] || `Unknown (${selectedFeature.properties.glc_cl_smj})`}
            </div>
          </div>

          {/* <span className="text-base mb-4 text-gray-400">
            {getLocationName(selectedFeature.geometry.coordinates[1], selectedFeature.geometry.coordinates[0])}
          </span> */}

          <div className="flex gap-6 mb-6 justify-center">
            <img
              src={`/extreme_imgs/${selectedFeature.properties.filename?.split("_").slice(0, 2).join("_")}_predicted_mask.png`}
              alt="Predicted"
              className="w-[220px] h-[220px] object-contain border border-gray-200 rounded-lg bg-gray-100"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <img
              src={`/extreme_imgs/${selectedFeature.properties.filename?.split("_").slice(0, 2).join("_")}_probabilities.png`}
              alt="Probabilities"
              className="w-[220px] h-[220px] object-contain border border-gray-200 rounded-lg bg-gray-100"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>

          <div className="mb-6">
            <label className={`text-base ${selectedFeature.properties.Variance_pred_scaled > 0.1 ? 'text-[#e53935]' : 'text-gray-600'}`}>Variance Uncertainty:{selectedFeature.properties.Variance_pred_scaled > 0.1 ? ' (Unreliable)' : ''}</label>
            <span className={`text-base ml-3 ${selectedFeature.properties.Variance_pred_scaled > 0.1 ? 'text-[#e53935]' : 'text-[#222]'}`}>{selectedFeature.properties.Variance_pred_scaled !== undefined ? selectedFeature.properties.Variance_pred_scaled.toFixed(2) : 'N/A'}</span>

            <div className="flex items-center w-4/5 max-w-[320px]">
              <span className="text-xs text-gray-500 mr-2">0.0</span>
              <div className="bg-gray-200 rounded h-[22px] flex-1 relative">
                <div
                  className={`absolute left-0 top-0 h-full rounded transition-all`}
                  style={{
                    width: `${selectedFeature.properties.Variance_pred_scaled !== undefined ? Math.min(Math.round(((selectedFeature.properties.Variance_pred_scaled - 0.0) / (0.264 - 0.0)) * 100), 100) : 0}%`,
                    background: selectedFeature.properties.Variance_pred_scaled > 0.1 ? '#e53935' : getColor(selectedFeature.properties.Variance_pred_scaled)
                  }}
                />
              </div>
              <span className="text-xs text-gray-500 ml-2">0.264</span>
            </div>
            <span className={`text-base ml-3 ${selectedFeature.properties.Variance_pred_scaled > 0.1 ? 'text-[#e53935]' : 'text-[#222]'}`}>{selectedFeature.properties.Variance_pred_scaled !== undefined ? selectedFeature.properties.Variance_pred_scaled.toFixed(2) : 'N/A'}</span>
          </div>

          <div className="mb-6">
            <label className={`text-base ${selectedFeature.properties.ncdd_embeddings > -5.25 ? 'text-[#e53935]' : 'text-gray-600'}`}>NCDD Embeddings:{selectedFeature.properties.ncdd_embeddings > -5.25 ? ' (Unreliable)' : ''}</label>
            <span className={`text-base ml-3 ${selectedFeature.properties.ncdd_embeddings > -5.25 ? 'text-[#e53935]' : 'text-[#222]'}`}>{selectedFeature.properties.ncdd_embeddings !== undefined ? selectedFeature.properties.ncdd_embeddings.toFixed(2) : 'N/A'}</span>

            <div className="flex items-center w-4/5 max-w-[320px]">
              <span className="text-xs text-gray-500 mr-2">-8.22</span>
              <div className="bg-gray-200 rounded h-[22px] flex-1 relative">
                <div
                  className={`absolute left-0 top-0 h-full rounded transition-all`}
                  style={{
                    width: `${selectedFeature.properties.ncdd_embeddings !== undefined ? Math.min(Math.round(((selectedFeature.properties.ncdd_embeddings - (-8.22)) / ((-1.87) - (-8.22))) * 100), 100) : 0}%`,
                    background: selectedFeature.properties.ncdd_embeddings > -5.25 ? '#e53935' : getEmbeddingColor(selectedFeature.properties.ncdd_embeddings)
                  }}
                />
              </div>
              <span className="text-xs text-gray-500 ml-2">-1.87</span>
            </div>
          </div>

          <div className="mt-auto pt-8">
            <div className="flex flex-col items-start justify-end gap-1 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔴</span>
                <span className="text-[#e53935]">Very unreliable (both metrics)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg">🟠</span>
                <span className="text-[#fbc02d]">Unreliable prediction (variance metric too high)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg">🟠</span>
                <span className="text-[#fbc02d]">Not enough similar data (distance to cluster too high)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg">🟢</span>
                <span className="text-[#43a047]">Reliable prediction</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
