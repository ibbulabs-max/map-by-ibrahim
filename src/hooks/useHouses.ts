import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { House, HouseMember } from "@/lib/houses";
import type { PreparedHouse } from "@/lib/excel-import";

const SELECT = "*, house_members(*)";

/** Live refresh for houses + members, mirroring the pins realtime hook. */
function useHousesRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("houses-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "houses" }, () => {
        void qc.invalidateQueries({ queryKey: ["houses"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "house_members" }, () => {
        void qc.invalidateQueries({ queryKey: ["houses"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);
}

export function useHouses() {
  useHousesRealtime();
  return useQuery({
    queryKey: ["houses"],
    queryFn: async (): Promise<House[]> => {
      const { data, error } = await supabase
        .from("houses")
        .select(SELECT)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as House[];
    },
  });
}

/** Writes an entry into the existing activity log (audit trail). */
export function useHouseAudit() {
  const { session, profile, role } = useAuth();
  return async (action: string, details: Record<string, unknown>) => {
    if (!session || !profile) return;
    await supabase.from("activity_logs").insert({
      user_id: session.user.id,
      username: profile.username,
      action,
      details: { role, ...details },
    });
  };
}

export function useUpdateHouse() {
  const qc = useQueryClient();
  const audit = useHouseAudit();
  return useMutation({
    mutationFn: async ({
      house,
      patch,
      action = "house_updated",
    }: {
      house: House;
      patch: Partial<House>;
      action?: string;
    }) => {
      const { error } = await supabase.from("houses").update(patch as never).eq("id", house.id);
      if (error) throw error;
      const before: Record<string, unknown> = {};
      for (const key of Object.keys(patch)) before[key] = (house as Record<string, unknown>)[key];
      await audit(action, {
        house_uuid: house.id,
        house_id: house.house_id,
        old_value: before,
        new_value: patch,
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["houses"] }),
  });
}

export function useSaveMember() {
  const qc = useQueryClient();
  const audit = useHouseAudit();
  return useMutation({
    mutationFn: async ({
      house,
      member,
      patch,
    }: {
      house: House;
      member?: HouseMember;
      patch: Partial<HouseMember>;
    }) => {
      if (member) {
        const { error } = await supabase.from("house_members").update(patch as never).eq("id", member.id);
        if (error) throw error;
        await audit("member_updated", {
          house_uuid: house.id,
          house_id: house.house_id,
          record_id: member.id,
          old_value: { member_id: member.member_id, member_name: member.member_name },
          new_value: patch,
        });
        return;
      }
      const { error } = await supabase
        .from("house_members")
        .insert({ house_uuid: house.id, ...patch, data: patch.data ?? {} } as never);
      if (error) throw error;
      await audit("member_added", {
        house_uuid: house.id,
        house_id: house.house_id,
        new_value: patch,
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["houses"] }),
  });
}

export function useDeleteMember() {
  const qc = useQueryClient();
  const audit = useHouseAudit();
  return useMutation({
    mutationFn: async ({ house, member }: { house: House; member: HouseMember }) => {
      const { error } = await supabase.from("house_members").delete().eq("id", member.id);
      if (error) throw error;
      await audit("member_removed", {
        house_uuid: house.id,
        house_id: house.house_id,
        record_id: member.id,
        old_value: { member_id: member.member_id, member_name: member.member_name },
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["houses"] }),
  });
}

/** Saves / moves a House location and audits the old → new coordinates. */
export function useSaveHouseLocation() {
  const qc = useQueryClient();
  const audit = useHouseAudit();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({
      house,
      lat,
      lng,
      accuracy,
      source = "manual",
    }: {
      house: House;
      lat: number;
      lng: number;
      accuracy?: number | null;
      source?: string;
    }) => {
      const moved = house.latitude !== null && house.longitude !== null;
      const { error } = await supabase
        .from("houses")
        .update({
          latitude: lat,
          longitude: lng,
          accuracy: accuracy ?? null,
          location_status: "mapped",
          location_source: source,
          mapped_by: session?.user.id ?? null,
          mapped_at: new Date().toISOString(),
        })
        .eq("id", house.id);
      if (error) throw error;
      await audit(moved ? "house_location_moved" : "house_location_added", {
        house_uuid: house.id,
        house_id: house.house_id,
        old_value: { latitude: house.latitude, longitude: house.longitude },
        new_value: { latitude: lat, longitude: lng, accuracy: accuracy ?? null },
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["houses"] }),
  });
}

export type ImportMode = "skip" | "update";

export type ImportResult = { created: number; updated: number; skipped: number; members: number };

/** Bulk import prepared houses — one canonical record per House ID. */
export function useImportHouses() {
  const qc = useQueryClient();
  const audit = useHouseAudit();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({
      houses,
      mode,
      onProgress,
    }: {
      houses: PreparedHouse[];
      mode: ImportMode;
      onProgress?: (done: number, total: number) => void;
    }): Promise<ImportResult> => {
      const userId = session?.user.id ?? null;
      const result: ImportResult = { created: 0, updated: 0, skipped: 0, members: 0 };

      const { data: existingRows, error: exErr } = await supabase
        .from("houses")
        .select("id, house_id, house_number, data, latitude, longitude");
      if (exErr) throw exErr;
      const existing = new Map(
        (existingRows ?? []).map((h) => [String(h.house_id).toUpperCase(), h]),
      );

      let done = 0;
      for (const prepared of houses) {
        const key = prepared.house_id.toUpperCase();
        const found = existing.get(key);
        let houseUuid: string | null = null;

        if (found) {
          if (mode === "skip") {
            result.skipped += 1;
            done += 1;
            onProgress?.(done, houses.length);
            continue;
          }
          const patch = {
            house_number: prepared.house_number ?? found.house_number,
            status: prepared.status,
            data: { ...(found.data as Record<string, unknown>), ...prepared.data },
            ...(prepared.latitude !== null && prepared.longitude !== null && found.latitude === null
              ? {
                  latitude: prepared.latitude,
                  longitude: prepared.longitude,
                  location_status: "mapped",
                  location_source: "import",
                }
              : {}),
          };
          const { error } = await supabase.from("houses").update(patch as never).eq("id", found.id);
          if (error) throw error;
          houseUuid = found.id;
          result.updated += 1;
        } else {
          const mapped = prepared.latitude !== null && prepared.longitude !== null;
          const { data, error } = await supabase
            .from("houses")
            .insert({
              house_id: prepared.house_id,
              house_number: prepared.house_number,
              status: prepared.status,
              data: prepared.data,
              latitude: prepared.latitude,
              longitude: prepared.longitude,
              location_status: mapped ? "mapped" : "not_mapped",
              location_source: mapped ? "import" : null,
              created_by: userId,
            } as never)
            .select("id")
            .single();
          if (error) throw error;
          houseUuid = data.id;
          result.created += 1;
        }

        if (houseUuid && prepared.members.length) {
          const { data: current } = await supabase
            .from("house_members")
            .select("id, member_id, member_name")
            .eq("house_uuid", houseUuid);
          const seen = new Set(
            (current ?? []).map((m) => (m.member_id ?? m.member_name ?? "").toUpperCase()),
          );
          const inserts = prepared.members
            .filter((m) => !seen.has((m.member_id ?? m.member_name ?? "").toUpperCase()))
            .map((m) => ({
              house_uuid: houseUuid,
              member_id: m.member_id,
              member_name: m.member_name,
              data: m.data,
            }));
          if (inserts.length) {
            const { error } = await supabase.from("house_members").insert(inserts as never);
            if (error) throw error;
            result.members += inserts.length;
          }
        }

        done += 1;
        onProgress?.(done, houses.length);
      }

      await audit("excel_imported", { ...result, houses: houses.length });
      return result;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["houses"] }),
  });
}
