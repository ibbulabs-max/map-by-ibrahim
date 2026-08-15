import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { useHouseAudit } from "@/hooks/useHouses";
import { supabase } from "@/integrations/supabase/client";
import {
  assessmentRisk,
  assessmentToData,
  emptyAssessment,
  FOLLOW_UP_DAYS,
  type Assessment,
} from "@/lib/assessment";
import type { House, HouseMember } from "@/lib/houses";

/** All assessments for one house, keyed by member uuid. */
export function useAssessments(houseUuid: string | null | undefined) {
  return useQuery({
    queryKey: ["assessments", houseUuid],
    enabled: Boolean(houseUuid),
    queryFn: async (): Promise<Record<string, Assessment>> => {
      const { data, error } = await supabase
        .from("member_assessments")
        .select("*")
        .eq("house_uuid", houseUuid!);
      if (error) throw error;
      const out: Record<string, Assessment> = {};
      for (const row of (data ?? []) as unknown as Assessment[]) out[row.member_uuid] = row;
      return out;
    },
  });
}

function followUpDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Persists one member assessment, mirrors the derived clinical values back into
 * the member's canonical `data` bag (so the single existing risk engine keeps
 * driving member / house / map risk) and creates or updates the follow-up.
 */
export function useSaveAssessment() {
  const qc = useQueryClient();
  const audit = useHouseAudit();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async ({
      house,
      member,
      assessment,
    }: {
      house: House;
      member: HouseMember;
      assessment: Assessment;
    }) => {
      const risk = assessmentRisk(assessment);
      const derived = assessmentToData(assessment);

      const payload = {
        ...assessment,
        house_uuid: house.id,
        member_uuid: member.id,
        risk_level: risk.level,
        risk_reasons: risk.reasons,
        assessed_by: session?.user.id ?? null,
        assessed_at: new Date().toISOString(),
      } as Record<string, unknown>;
      delete payload["id"];

      const { data: existing } = await supabase
        .from("member_assessments")
        .select("id")
        .eq("member_uuid", member.id)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabase
          .from("member_assessments")
          .update(payload as never)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("member_assessments").insert(payload as never);
        if (error) throw error;
      }

      // keep the member's canonical survey data in sync with the assessment
      if (assessment.available) {
        const { error: mErr } = await supabase
          .from("house_members")
          .update({ data: { ...(member.data ?? {}), ...derived } } as never)
          .eq("id", member.id);
        if (mErr) throw mErr;
      }

      // follow-up from the centralized interval configuration
      const days = FOLLOW_UP_DAYS[risk.level];
      if (assessment.available && days !== null) {
        const { data: open } = await supabase
          .from("follow_ups")
          .select("id")
          .eq("member_uuid", member.id)
          .eq("status", "pending")
          .maybeSingle();
        const fu = {
          house_uuid: house.id,
          member_uuid: member.id,
          due_date: followUpDate(days),
          reason: risk.reasons.map((r) => r.label).join(", ") || "Routine follow-up",
          risk_level: risk.level,
          status: "pending",
          created_by: session?.user.id ?? null,
        };
        if (open?.id) {
          const { error } = await supabase.from("follow_ups").update(fu as never).eq("id", open.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("follow_ups").insert(fu as never);
          if (error) throw error;
        }
      }

      await audit("member_assessed", {
        house_uuid: house.id,
        house_id: house.house_id,
        record_id: member.id,
        new_value: { risk_level: risk.level, available: assessment.available },
      });

      return risk;
    },
    onSuccess: (_r, vars) => {
      void qc.invalidateQueries({ queryKey: ["assessments", vars.house.id] });
      void qc.invalidateQueries({ queryKey: ["houses"] });
    },
  });
}

/** Existing assessment for a member, or a blank one in the same shape. */
export function assessmentFor(
  map: Record<string, Assessment> | undefined,
  houseUuid: string,
  memberUuid: string,
): Assessment {
  return map?.[memberUuid] ?? emptyAssessment(houseUuid, memberUuid);
}
