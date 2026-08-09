import L from "leaflet";
import { createElement, useEffect, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import "leaflet/dist/leaflet.css";
import { pinTypeDef, type Pin } from "@/lib/pin-types";
import type { GeoPosition } from "@/hooks/useGeolocation";

type Props = {
  pins: Pin[];
  showPins: boolean;
  position: GeoPosition | null;
  heading: number | null;
  draft: { lat: number; lng: number } | null;
  focus: { lat: number; lng: number; id?: string } | null;
  /** when true, taps place/move the temporary marker instead of doing nothing */
  addMode: boolean;
  /** when true, authorised pins become draggable */
  editMode: boolean;
  canMove: (pin: Pin) => boolean;
  onMapTap: (latlng: { lat: number; lng: number }) => void;
  onDraftMove: (latlng: { lat: number; lng: number }) => void;
  onSelectPin: (pin: Pin) => void;
  onSelectMany: (pins: Pin[]) => void;
  onPinDragged: (pin: Pin, latlng: { lat: number; lng: number }) => void;
};

function markerHtml(pin: Pin, dim: boolean) {
  const def = pinTypeDef(pin.pin_type);
  const icon = renderToStaticMarkup(
    createElement(def.icon, { size: 15, color: "white", strokeWidth: 2.4 }),
  );
  return `<div style="
      width:34px;height:34px;border-radius:50% 50% 50% 6px;transform:rotate(-45deg);
      display:grid;place-items:center;background:${def.color};opacity:${dim ? 0.45 : 1};
      border:2px solid rgba(255,255,255,0.92);
      box-shadow:0 6px 16px -4px rgba(10,30,60,0.45);">
      <div style="transform:rotate(45deg);display:grid;place-items:center;">${icon}</div>
    </div>`;
}

function stackHtml(pins: Pin[]) {
  const def = pinTypeDef(pins[0]!.pin_type);
  return `<div style="position:relative;width:38px;height:38px;">
      <div style="position:absolute;inset:0;border-radius:50% 50% 50% 6px;transform:rotate(-45deg);
        background:${def.color};border:2px solid rgba(255,255,255,0.92);
        box-shadow:0 6px 16px -4px rgba(10,30,60,0.45);"></div>
      <div style="position:absolute;top:-6px;right:-6px;min-width:20px;height:20px;padding:0 5px;
        border-radius:999px;background:white;color:#0b2a4a;font-size:11px;font-weight:700;
        display:grid;place-items:center;box-shadow:0 4px 10px -3px rgba(10,30,60,0.5);">${pins.length}</div>
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
  showPins,
  position,
  heading,
  draft,
  focus,
  addMode,
  editMode,
  canMove,
  onMapTap,
  onDraftMove,
  onSelectPin,
  onSelectMany,
  onPinDragged,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const meRef = useRef<{ marker: L.CircleMarker; circle: L.Circle; cone: L.Marker } | null>(null);
  const draftRef = useRef<L.Marker | null>(null);
  const centeredRef = useRef(false);
  const renderRef = useRef<() => void>(() => {});

  // Latest callbacks/data without re-binding map listeners.
  const tapRef = useRef(onMapTap);
  const selectRef = useRef(onSelectPin);
  const selectManyRef = useRef(onSelectMany);
  const draftMoveRef = useRef(onDraftMove);
  const draggedRef = useRef(onPinDragged);
  const canMoveRef = useRef(canMove);
  const pinsRef = useRef(pins);
  const showRef = useRef(showPins);
  const editRef = useRef(editMode);
  tapRef.current = onMapTap;
  selectRef.current = onSelectPin;
  selectManyRef.current = onSelectMany;
  draftMoveRef.current = onDraftMove;
  draggedRef.current = onPinDragged;
  canMoveRef.current = canMove;
  pinsRef.current = pins;
  showRef.current = showPins;
  editRef.current = editMode;

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
      const cone = L.marker(latlng, {
        interactive: false,
        zIndexOffset: -100,
        icon: L.divIcon({ className: "", html: "", iconSize: [0, 0] }),
      }).addTo(map);
      const marker = L.circleMarker(latlng, {
        radius: 8,
        color: "white",
        weight: 3,
        fillColor: "oklch(0.55 0.2 259)",
        fillOpacity: 1,
        interactive: false,
      }).addTo(map);
      meRef.current = { marker, circle, cone };
    } else {
      meRef.current.marker.setLatLng(latlng);
      meRef.current.circle.setLatLng(latlng).setRadius(position.accuracy);
      meRef.current.cone.setLatLng(latlng);
    }
    if (!centeredRef.current) {
      centeredRef.current = true;
      map.flyTo(latlng, 17, { duration: 1.1 });
    }
  }, [position]);

  // ---- heading cone (only when the device reports one) ----
  useEffect(() => {
    const me = meRef.current;
    if (!me) return;
    if (heading == null) {
      me.cone.setIcon(L.divIcon({ className: "", html: "", iconSize: [0, 0] }));
      return;
    }
    me.cone.setIcon(
      L.divIcon({
        className: "",
        iconSize: [56, 56],
        iconAnchor: [28, 28],
        html: `<div style="width:56px;height:56px;transform:rotate(${heading}deg);">
            <div style="width:0;height:0;margin:0 auto;
              border-left:16px solid transparent;border-right:16px solid transparent;
              border-bottom:26px solid rgba(37,99,235,0.35);"></div>
          </div>`,
      }),
    );
  }, [heading, position]);

  // ---- pins + clustering (stable lifecycle, keyed by pin ids) ----
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    let frame = 0;
    let lastKey = "";

    const draw = () => {
      const zoom = map.getZoom();
      const list = showRef.current ? pinsRef.current : [];
      // Signature covers every pin id + position + type, so markers are only
      // rebuilt when the data (or zoom bucket) really changed.
      let sig = `${zoom}|${editRef.current ? "e" : ""}|${list.length}|`;
      for (const p of list) sig += `${p.id}:${p.latitude}:${p.longitude}:${p.pin_type};`;
      if (sig === lastKey) return;
      lastKey = sig;

      layer.clearLayers();
      const cell = zoom >= 17 ? 0 : 0.6 / 2 ** (zoom - 4);
      // At high zoom, still group pins within ~1.5 m so nothing is hidden underneath.
      const exact = 0.000015;
      const groups = new Map<string, Pin[]>();
      for (const pin of list) {
        const gkey =
          cell === 0
            ? `${Math.round(pin.latitude / exact)}:${Math.round(pin.longitude / exact)}`
            : `${Math.round(pin.latitude / cell)}:${Math.round(pin.longitude / cell)}`;
        const g = groups.get(gkey);
        if (g) g.push(pin);
        else groups.set(gkey, [pin]);
      }

      for (const group of groups.values()) {
        const stacked = cell === 0 && group.length > 1;
        if (group.length === 1 || stacked) {
          const pin = group[0]!;
          const draggable = editRef.current && group.length === 1 && canMoveRef.current(pin);
          const marker = L.marker([pin.latitude, pin.longitude], {
            draggable,
            icon: L.divIcon({
              html: stacked ? stackHtml(group) : markerHtml(pin, editRef.current && !draggable),
              className: "",
              iconSize: [34, 34],
              iconAnchor: [17, 30],
            }),
          })
            .on("click", (e) => {
              L.DomEvent.stopPropagation(e as unknown as Event);
              if (stacked) selectManyRef.current(group);
              else selectRef.current(pin);
            })
            .addTo(layer);
          if (draggable) {
            marker.on("dragend", () => {
              const p = marker.getLatLng();
              draggedRef.current(pin, { lat: p.lat, lng: p.lng });
            });
          }
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
      schedule();
    };

    renderRef.current();
    map.on("zoomend", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      map.off("zoomend", schedule);
    };
  }, []);

  // redraw when pin data / visibility / edit mode changes
  useEffect(() => {
    renderRef.current();
  }, [pins, showPins, editMode]);

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
        zIndexOffset: 1000,
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

  // In Add Pin Mode existing markers must not swallow taps meant for placement.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.classList.toggle("add-pin-mode", addMode);
  }, [addMode]);

  return <div ref={containerRef} className="absolute inset-0 z-0" />;
}
