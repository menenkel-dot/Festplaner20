import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const toPositiveInt = (value: unknown, fallback = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase Edge Function secrets are missing.");
    }

    const body = await req.json();
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const email = String(body.email ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const guestType = body.guestType === "club" ? "club" : "private";
    const clubName = String(body.clubName ?? "").trim();
    const dateLabel = String(body.date ?? "").trim();
    const timeLabel = String(body.time ?? "").trim();

    if (!firstName || !lastName || !email || !phone || !dateLabel || !timeLabel) {
      return new Response(JSON.stringify({ error: "Pflichtfelder fehlen." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (guestType === "club" && !clubName) {
      return new Response(JSON.stringify({ error: "Vereinsname fehlt." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: festival, error: festivalError } = await adminClient
      .from("festivals")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (festivalError) throw festivalError;
    if (!festival?.id) {
      return new Response(JSON.stringify({ error: "Kein aktives Fest gefunden." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: day, error: dayError } = await adminClient
      .from("festival_days")
      .select("name,reservations_enabled,table_count")
      .eq("festival_id", festival.id)
      .eq("name", dateLabel)
      .maybeSingle();

    if (dayError) throw dayError;
    if (!day?.reservations_enabled) {
      return new Response(JSON.stringify({ error: "Reservierungen sind fuer diesen Festtag nicht aktiv." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: programItems, error: programError } = await adminClient
      .from("program_items")
      .select("time_label,reservation_uses_tent_plan,reservation_table_limit")
      .eq("festival_id", festival.id)
      .like("time_label", `${dateLabel} - %`);

    if (programError) throw programError;

    const selectedProgram = (programItems ?? []).find((item) => {
      const configuredTime = String(item.time_label ?? "").split(" - ")[1] || String(item.time_label ?? "");
      return configuredTime === timeLabel;
    });

    const usesTentPlan = selectedProgram?.reservation_uses_tent_plan !== false;
    const tableLimit = toPositiveInt(selectedProgram?.reservation_table_limit ?? day.table_count, 16);
    const requestedCount = guestType === "club" ? toPositiveInt(body.tableCount, 1) : 1;
    const bodyTableIds = Array.isArray(body.tableIds)
      ? body.tableIds.map((id: unknown) => toPositiveInt(id)).filter((id: number) => id > 0)
      : [];

    if (guestType === "private" && requestedCount > 1) {
      return new Response(JSON.stringify({ error: "Privatpersonen koennen nur einen Tisch reservieren." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existingReservations, error: existingError } = await adminClient
      .from("reservations")
      .select("table_id,table_ids,table_count")
      .eq("festival_id", festival.id)
      .eq("date_label", dateLabel)
      .eq("time_label", timeLabel)
      .in("status", ["pending", "confirmed"]);

    if (existingError) throw existingError;

    const blocked = new Set<number>();
    for (const reservation of existingReservations ?? []) {
      const tableIds = Array.isArray(reservation.table_ids) && reservation.table_ids.length > 0
        ? reservation.table_ids
        : [reservation.table_id];
      for (const tableId of tableIds) blocked.add(Number(tableId));
    }

    const selectedTableIds: number[] = [];
    if (usesTentPlan) {
      for (const tableId of bodyTableIds) {
        if (tableId > tableLimit || blocked.has(tableId)) continue;
        selectedTableIds.push(tableId);
      }
    } else {
      for (let tableId = 1; tableId <= tableLimit && selectedTableIds.length < requestedCount; tableId += 1) {
        if (!blocked.has(tableId)) selectedTableIds.push(tableId);
      }
    }

    if (selectedTableIds.length < requestedCount) {
      return new Response(JSON.stringify({ error: "Nicht genug freie Tische verfuegbar." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const displayName = guestType === "club" ? clubName : `${firstName} ${lastName}`;
    const { data: reservation, error: insertError } = await adminClient
      .from("reservations")
      .insert({
        festival_id: festival.id,
        table_id: selectedTableIds[0],
        table_ids: selectedTableIds,
        table_count: selectedTableIds.length,
        name: displayName,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        guest_type: guestType,
        club_name: guestType === "club" ? clubName : null,
        guests: selectedTableIds.length * 10,
        date_label: dateLabel,
        time_label: timeLabel,
        status: "pending",
      })
      .select("id,table_id,table_ids,table_count,guests,date_label,time_label,status")
      .single();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ reservation }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
