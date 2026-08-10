import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { useHouseAudit } from "@/hooks/useHouses";
import { supabase } from "@/integrations/supabase/client";
import { isBlank, mergeData, pickValue, type ConflictDraft, type MergeResult } from "@/lib/import-merge";
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
};

type PendingConflict = ConflictDraft & { house_uuid: string | null };

/** Writes a merged multi-file import into the ONE canonical house dataset. */
export function useApplyImport() {
  const qc = useQueryClient();
  const audit = useHouseAudit();
  const { session, profile, role } = useAuth();

  return useMutation({
    mutationFn: async (args: ApplyImportArgs): Promise<ApplyImportResult> => {
      const userId = session?.user.id ?? null;
      if (!userId) throw new Error("You must be signed in to import data");
      const now = new Date().toISOString();
      const conflicts: PendingConflict[] = [];
      let housesAdded = 0;
      let housesUpdated = 0;
      let membersAdded = 0;
      let membersMerged = 0;

      const { data: existingRows, error: exErr } = await supabase
        .from("houses")
        .select(
          "id, house_id, house_number, status, data, latitude, longitude, location_status, assigned_csw_id, supervisor_id, source_files",
        );
      if (exErr) throw exErr;
      const existing = new Map(
        (existingRows ?? []).map((h) => [String(h.house_id).toUpperCase(), h]),
      );

      let done = 0;
      for (const house of args.merged.houses) {
        const owner = house.assignedTo ?? args.assignedTo;
        const found = existing.get(house.house_id.toUpperCase());
        let houseUuid: string;

        if (!found) {
          const mapped = house.latitude !== null && house.longitude !== null;
          const { data, error } = await supabase
            .from("houses")
            .insert({
              house_id: house.house_id,
              house_number: house.house_number,
              status: house.status,
              data: house.data,
              latitude: house.latitude,
              longitude: house.longitude,
              location_status: mapped ? "mapped" : "not_mapped",
              location_source: mapped ? "import" : null,
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

          if (found.latitude === null && house.latitude !== null && house.longitude !== null) {
            patch['latitude'] = house.latitude;
            patch['longitude'] = house.longitude;
            patch['location_status'] = "mapped";
            patch['location_source'] = "import";
          } else if (
            found.latitude !== null &&
            house.latitude !== null &&
            Math.abs(found.latitude - house.latitude) > 0.00001
          ) {
            local.push({
              ...base,
              field: "latitude",
              existing_value: String(found.latitude),
              new_value: String(house.latitude),
            });
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

          const { error } = await supabase.from("houses").update(patch as never).eq("id", found.id);
          if (error) throw error;
          housesUpdated += 1;
          for (const c of local) conflicts.push({ ...c, house_uuid: found.id });
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
        args.onProgress?.(done, args.merged.houses.length);
      }

      const unmapped = args.merged.houses.filter((h) => h.latitude === null).length;
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
      });

      return {
        batchId: batch.id,
        housesAdded,
        housesUpdated,
        membersAdded,
        membersMerged,
        conflicts: conflicts.length,
      };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["houses"] });
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
        if (conflict.entity === "house") {
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
    },
  });
}
