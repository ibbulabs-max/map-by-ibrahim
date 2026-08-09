import { useCallback, useEffect, useRef, useState } from "react";

export type GeoPosition = {
  lat: number;
  lng: number;
  accuracy: number;
};

export function useGeolocation() {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const watchRef = useRef<number | null>(null);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Location is not available on this device");
      return;
    }

    let cancelled = false;

    const onSuccess = (pos: GeolocationPosition) => {
      if (cancelled) return;
      setError(null);
      // Only trust a GPS-reported heading while actually moving.
      if (
        typeof pos.coords.heading === "number" &&
        !Number.isNaN(pos.coords.heading) &&
        (pos.coords.speed ?? 0) > 0.5
      ) {
        setHeading(pos.coords.heading);
      }
      setPosition((prev) => {
        const next = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        // Avoid flicker: ignore micro-updates that don't move the marker meaningfully.
        if (
          prev &&
          Math.abs(prev.lat - next.lat) < 1e-6 &&
          Math.abs(prev.lng - next.lng) < 1e-6 &&
          Math.abs(prev.accuracy - next.accuracy) < 1
        ) {
          return prev;
        }
        return next;
      });
    };

    const onError = (err: GeolocationPositionError) => {
      if (cancelled) return;
      setError(
        err.code === err.PERMISSION_DENIED
          ? "Location permission denied. Enable it to see your position on the map."
          : err.code === err.TIMEOUT
            ? "Couldn't get a GPS fix. Move to an open area and try again."
            : err.message || "Location unavailable",
      );
      // Keep the last known position so the blue marker never disappears.
    };

    // Fast first fix, then a high-accuracy watch.
    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      maximumAge: 60000,
      timeout: 10000,
    });

    watchRef.current = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 25000,
    });

    return () => {
      cancelled = true;
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    };
  }, [attempt]);

  // Device compass heading — only used when the platform actually reports it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOrientation = (e: DeviceOrientationEvent) => {
      const webkit = (e as DeviceOrientationEvent & { webkitCompassHeading?: number })
        .webkitCompassHeading;
      if (typeof webkit === "number" && !Number.isNaN(webkit)) {
        setHeading(webkit);
        return;
      }
      if (e.absolute && typeof e.alpha === "number" && !Number.isNaN(e.alpha)) {
        setHeading((360 - e.alpha) % 360);
      }
    };
    window.addEventListener("deviceorientationabsolute", onOrientation as EventListener);
    window.addEventListener("deviceorientation", onOrientation as EventListener);
    return () => {
      window.removeEventListener("deviceorientationabsolute", onOrientation as EventListener);
      window.removeEventListener("deviceorientation", onOrientation as EventListener);
    };
  }, []);

  return { position, heading, error, retry };
}
