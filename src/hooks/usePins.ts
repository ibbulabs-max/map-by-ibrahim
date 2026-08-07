import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Pin } from "@/lib/pin-types";

export function usePins() {
  return useQuery({
    queryKey: ["pins"],
    queryFn: async (): Promise<Pin[]> => {
      const { data, error } = await supabase
        .from("pins")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Pin[];
    },
  });
}

export type PinDraft = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  pin_type: string;
  custom_type: string | null;
  house_id: string | null;
  house_number: string | null;
  owner_name: string | null;
  notes: string | null;
};

function deviceId() {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem("ssm.device");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("ssm.device", id);
  }
  return id;
}

export function useSavePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      draft,
      userId,
      username,
      id,
    }: {
      draft: PinDraft;
      userId: string;
      username: string;
      id?: string;
    }) => {
      if (id) {
        const { error } = await supabase.from("pins").update(draft).eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("pins").insert({
        ...draft,
        user_id: userId,
        username,
        device_time: new Date().toISOString(),
        device_id: deviceId(),
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pins"] }),
  });
}

export function useDeletePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pins").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pins"] }),
  });
}
