import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { useHouseAudit } from "@/hooks/useHouses";
import { supabase } from "@/integrations/supabase/client";
import { isBlank, mergeData, pickValue, sameCoords, type ConflictDraft, type MergeResult } from "@/lib/import-merge";
import type { LocationInfo } from "@/lib/excel-import";
import type { ImportBatch, ImportConflict } from "@/lib/imports";

export type ApplyImportArgs = {
  merged: MergeResult;
  fileNames: string[];
  assignedTo: string | null;
  assignedToName: string | null;
  supervisorId: string | null;
  onProgress?: (done: number, total: number) => void;
};

export type ApplyImportResult = {
  batchId: string | null;
  housesAdded: number;
  housesUpdated: number;
  membersAdded: number;
  membersMerged: number;
  conflicts: number;
  locationsAdded: number;
  locationsConflicted: number;
  pinsAdded: number;
  pinsUpdated: number;
};

type PendingConflict = ConflictDraft & { house_uuid: string | null };

type PinRow = {
  id: string;
  house_id: string | null;
  import_key: string | null;
  latitude: number;
  longitude: number;
  pin_type: string;
};

const near = (a: number, b: number) => Math.abs(a - b) < 0.000015;

/** Writes a merged multi-file import into the ONE canonical house dataset. */
export function useApplyImport() {
  const qc = useQueryClient();
  const audit = useHouseAudit();
  const { session, profile, role } = useAuth();

  return useMutation({
    mutationFn: async (args: ApplyImportArgs): Promise<ApplyImportResult> => {
      const userId = session?.user.id ?? null;
      if (!userId) throw new Error("You must be signed in to import data");
      const username = profile?.username ?? "import";
      const now = new Date().toISOString();
      const conflicts: PendingConflict[] = [];
      let housesAdded = 0;
      let housesUpdated = 0;
      let membersAdded = 0;
      let membersMerged = 0;
      let locationsAdded = 0;
      let locationsConflicted = 0;
      let pinsAdded = 0;
      let pinsUpdated = 0;

      const locationAudit: Record<string, unknown>[] = [];

      const { data: existingRows, error: exErr } = await supabase
        .from("houses")
        .select(
          "id, house_id, house_number, status, data, latitude, longitude, accuracy, location_status, assigned_csw_id, supervisor_id, source_files, pin_type, custom_type, pin_id",
        );

      if (exErr) throw exErr;
      const existing = new Map(
        (existingRows ?? []).map((h) => [String(h.house_id).toUpperCase(), h]),
      );

      // Every pin the current user can see — used so imports never duplicate pins.
      const { data: pinRows } = await supabase
        .from("pins")
        .select("id, house_id, import_key, latitude, longitude, pin_type");
      const pins = (pinRows ?? []) as unknown as PinRow[];
      const pinByKey = new Map(pins.filter((p) => p.import_key).map((p) => [p.import_key!, p]));
      const pinByHouse = new Map<string, PinRow>();
      for (const p of pins) {
        const key = (p.house_id ?? "").trim().toUpperCase();
        if (key && !pinByHouse.has(key)) pinByHouse.set(key, p);
      }

      /** Creates or refreshes the map pin for a record without duplicating it. */
      async function syncPin(params: {
        importKey: string;
        houseId: string | null;
        houseUuid: string | null;
        houseNumber: string | null;
        location: LocationInfo;
      }): Promise<string> {

        const { importKey, houseId, houseUuid, houseNumber, location } = params;
        const found =
          pinByKey.get(importKey) ??
          (houseId ? pinByHouse.get(houseId.trim().toUpperCase()) : undefined);

        const descriptive = {
          pin_type: location.pin_type,
          custom_type: location.custom_type,
          house_id: houseId,
          house_number: houseNumber,
          owner_name: location.owner_name,
          notes: location.notes,
          surveyor: location.surveyor,
          source: "import",
          import_key: importKey,
          ...(houseUuid ? { house_uuid: houseUuid } : {}),
          ...(location.external_created_at ? { external_created_at: location.external_created_at } : {}),
        };

        if (found) {
          const samePlace = near(found.latitude, location.latitude) && near(found.longitude, location.longitude);
          const { error } = await supabase
            .from("pins")
            .update({
              ...descriptive,
              // An existing pin is never silently moved — its location wins.
              ...(samePlace ? { accuracy: location.accuracy } : {}),
            } as never)
            .eq("id", found.id);
          if (error) throw error;
          pinsUpdated += 1;
          return found.id;
        }


        const { data, error } = await supabase
          .from("pins")
          .insert({
            ...descriptive,
            user_id: userId,
            username,
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
            device_time: location.external_created_at ?? now,
          } as never)
          .select("id, house_id, import_key, latitude, longitude, pin_type")
          .single();
        if (error) throw error;
        const row = data as unknown as PinRow;
        pinByKey.set(importKey, row);
        if (houseId) pinByHouse.set(houseId.trim().toUpperCase(), row);
        pinsAdded += 1;
        return row.id;
      }


      let done = 0;
      const totalUnits = args.merged.houses.length + args.merged.places.length;

      for (const house of args.merged.houses) {
        const owner = house.assignedTo ?? args.assignedTo;
        const found = existing.get(house.house_id.toUpperCase());
        const loc = house.location;
        // Canonical pin type for the House record itself (works with or without coords).
        const housePinType = house.pin_type ?? loc?.pin_type ?? null;
        const houseCustomType = house.pin_type ? house.custom_type : (loc?.custom_type ?? null);
        if (loc && housePinType) {
          loc.pin_type = housePinType;
          loc.custom_type = houseCustomType;
        }
        let houseUuid: string;


        if (!found) {
          const { data, error } = await supabase
            .from("houses")
            .insert({
              house_id: house.house_id,
              house_number: house.house_number,
              status: house.status,
              data: house.data,
              pin_type: housePinType ?? "house",
              custom_type: houseCustomType,

              latitude: loc?.latitude ?? null,
              longitude: loc?.longitude ?? null,
              accuracy: loc?.accuracy ?? null,
              location_status: loc ? "mapped" : "not_mapped",
              location_source: loc ? "import" : null,
              mapped_by: loc ? userId : null,
              mapped_at: loc ? now : null,
              assigned_csw_id: owner,
              supervisor_id: args.supervisorId,
              created_by: userId,
              uploaded_by: userId,
              uploaded_at: now,
              source_files: house.sources,
            } as never)
            .select("id")
            .single();
          if (error) throw error;
          houseUuid = data.id;
          housesAdded += 1;
          if (loc) {
            locationsAdded += 1;
            locationAudit.push({
              action: "location_imported",
              house_id: house.house_id,
              old_value: null,
              new_value: { latitude: loc.latitude, longitude: loc.longitude, type: loc.pin_type },
            });
          }
        } else {
          houseUuid = found.id;
          const local: ConflictDraft[] = [];
          const source = house.sources[0] ?? null;
          const base = { house_id: house.house_id, entity: "house" as const, member_ref: null, source_file: source };
          const patch: Record<string, unknown> = {};

          const houseNumber = pickValue(found.house_number, house.house_number, { ...base, field: "house_number" }, local);
          if (houseNumber !== found.house_number) patch['house_number'] = houseNumber;
          const status = pickValue(found.status, house.status, { ...base, field: "status" }, local);
          if (status !== found.status) patch['status'] = status;

          // ---- location: fill when missing, never silently overwrite ----
          if (loc) {
            const hasExisting = found.latitude !== null && found.longitude !== null;
            if (!hasExisting) {
              patch['latitude'] = loc.latitude;
              patch['longitude'] = loc.longitude;
              patch['accuracy'] = loc.accuracy;
              patch['location_status'] = "mapped";
              patch['location_source'] = "import";
              patch['mapped_by'] = userId;
              patch['mapped_at'] = now;
              locationsAdded += 1;
              locationAudit.push({
                action: "location_imported",
                house_id: house.house_id,
                old_value: null,
                new_value: { latitude: loc.latitude, longitude: loc.longitude, type: loc.pin_type },
              });
            } else if (
              !sameCoords(
                { ...loc, latitude: found.latitude!, longitude: found.longitude! },
                loc,
              )
            ) {
              locationsConflicted += 1;
              local.push({
                ...base,
                entity: "location",
                field: "location",
                existing_value: `${found.latitude!.toFixed(6)}, ${found.longitude!.toFixed(6)}`,
                new_value: `${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`,
              });
              locationAudit.push({
                action: "location_conflict",
                house_id: house.house_id,
                old_value: { latitude: found.latitude, longitude: found.longitude },
                new_value: { latitude: loc.latitude, longitude: loc.longitude },
              });
            } else if (found.accuracy === null && loc.accuracy !== null) {
              patch['accuracy'] = loc.accuracy;
            }
            if (found.location_status !== "mapped" && (patch['latitude'] || found.latitude !== null)) {
              patch['location_status'] = "mapped";
            }
          }

          const mergedData = mergeData(
            (found.data as Record<string, unknown>) ?? {},
            house.data,
            base,
            local,
          );
          patch['data'] = mergedData;

          if (isBlank(found.assigned_csw_id) && owner) {
            patch['assigned_csw_id'] = owner;
            if (args.supervisorId) patch['supervisor_id'] = args.supervisorId;
          } else if (owner && found.assigned_csw_id && found.assigned_csw_id !== owner) {
            local.push({
              house_id: house.house_id,
              entity: "assignment",
              member_ref: null,
              source_file: source,
              field: "assigned_csw_id",
              existing_value: found.assigned_csw_id,
              new_value: owner,
            });
          }

          const files = new Set([...(((found.source_files as string[]) ?? []) as string[]), ...house.sources]);
          patch['source_files'] = [...files];
          patch['uploaded_by'] = userId;
          patch['uploaded_at'] = now;

          // A more specific imported type upgrades a plain/blank type on the record.
          const currentType = (found as { pin_type?: string | null }).pin_type ?? null;
          if (housePinType && (currentType === null || (currentType === "house" && housePinType !== "house"))) {
            patch['pin_type'] = housePinType;
            patch['custom_type'] = houseCustomType;
          }

          const { error } = await supabase.from("houses").update(patch as never).eq("id", found.id);
          if (error) throw error;
          housesUpdated += 1;
          for (const c of local) conflicts.push({ ...c, house_uuid: found.id });
        }

        // ---- map pin for this house (created or refreshed, never duplicated) ----
        if (loc) {
          const pinId = await syncPin({
            importKey: `house:${house.house_id.toUpperCase()}`,
            houseId: house.house_id,
            houseUuid,
            houseNumber: house.house_number,
            location: loc,
          });
          // Keep the house linked to its single canonical pin.
          if (pinId && (found as { pin_id?: string | null } | undefined)?.pin_id !== pinId) {
            await supabase.from("houses").update({ pin_id: pinId } as never).eq("id", houseUuid);
          }
        }


        // ---- members: match on Member ID, then House ID + name ----
        const { data: currentMembers } = await supabase
          .from("house_members")
          .select("id, member_id, member_name, data, source_files")
          .eq("house_uuid", houseUuid);

        for (const member of house.members) {
          const match = (currentMembers ?? []).find((m) =>
            member.member_id && m.member_id
              ? m.member_id.trim().toUpperCase() === member.member_id.trim().toUpperCase()
              : !member.member_id &&
                !m.member_id &&
                (m.member_name ?? "").trim().toLowerCase() ===
                  (member.member_name ?? "").trim().toLowerCase(),
          );

          if (match) {
            const local: ConflictDraft[] = [];
            const ctx = {
              house_id: house.house_id,
              entity: "member" as const,
              member_ref: match.member_id ?? match.member_name,
              source_file: member.sources[0] ?? null,
            };
            const name = pickValue(match.member_name, member.member_name, { ...ctx, field: "member_name" }, local);
            const data = mergeData((match.data as Record<string, unknown>) ?? {}, member.data, ctx, local);
            const files = new Set([...(((match.source_files as string[]) ?? []) as string[]), ...member.sources]);
            const { error } = await supabase
              .from("house_members")
              .update({
                member_name: name,
                member_id: match.member_id ?? member.member_id,
                data,
                source_files: [...files],
                uploaded_by: userId,
                uploaded_at: now,
              } as never)
              .eq("id", match.id);
            if (error) throw error;
            membersMerged += 1;
            for (const c of local) conflicts.push({ ...c, house_uuid: houseUuid });
            continue;
          }

          const { error } = await supabase.from("house_members").insert({
            house_uuid: houseUuid,
            member_id: member.member_id,
            member_name: member.member_name,
            data: member.data,
            source_files: member.sources,
            uploaded_by: userId,
            uploaded_at: now,
            possible_duplicate: member.possibleDuplicate,
          } as never);
          if (error) throw error;
          membersAdded += 1;
        }

        done += 1;
        args.onProgress?.(done, totalUnits);
      }

      // ---- map-only records (no House ID) ----
      for (const place of args.merged.places) {
        await syncPin({
          importKey: `place:${place.key}`,
          houseId: null,
          houseUuid: null,
          houseNumber: place.house_number,
          location: place.location,
        });
        done += 1;
        args.onProgress?.(done, totalUnits);
      }

      const unmapped = args.merged.houses.filter((h) => h.location === null).length;
      const { data: batch, error: batchErr } = await supabase
        .from("import_batches")
        .insert({
          file_names: args.fileNames,
          uploaded_by: userId,
          uploaded_by_name: profile?.full_name || profile?.username || null,
          uploaded_role: role,
          assigned_to: args.assignedTo,
          assigned_to_name: args.assignedToName,
          supervisor_id: args.supervisorId,
          total_rows: args.merged.totalRows,
          unique_houses: args.merged.houses.length,
          houses_added: housesAdded,
          houses_updated: housesUpdated,
          members_added: membersAdded,
          members_merged: membersMerged,
          merged_records: args.merged.mergedRecords + membersMerged,
          conflicts: conflicts.length,
          unmapped_houses: unmapped,
          new_fields: args.merged.fields,
          status: conflicts.length ? "completed_with_conflicts" : "completed",
        } as never)
        .select("id")
        .single();
      if (batchErr) throw batchErr;

      if (conflicts.length) {
        const rows = conflicts.map((c) => ({ ...c, batch_id: batch.id }));
        for (let i = 0; i < rows.length; i += 200) {
          const { error } = await supabase
            .from("import_conflicts")
            .insert(rows.slice(i, i + 200) as never);
          if (error) throw error;
        }
      }

      await audit("excel_import_merged", {
        batch_id: batch.id,
        files: args.fileNames,
        assigned_to: args.assignedTo,
        houses_added: housesAdded,
        houses_updated: housesUpdated,
        members_added: membersAdded,
        members_merged: membersMerged,
        conflicts: conflicts.length,
        locations_added: locationsAdded,
        location_conflicts: locationsConflicted,
        pins_added: pinsAdded,
        pins_updated: pinsUpdated,
      });

      if (locationAudit.length) {
        await audit("location_imported", {
          batch_id: batch.id,
          files: args.fileNames,
          locations_added: locationsAdded,
          location_conflicts: locationsConflicted,
          records: locationAudit.slice(0, 200),
        });
      }
      if (Object.keys(args.merged.typeCounts).length) {
        await audit("pin_type_imported", {
          batch_id: batch.id,
          files: args.fileNames,
          types: args.merged.typeCounts,
          pins_added: pinsAdded,
          pins_updated: pinsUpdated,
        });
      }

      return {
        batchId: batch.id,
        housesAdded,
        housesUpdated,
        membersAdded,
        membersMerged,
        conflicts: conflicts.length,
        locationsAdded,
        locationsConflicted,
        pinsAdded,
        pinsUpdated,
      };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["houses"] });
      void qc.invalidateQueries({ queryKey: ["pins"] });
      void qc.invalidateQueries({ queryKey: ["team"] });
      void qc.invalidateQueries({ queryKey: ["admin"] });
      void qc.invalidateQueries({ queryKey: ["import-batches"] });
      void qc.invalidateQueries({ queryKey: ["import-conflicts"] });
    },
  });
}

export function useImportBatches() {
  return useQuery({
    queryKey: ["import-batches"],
    queryFn: async (): Promise<ImportBatch[]> => {
      const { data, error } = await supabase
        .from("import_batches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as ImportBatch[];
    },
  });
}

export function useImportConflicts() {
  return useQuery({
    queryKey: ["import-conflicts"],
    queryFn: async (): Promise<ImportConflict[]> => {
      const { data, error } = await supabase
        .from("import_conflicts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as ImportConflict[];
    },
  });
}

export type Resolution = "kept_existing" | "used_new" | "review_later";

/** Resolves a conflict — the original value is preserved unless "use new" is chosen. */
export function useResolveConflict() {
  const qc = useQueryClient();
  const audit = useHouseAudit();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async ({ conflict, resolution }: { conflict: ImportConflict; resolution: Resolution }) => {
      if (resolution === "used_new" && conflict.house_uuid) {
        if (conflict.entity === "location") {
          const [latRaw, lngRaw] = (conflict.new_value ?? "").split(",");
          const lat = Number((latRaw ?? "").trim());
          const lng = Number((lngRaw ?? "").trim());
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            const { error } = await supabase
              .from("houses")
              .update({
                latitude: lat,
                longitude: lng,
                location_status: "mapped",
                location_source: "import",
                mapped_by: session?.user.id ?? null,
                mapped_at: new Date().toISOString(),
              } as never)
              .eq("id", conflict.house_uuid);
            if (error) throw error;
            await supabase
              .from("pins")
              .update({ latitude: lat, longitude: lng } as never)
              .eq("import_key", `house:${conflict.house_id.toUpperCase()}`);
            await audit("location_updated", {
              house_uuid: conflict.house_uuid,
              house_id: conflict.house_id,
              old_value: conflict.existing_value,
              new_value: conflict.new_value,
            });
          }
        } else if (conflict.entity === "house") {
          const patch: Record<string, unknown> = {};
          if (["house_number", "status"].includes(conflict.field)) {
            patch[conflict.field] = conflict.new_value;
          } else if (conflict.field === "latitude" || conflict.field === "longitude") {
            patch[conflict.field] = Number(conflict.new_value);
          } else {
            const { data: row } = await supabase
              .from("houses")
              .select("data")
              .eq("id", conflict.house_uuid)
              .maybeSingle();
            patch['data'] = { ...((row?.data as Record<string, unknown>) ?? {}), [conflict.field]: conflict.new_value };
          }
          const { error } = await supabase.from("houses").update(patch as never).eq("id", conflict.house_uuid);
          if (error) throw error;
        } else if (conflict.entity === "assignment") {
          const { error } = await supabase
            .from("houses")
            .update({ assigned_csw_id: conflict.new_value } as never)
            .eq("id", conflict.house_uuid);
          if (error) throw error;
        } else if (conflict.entity === "member" && conflict.member_ref) {
          const { data: members } = await supabase
            .from("house_members")
            .select("id, member_id, member_name, data")
            .eq("house_uuid", conflict.house_uuid);
          const target = (members ?? []).find(
            (m) => m.member_id === conflict.member_ref || m.member_name === conflict.member_ref,
          );
          if (target) {
            const patch =
              conflict.field === "member_name"
                ? { member_name: conflict.new_value }
                : {
                    data: {
                      ...((target.data as Record<string, unknown>) ?? {}),
                      [conflict.field]: conflict.new_value,
                    },
                  };
            const { error } = await supabase.from("house_members").update(patch as never).eq("id", target.id);
            if (error) throw error;
          }
        }
      }

      const { error } = await supabase
        .from("import_conflicts")
        .update({
          status: resolution,
          resolved_by: session?.user.id ?? null,
          resolved_at: resolution === "review_later" ? null : new Date().toISOString(),
        } as never)
        .eq("id", conflict.id);
      if (error) throw error;

      await audit("import_conflict_resolved", {
        conflict_id: conflict.id,
        house_id: conflict.house_id,
        field: conflict.field,
        resolution,
        old_value: conflict.existing_value,
        new_value: conflict.new_value,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["import-conflicts"] });
      void qc.invalidateQueries({ queryKey: ["houses"] });
      void qc.invalidateQueries({ queryKey: ["pins"] });
    },
  });
}
