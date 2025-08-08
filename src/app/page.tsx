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

  // Helper to get marker color based on reliability
  function getReliabilityColor(variance: number, ncdd: number) {
    const unreliableVariance = variance > 0.1;
    const unreliableNcdd = ncdd > -5.25;
    if (unreliableVariance && unreliableNcdd) return '#e53935'; // red
    if (unreliableVariance || unreliableNcdd) return '#ff9800'; // orange
    return '#43a047'; // green
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
        <div className="fixed top-0 right-0 h-screen w-[min(50vw,600px)] bg-white shadow-[ -4px_0_24px_rgba(0,0,0,0.18)] z-[1000] flex flex-col p-10 py-8 text-[#222] font-sans overflow-y-auto">
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
            <div className="text-lg text-[#222] mt-1">
              {glc2000_classes[selectedFeature.properties.glc_cl_smj] || `Unknown (${selectedFeature.properties.glc_cl_smj})`}
            </div>
          </div>
          <div className="flex flex-col gap-6 mb-6 justify-center">
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
                if (variance <= 0.1 && similarity <= -5.25) tags.push({ label: 'Reliable prediction', color: '#43a047' });
                if (variance > 0.1 && similarity > -5.25) tags.push({ label: 'Very unreliable', color: '#e53935' });
                if (variance > 0.1) tags.push({ label: 'Too much variance', color: '#ff9800' });
                if (variance > 0.45) tags.push({ label: 'Extremely unreliable model', color: '#e53935' });
                if (similarity > -5.25) tags.push({ label: 'Not enough similar data', color: '#ff9800' });
                if (similarity > -1.87) tags.push({ label: 'Extremely unreliable data', color: '#e53935' });
                const uniqueTags = Array.from(new Map(tags.map(tag => [tag.label, tag])).values());
                return (
                  <div className="flex flex-wrap gap-2 mt-2 justify-center">
                    {uniqueTags.map((tag, idx) => (
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
            {(() => {
              const variance = selectedFeature.properties.Variance_pred_scaled;
              const minVariance = 0.0;
              const maxVariance = 0.264;
              const reliabilityScore = variance !== undefined ? 1 - ((variance - minVariance) / (maxVariance - minVariance)) : 0;
              const reliabilityColor = reliabilityScore > 0.7 ? '#43a047' : reliabilityScore > 0.4 ? '#ff9800' : '#e53935';
              return (
                <>
                  <label className={`text-base`} style={{ color: reliabilityColor }}>
                    Model Reliability:
                  </label>
                  <span className={`text-base ml-3`} style={{ color: reliabilityColor }}>
                    {reliabilityScore.toFixed(2)}
                  </span>
                  <span className="ml-2 cursor-pointer group relative" tabIndex={0} aria-label="Show reliability details">
                    <svg width="16" height="16" fill="currentColor" className="inline-block text-gray-200 group-hover:text-gray-700" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" fill="none" /><text x="10" y="14" textAnchor="middle" fontSize="12" fill="currentColor" fontFamily="Arial">i</text></svg>
                    <div className="absolute left-1/2 -translate-x-1/2 mt-2 z-10 w-max min-w-[220px] bg-white border border-gray-300 rounded shadow-lg p-3 text-xs text-gray-700 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition pointer-events-none group-hover:pointer-events-auto group-focus:pointer-events-auto">
                      <div>Variance_pred_scaled: <b>{variance}</b></div>
                      <div>Reliability Range: <b>{minVariance} (best) to {maxVariance} (worst)</b></div>
                      <div>Reliability Score: <b>{reliabilityScore.toFixed(4)}</b></div>
                    </div>
                  </span>
                  <div className="flex flex-col w-full max-w-[320px] mt-2">
                    <div className="bg-gray-200 rounded h-[22px] w-full relative">
                      <div
                        className="absolute left-0 top-0 h-full rounded transition-all"
                        style={{
                          width: `${Math.max(Math.min(Math.round(reliabilityScore * 100), 100), 0)}%`,
                          background: reliabilityColor
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 w-full">
                      <span className="text-xs text-gray-500">Low</span>
                      <span className="text-xs text-gray-500">High</span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
          <div className="mb-6">
            {(() => {
              const similarity = selectedFeature.properties.ncdd_embeddings;
              const minSimilarity = -8.22;
              const maxSimilarity = -1.87;
              const dataReliabilityScore = similarity !== undefined ? 1 - ((similarity - minSimilarity) / (maxSimilarity - minSimilarity)) : 0;
              const dataReliabilityColor = dataReliabilityScore > 0.7 ? '#43a047' : dataReliabilityScore > 0.4 ? '#ff9800' : '#e53935';
              return (
                <>
                  <label className={`text-base`} style={{ color: dataReliabilityColor }}>
                    Data Reliability:
                  </label>
                  <span className={`text-base ml-3`} style={{ color: dataReliabilityColor }}>
                    {dataReliabilityScore.toFixed(2)}
                  </span>
                  <span className="ml-2 cursor-pointer group relative" tabIndex={0} aria-label="Show data reliability details">
                    <svg width="16" height="16" fill="currentColor" className="inline-block text-gray-200 group-hover:text-gray-700" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" fill="none" /><text x="10" y="14" textAnchor="middle" fontSize="12" fill="currentColor" fontFamily="Arial">i</text></svg>
                    <div className="absolute left-1/2 -translate-x-1/2 mt-2 z-10 w-max min-w-[220px] bg-white border border-gray-300 rounded shadow-lg p-3 text-xs text-gray-700 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition pointer-events-none group-hover:pointer-events-auto group-focus:pointer-events-auto">
                      <div>ncdd_embeddings: <b>{similarity}</b></div>
                      <div>Reliability Range: <b>{minSimilarity} (best) to {maxSimilarity} (worst)</b></div>
                      <div>Reliability Score: <b>{dataReliabilityScore.toFixed(4)}</b></div>
                    </div>
                  </span>
                  <div className="flex flex-col w-full max-w-[320px] mt-2">
                    <div className="bg-gray-200 rounded h-[22px] w-full relative">
                      <div
                        className="absolute left-0 top-0 h-full rounded transition-all"
                        style={{
                          width: `${Math.max(Math.min(Math.round(dataReliabilityScore * 100), 100), 0)}%`,
                          background: dataReliabilityColor
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 w-full">
                      <span className="text-xs text-gray-500">Low</span>
                      <span className="text-xs text-gray-500">High</span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
