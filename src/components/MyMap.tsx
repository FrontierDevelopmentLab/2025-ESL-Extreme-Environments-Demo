"use client";
import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";
import "leaflet-defaulticon-compatibility";
import type { Feature, FeatureCollection, Point } from "geojson";
import type { MutableRefObject } from "react";

let Icon: typeof import("leaflet").Icon | null = null;
if (typeof window !== "undefined") {
    if (window.L && window.L.Icon) {
        Icon = window.L.Icon;
    } else {
        import("leaflet").then(leaflet => {
            Icon = leaflet.Icon;
        });
    }
}

export default function MyMap({
    geojson,
    onMarkerClick,
    mapRef,
    center = [39.8283, -98.5795],
    zoom = 5,
}: {
    geojson: FeatureCollection<Point, Record<string, unknown>> | null;
    onMarkerClick: (feature: Feature<Point, Record<string, unknown>>) => void;
    mapRef: MutableRefObject<L.Map | null>;
    center?: [number, number];
    zoom?: number;
}) {
    const allLatLngs: [number, number][] = useMemo(() => {
        if (!geojson) return [];
        return geojson.features
            .filter((f): f is Feature<Point, Record<string, unknown>> =>
                f &&
                f.geometry &&
                f.geometry.type === "Point" &&
                Array.isArray(f.geometry.coordinates) &&
                f.geometry.coordinates.length === 2
            )
            .map((f) => [f.geometry.coordinates[1], f.geometry.coordinates[0]]);
    }, [geojson]);

    useEffect(() => {
        if (mapRef.current && allLatLngs.length > 0) {
            import("leaflet").then(L => {
                const bounds = L.latLngBounds(allLatLngs as [number, number][]);
                mapRef.current?.fitBounds(bounds, { padding: [32, 32], maxZoom: 10 });
            });
        }
    }, [allLatLngs, mapRef]);

    function getReliabilityColor(variance: number, ncdd: number) {
        const unreliableVariance = variance > 0.1;
        const unreliableNcdd = ncdd > -5.25;
        if (unreliableVariance && unreliableNcdd) return "#e53935";
        if (unreliableVariance || unreliableNcdd) return "#ff9800";
        return "#43a047";
    }

    return (
        <MapContainer ref={mapRef} center={center} zoom={zoom} minZoom={2} style={{ height: "100%", width: "100%" }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {Icon && geojson && geojson.features.filter((_, idx) => idx % 2 === 0).map((feature, idx) => {
                if (
                    !feature ||
                    !feature.geometry ||
                    feature.geometry.type !== "Point" ||
                    !Array.isArray(feature.geometry.coordinates) ||
                    feature.geometry.coordinates.length !== 2 ||
                    !feature.properties
                ) return null;
                const [lon, lat] = feature.geometry.coordinates;
                const variance = feature.properties.Variance_pred_scaled as number;
                const ncdd = feature.properties.ncdd_embeddings as number;
                const markerColor = getReliabilityColor(variance, ncdd);
                const iconSvg = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="${markerColor}" xmlns="http://www.w3.org/2000/svg">
        <path d="M11.9998 8.99999V13M11.9998 17H12.0098M10.6151 3.89171L2.39019 18.0983C1.93398 18.8863 1.70588 19.2803 1.73959 19.6037C1.769 19.8857 1.91677 20.142 2.14613 20.3088C2.40908 20.5 2.86435 20.5 3.77487 20.5H20.2246C21.1352 20.5 21.5904 20.5 21.8534 20.3088C22.0827 20.142 22.2305 19.8857 22.2599 19.6037C22.2936 19.2803 22.0655 18.8863 21.6093 18.0983L13.3844 3.89171C12.9299 3.10654 12.7026 2.71396 12.4061 2.58211C12.1474 2.4671 11.8521 2.4671 11.5935 2.58211C11.2969 2.71396 11.0696 3.10655 10.6151 3.89171Z" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
                if (!Icon) return null;
                const markerIcon = new Icon({
                    iconUrl: `data:image/svg+xml;utf8,${encodeURIComponent(iconSvg)}`,
                    iconSize: [32, 32],
                    iconAnchor: [16, 32],
                    popupAnchor: [0, -32],
                });
                return (
                    <Marker
                        key={"geojson-" + idx}
                        position={[lat, lon]}
                        icon={markerIcon}
                        eventHandlers={{
                            click: () => {
                                onMarkerClick(feature);
                                if (mapRef.current) {
                                    mapRef.current.setView([lat - 2, lon], 7);
                                }
                            }
                        }}
                    />
                );
            })}
        </MapContainer>
    );
}
