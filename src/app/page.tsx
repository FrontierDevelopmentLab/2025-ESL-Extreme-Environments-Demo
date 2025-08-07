"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import Image from 'next/image';

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
    // Use similarity thresholds: -8.22 (best), -5.25 (threshold)
    if (embedding > -5.25) return "#e53935"; // red (unreliable)
    if (embedding > -7.0) return "#fbc02d"; // yellow (intermediate)
    return "#43a047"; // green (reliable)
  }

  // Helper to get marker color based on reliability
  function getReliabilityColor(variance: number, ncdd: number) {
    const unreliableVariance = variance > 0.1;
    const unreliableNcdd = ncdd > -5.25;
    if (unreliableVariance && unreliableNcdd) return '#e53935'; // red
    if (unreliableVariance || unreliableNcdd) return '#fbc02d'; // orange
    return '#43a047'; // green
  }

  // Helper to get reliability from variance
  function getVarianceReliability(variance: number) {
    // 0.0 (best) to 0.1 (threshold), above 0.1 is unreliable
    if (variance === undefined || variance === null) return 0;
    if (variance > 0.1) return 0; // Explicitly unreliable
    // Reliability decreases linearly from 1 (variance=0) to 0 (variance=0.1)
    return 1 - (variance / 0.1);
  }
  // Helper to get reliability from similarity
  function getSimilarityReliability(similarity: number) {
    // -8.22 (best) to -5.25 (threshold), above -5.25 is unreliable
    if (similarity === undefined || similarity === null) return 0;
    if (similarity > -5.25) return 0; // Explicitly unreliable
    // Reliability decreases linearly from 1 (similarity=-8.22) to 0 (similarity=-5.25)
    const min = -8.22;
    const max = -5.25;
    if (similarity <= min) return 1;
    return 1 - ((similarity - min) / (max - min));
  }
  // Helper to get reliability color
  function getReliabilityColorMeter(score: number) {
    if (score > 0.7) return '#43a047'; // green
    if (score > 0.4) return '#fbc02d'; // yellow
    return '#e53935'; // red
  }

  // Placeholder: In production, use a geocoding API
  function getLocationName(lat: number, lng: number) {
    return `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
  }

  // Load GeoJSON data dynamically
  useEffect(() => {
    fetch("/data/filtered_demo.geojson")
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
      <MapContainer ref={mapRef} center={[39.8283, -98.5795]} zoom={5} minZoom={2} style={{ height: "100%", width: "100%" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {/* Render every geojson point as a marker with custom icon */}
        {(() => {
          const latLonArr: [number, number][] = [];
          const markers = Icon && geojson && geojson.features.filter((_: any, idx: number) => idx % 2 === 0).map((feature: any, idx: number) => {
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
            latLonArr.forEach(([lat, lon]) => {
              console.log(
                `${lat}_${lon}_predicted_mask.png`,
                `${lat}_${lon}_probabilities.png`
              );
            });
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

          <div className="flex flex-col gap-6 mb-6 justify-center">

            {/* <div className="flex flex-row gap-6">
              <img
                src={`/gcp-imgs/${selectedFeature.properties.filename?.split("_").slice(0, 2).join("_")}_predicted_mask.png`}
                alt="Predicted"
                className="w-[220px] h-[220px] object-contain border border-gray-200 rounded-lg bg-gray-100"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <img
                src={`/gcp-imgs/${selectedFeature.properties.filename?.split("_").slice(0, 2).join("_")}_probabilities.png`}
                alt="Probabilities"
                className="w-[220px] h-[220px] object-contain border border-gray-200 rounded-lg bg-gray-100"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div> */}

            <div className="flex flex-row gap-6 w-full max-w-full flex-nowrap">
              <div className="flex-1 aspect-square relative border border-gray-200 rounded-lg bg-gray-100">
                <Image
                  src={`/gcp-imgs/${selectedFeature.properties.filename?.split("_").slice(0, 2).join("_")}_predicted_mask.png`}
                  alt="Predicted"
                  fill
                  className="object-contain rounded-lg w-full h-full"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
              <div className="flex-1 aspect-square relative border border-gray-200 rounded-lg bg-gray-100">
                <Image
                  src={`/gcp-imgs/${selectedFeature.properties.filename?.split("_").slice(0, 2).join("_")}_probabilities.png`}
                  alt="Probabilities"
                  fill
                  className="object-contain rounded-lg w-full h-full"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
            </div>

            <div className="flex flex-col items-center">
              {(() => {
                const variance = selectedFeature.properties.Variance_pred_scaled;
                const similarity = selectedFeature.properties.ncdd_embeddings;
                let tags = [];
                const tooMuchVariance = variance > 0.1;
                const notEnoughSimilar = similarity > -5.25;
                if (tooMuchVariance && notEnoughSimilar) {
                  tags.push({ label: 'Very unreliable', color: '#e53935' });
                } else {
                  if (tooMuchVariance) tags.push({ label: 'Too much variance', color: '#fbc02d' });
                  if (notEnoughSimilar) tags.push({ label: 'Not enough similar data', color: '#fbc02d' });
                  if (!tooMuchVariance && !notEnoughSimilar) tags.push({ label: 'Reliable prediction', color: '#43a047' });
                }
                return (
                  <div className="flex flex-wrap gap-2 mt-2 justify-center">
                    {tags.map((tag, idx) => (
                      <span
                        key={tag.label + idx}
                        className="px-3 py-1 rounded-full text-sm font-semibold flex items-center"
                        style={{ background: tag.color, color: '#fff' }}
                      >
                        <span className="mr-1"></span>{tag.label}
                      </span>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="mb-6">
            <label className={`text-base ${selectedFeature.properties.Variance_pred_scaled > 0.1 ? 'text-[#e53935]' : 'text-gray-600'}`}>Variance Uncertainty:</label>
            <span className={`text-base ml-3 ${selectedFeature.properties.Variance_pred_scaled > 0.1 ? 'text-[#e53935]' : 'text-[#222]'}`}>{selectedFeature.properties.Variance_pred_scaled !== undefined ? selectedFeature.properties.Variance_pred_scaled.toFixed(2) : 'N/A'}</span>

            <div className="flex flex-col w-full max-w-[320px]">
              <div className="bg-gray-200 rounded h-[22px] w-full relative">
                <div
                  className="absolute left-0 top-0 h-full rounded transition-all"
                  style={{
                    width: `${selectedFeature.properties.Variance_pred_scaled !== undefined ? Math.min(Math.round(((selectedFeature.properties.Variance_pred_scaled - 0.0) / (0.264 - 0.0)) * 100), 100) : 0}%`,
                    background: selectedFeature.properties.Variance_pred_scaled > 0.1 ? '#e53935' : getColor(selectedFeature.properties.Variance_pred_scaled)
                  }}
                />
              </div>
              <div className="flex justify-between mt-1 w-full">
                <span className="text-xs text-gray-500">0.00</span>
                <span className="text-xs text-gray-500">0.264</span>
              </div>
            </div>
            {/* <span className={`text-base ml-3 ${selectedFeature.properties.Variance_pred_scaled > 0.1 ? 'text-[#e53935]' : 'text-[#222]'}`}>{selectedFeature.properties.Variance_pred_scaled !== undefined ? selectedFeature.properties.Variance_pred_scaled.toFixed(2) : 'N/A'}</span> */}
          </div>

          <div className="mb-6">
            <label className={`text-base ${selectedFeature.properties.ncdd_embeddings > -5.25 ? 'text-[#e53935]' : 'text-gray-600'}`}>Cluster Similarity Score:</label>
            <span className={`text-base ml-3 ${selectedFeature.properties.ncdd_embeddings > -5.25 ? 'text-[#e53935]' : 'text-[#222]'}`}>{selectedFeature.properties.ncdd_embeddings !== undefined ? selectedFeature.properties.ncdd_embeddings.toFixed(2) : 'N/A'}</span>

            <div className="flex flex-col w-full max-w-[320px]">
              <div className="bg-gray-200 rounded h-[22px] w-full relative">
                <div
                  className="absolute left-0 top-0 h-full rounded transition-all"
                  style={{
                    width: `${selectedFeature.properties.ncdd_embeddings !== undefined ? Math.min(Math.round(((selectedFeature.properties.ncdd_embeddings - (-8.22)) / ((-1.87) - (-8.22))) * 100), 100) : 0}%`,
                    background: selectedFeature.properties.ncdd_embeddings > -5.25 ? '#e53935' : getEmbeddingColor(selectedFeature.properties.ncdd_embeddings)
                  }}
                />
              </div>
              <div className="flex justify-between mt-1 w-full">
                <div className="text-xs text-gray-500">-8.22</div>
                <div className="text-xs text-gray-500">-1.87</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
