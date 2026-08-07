import L from "leaflet";
import { createElement, useEffect, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import "leaflet/dist/leaflet.css";
import { pinTypeDef, type Pin } from "@/lib/pin-types";
import type { GeoPosition } from "@/hooks/useGeolocation";

type Props = {
  pins: Pin[];
  position: GeoPosition | null;
  draft: { lat: number; lng: number } | null;
  focus: { lat: number; lng: number; id?: string } | null;
  onMapTap: (latlng: { lat: number; lng: number }) => void;
  onDraftMove: (latlng: { lat: number; lng: number }) => void;
  onSelectPin: (pin: Pin) => void;
};

function markerHtml(pin: Pin) {
  const def = pinTypeDef(pin.pin_type);
  const icon = renderToStaticMarkup(
    createElement(def.icon, { size: 15, color: "white", strokeWidth: 2.4 }),
  );
  return `<div style="
      width:34px;height:34px;border-radius:50% 50% 50% 6px;transform:rotate(-45deg);
      display:grid;place-items:center;background:${def.color};
      border:2px solid rgba(255,255,255,0.92);
      box-shadow:0 6px 16px -4px rgba(10,30,60,0.45);">
      <div style="transform:rotate(45deg);display:grid;place-items:center;">${icon}</div>
    </div>`;
}

function clusterHtml(count: number) {
  const size = count > 99 ? 48 : count > 9 ? 42 : 36;
  return `<div style="
      width:${size}px;height:${size}px;border-radius:50%;display:grid;place-items:center;
      background:linear-gradient(135deg, oklch(0.58 0.19 259), oklch(0.72 0.15 235));
      color:white;font-weight:700;font-size:${count > 99 ? 12 : 13}px;
      border:3px solid rgba(255,255,255,0.85);
      box-shadow:0 8px 22px -6px rgba(10,30,60,0.5);">${count}</div>`;
}

export default function LeafletMap({
  pins,
  position,
  draft,
  focus,
  onMapTap,
  onDraftMove,
  onSelectPin,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const meRef = useRef<{ marker: L.CircleMarker; circle: L.Circle } | null>(null);
  const draftRef = useRef<L.Marker | null>(null);
  const centeredRef = useRef(false);
  const renderRef = useRef<() => void>(() => {});

  // Latest callbacks/data without re-binding map listeners.
  const tapRef = useRef(onMapTap);
  const selectRef = useRef(onSelectPin);
  const draftMoveRef = useRef(onDraftMove);
  const pinsRef = useRef(pins);
  tapRef.current = onMapTap;
  selectRef.current = onSelectPin;
  draftMoveRef.current = onDraftMove;
  pinsRef.current = pins;

  // ---- map init (once) ----
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [20.5937, 78.9629],
      zoom: 5,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: false,
      tap: true,
      zoomAnimation: true,
      markerZoomAnimation: true,
    } as L.MapOptions);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
      keepBuffer: 4,
      updateWhenIdle: false,
    }).addTo(map);

    L.control.zoom({ position: "bottomleft" }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);

    // Any tap on the map drops / moves the temporary marker.
    map.on("click", (e: L.LeafletMouseEvent) => {
      tapRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    mapRef.current = map;

    const invalidate = () => map.invalidateSize();
    const t = window.setTimeout(invalidate, 120);
    window.addEventListener("resize", invalidate);
    window.addEventListener("orientationchange", invalidate);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("orientationchange", invalidate);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      meRef.current = null;
      draftRef.current = null;
      centeredRef.current = false;
    };
  }, []);

  // ---- current location (never removed) ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position) return;
    const latlng = L.latLng(position.lat, position.lng);
    if (!meRef.current) {
      const circle = L.circle(latlng, {
        radius: position.accuracy,
        color: "oklch(0.58 0.19 259)",
        fillColor: "oklch(0.58 0.19 259)",
        fillOpacity: 0.12,
        weight: 1,
        interactive: false,
      }).addTo(map);
      const marker = L.circleMarker(latlng, {
        radius: 8,
        color: "white",
        weight: 3,
        fillColor: "oklch(0.55 0.2 259)",
        fillOpacity: 1,
        interactive: false,
      }).addTo(map);
      meRef.current = { marker, circle };
    } else {
      meRef.current.marker.setLatLng(latlng);
      meRef.current.circle.setLatLng(latlng).setRadius(position.accuracy);
    }
    if (!centeredRef.current) {
      centeredRef.current = true;
      map.flyTo(latlng, 17, { duration: 1.1 });
    }
  }, [position]);

  // ---- pins + clustering ----
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    let frame = 0;
    let lastKey = "";

    const draw = () => {
      const zoom = map.getZoom();
      const list = pinsRef.current;
      const key = `${zoom}:${list.length}:${list[0]?.id ?? ""}:${list[0]?.updated_at ?? ""}`;
      if (key === lastKey) return;
      lastKey = key;

      layer.clearLayers();
      const cell = zoom >= 17 ? 0 : 0.6 / 2 ** (zoom - 4);
      const groups = new Map<string, Pin[]>();
      for (const pin of list) {
        const gkey =
          cell === 0
            ? pin.id
            : `${Math.round(pin.latitude / cell)}:${Math.round(pin.longitude / cell)}`;
        const g = groups.get(gkey);
        if (g) g.push(pin);
        else groups.set(gkey, [pin]);
      }
      for (const group of groups.values()) {
        if (group.length === 1) {
          const pin = group[0]!;
          L.marker([pin.latitude, pin.longitude], {
            icon: L.divIcon({
              html: markerHtml(pin),
              className: "",
              iconSize: [34, 34],
              iconAnchor: [17, 30],
            }),
          })
            .on("click", (e) => {
              L.DomEvent.stopPropagation(e as unknown as Event);
              selectRef.current(pin);
            })
            .addTo(layer);
        } else {
          const lat = group.reduce((s, p) => s + p.latitude, 0) / group.length;
          const lng = group.reduce((s, p) => s + p.longitude, 0) / group.length;
          L.marker([lat, lng], {
            icon: L.divIcon({ html: clusterHtml(group.length), className: "", iconSize: [42, 42] }),
          })
            .on("click", (e) => {
              L.DomEvent.stopPropagation(e as unknown as Event);
              map.flyTo([lat, lng], Math.min(19, map.getZoom() + 3));
            })
            .addTo(layer);
        }
      }
    };

    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };

    renderRef.current = () => {
      lastKey = "";
      schedule();
    };

    renderRef.current();
    map.on("zoomend", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      map.off("zoomend", schedule);
    };
  }, []);

  // redraw when pin data changes
  useEffect(() => {
    renderRef.current();
  }, [pins]);

  // ---- draft marker ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!draft) {
      draftRef.current?.remove();
      draftRef.current = null;
      return;
    }
    if (!draftRef.current) {
      const marker = L.marker([draft.lat, draft.lng], {
        draggable: true,
        autoPan: true,
        icon: L.divIcon({
          className: "",
          iconSize: [40, 40],
          iconAnchor: [20, 36],
          html: `<div style="width:40px;height:40px;border-radius:50% 50% 50% 6px;transform:rotate(-45deg);
            background:linear-gradient(135deg, oklch(0.58 0.19 259), oklch(0.72 0.15 235));
            border:3px solid white;box-shadow:0 10px 26px -6px rgba(10,30,60,0.55);"></div>`,
        }),
      }).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        draftMoveRef.current({ lat: p.lat, lng: p.lng });
      });
      draftRef.current = marker;
    } else {
      draftRef.current.setLatLng([draft.lat, draft.lng]);
    }
  }, [draft]);

  // ---- external focus ----
  useEffect(() => {
    if (!focus || !mapRef.current) return;
    mapRef.current.flyTo([focus.lat, focus.lng], 18, { duration: 0.9 });
  }, [focus]);

  return <div ref={containerRef} className="absolute inset-0 z-0" />;
}
