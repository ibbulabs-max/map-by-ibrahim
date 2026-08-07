import {
  Home,
  Lock,
  Ban,
  Store,
  Moon,
  Landmark,
  Church,
  School,
  GraduationCap,
  Hospital,
  Briefcase,
  Building2,
  Building,
  HardHat,
  Trees,
  TreePine,
  Hotel,
  UtensilsCrossed,
  Fuel,
  MapPin,
  type LucideIcon,
} from "lucide-react";

export type PinTypeDef = {
  value: string;
  label: string;
  icon: LucideIcon;
  /** oklch color used for the marker glyph */
  color: string;
};

export const PIN_TYPES: PinTypeDef[] = [
  { value: "house", label: "House", icon: Home, color: "oklch(0.58 0.19 259)" },
  { value: "locked_house", label: "Locked House", icon: Lock, color: "oklch(0.62 0.13 285)" },
  { value: "refused", label: "Refused", icon: Ban, color: "oklch(0.6 0.22 25)" },
  { value: "shop", label: "Shop", icon: Store, color: "oklch(0.68 0.16 45)" },
  { value: "mosque", label: "Mosque", icon: Moon, color: "oklch(0.6 0.14 165)" },
  { value: "temple", label: "Temple", icon: Landmark, color: "oklch(0.7 0.16 60)" },
  { value: "church", label: "Church", icon: Church, color: "oklch(0.58 0.11 300)" },
  { value: "school", label: "School", icon: School, color: "oklch(0.62 0.17 240)" },
  { value: "college", label: "College", icon: GraduationCap, color: "oklch(0.5 0.16 275)" },
  { value: "hospital", label: "Hospital", icon: Hospital, color: "oklch(0.62 0.2 15)" },
  { value: "office", label: "Office", icon: Briefcase, color: "oklch(0.52 0.06 250)" },
  { value: "government_office", label: "Government Office", icon: Building2, color: "oklch(0.45 0.1 250)" },
  { value: "apartment", label: "Apartment", icon: Building, color: "oklch(0.55 0.12 220)" },
  { value: "construction", label: "Construction", icon: HardHat, color: "oklch(0.75 0.16 85)" },
  { value: "empty_land", label: "Empty Land", icon: Trees, color: "oklch(0.68 0.12 130)" },
  { value: "park", label: "Park", icon: TreePine, color: "oklch(0.62 0.15 145)" },
  { value: "hotel", label: "Hotel", icon: Hotel, color: "oklch(0.6 0.14 320)" },
  { value: "restaurant", label: "Restaurant", icon: UtensilsCrossed, color: "oklch(0.65 0.18 35)" },
  { value: "petrol_pump", label: "Petrol Pump", icon: Fuel, color: "oklch(0.58 0.19 195)" },
  { value: "other", label: "Other", icon: MapPin, color: "oklch(0.5 0.02 260)" },
];

export const PIN_TYPE_MAP: Record<string, PinTypeDef> = Object.fromEntries(
  PIN_TYPES.map((t) => [t.value, t]),
);

export function pinTypeDef(value: string): PinTypeDef {
  return PIN_TYPE_MAP[value] ?? PIN_TYPE_MAP["other"]!;
}

export function pinTypeLabel(value: string, customType?: string | null): string {
  if (value === "other" && customType) return customType;
  return pinTypeDef(value).label;
}

export type Pin = {
  id: string;
  user_id: string;
  username: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  pin_type: string;
  custom_type: string | null;
  house_id: string | null;
  house_number: string | null;
  owner_name: string | null;
  notes: string | null;
  device_time: string | null;
  device_id: string | null;
  created_at: string;
  updated_at: string;
};

export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}
