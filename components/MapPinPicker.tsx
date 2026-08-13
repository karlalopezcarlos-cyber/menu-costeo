"use client";

import { useEffect, useRef, useState } from "react";

// Se carga Mapbox GL JS via CDN (script + css) en vez de import npm, para evitar la restriccion de
// Next.js de que un import de CSS "global" (no-modulo) solo se puede hacer en el layout raiz, y
// para no meter mapbox-gl al bundle de paginas que no usan mapa.
const MAPBOX_JS_URL = "https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.js";
const MAPBOX_CSS_URL = "https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.css";

const MEXICO_CITY = { lat: 19.4326, lng: -99.1332 };

declare global {
  interface Window {
    mapboxgl?: any;
  }
}

let mapboxglLoadPromise: Promise<any> | null = null;

function loadMapboxGl(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("No hay ventana de navegador."));
  if (window.mapboxgl) return Promise.resolve(window.mapboxgl);
  if (mapboxglLoadPromise) return mapboxglLoadPromise;

  mapboxglLoadPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${MAPBOX_CSS_URL}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = MAPBOX_CSS_URL;
      document.head.appendChild(link);
    }

    const existing = document.querySelector(`script[src="${MAPBOX_JS_URL}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(window.mapboxgl));
      existing.addEventListener("error", () => reject(new Error("No se pudo cargar el mapa.")));
      return;
    }

    const script = document.createElement("script");
    script.src = MAPBOX_JS_URL;
    script.async = true;
    script.onload = () => resolve(window.mapboxgl);
    script.onerror = () => reject(new Error("No se pudo cargar el mapa."));
    document.head.appendChild(script);
  });

  return mapboxglLoadPromise;
}

/**
 * Mapa interactivo con un pin arrastrable, para afinar una ubicacion con mas precision de la que
 * da la geocodificacion por texto sola. Se usa tanto en Configuracion (ubicacion del negocio) como
 * en el checkout de la tienda publica (direccion de entrega del cliente).
 */
export default function MapPinPicker({
  lat,
  lng,
  onChange,
  height = 260,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      setLoadError("El mapa no esta configurado.");
      return;
    }
    let cancelled = false;

    loadMapboxGl()
      .then((mapboxgl) => {
        if (cancelled || !containerRef.current) return;
        mapboxgl.accessToken = token;

        const center = lat != null && lng != null ? { lat, lng } : MEXICO_CITY;
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/streets-v12",
          center: [center.lng, center.lat],
          zoom: lat != null && lng != null ? 15 : 4,
        });
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

        const marker = new mapboxgl.Marker({ draggable: true, color: "#171717" })
          .setLngLat([center.lng, center.lat])
          .addTo(map);

        marker.on("dragend", () => {
          const pos = marker.getLngLat();
          onChangeRef.current(pos.lat, pos.lng);
        });
        map.on("click", (e: any) => {
          marker.setLngLat(e.lngLat);
          onChangeRef.current(e.lngLat.lat, e.lngLat.lng);
        });

        mapRef.current = map;
        markerRef.current = marker;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setLoadError("No se pudo cargar el mapa. Puedes seguir sin ajustar el pin.");
      });

    return () => {
      cancelled = true;
      markerRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Solo se inicializa una vez; los cambios de lat/lng despues se aplican en el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si lat/lng cambian desde afuera (ej. se geocodifico una nueva direccion), se recentra el mapa y
  // se mueve el pin -- sin esto, escribir una direccion distinta dejaria el pin viejo mal ubicado.
  useEffect(() => {
    if (!ready || lat == null || lng == null || !mapRef.current || !markerRef.current) return;
    const current = markerRef.current.getLngLat();
    const moved = Math.abs(current.lat - lat) > 1e-6 || Math.abs(current.lng - lng) > 1e-6;
    if (!moved) return;
    markerRef.current.setLngLat([lng, lat]);
    mapRef.current.flyTo({ center: [lng, lat], zoom: Math.max(mapRef.current.getZoom(), 14) });
  }, [ready, lat, lng]);

  if (loadError) {
    return (
      <p className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-3 text-xs text-neutral-500">
        {loadError}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <div
        ref={containerRef}
        style={{ height }}
        className="w-full overflow-hidden rounded-lg border border-neutral-300 bg-neutral-100"
      />
      <p className="text-xs text-neutral-500">Arrastra el pin para ajustar la ubicacion exacta.</p>
    </div>
  );
}
