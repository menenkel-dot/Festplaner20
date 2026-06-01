import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: festival, error: festivalError } = await adminClient
      .from("festivals")
      .select("id,name,date_label,start_date,end_date,location,description")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (festivalError) throw festivalError;

    if (!festival) {
      return new Response(JSON.stringify({ festival: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [
      daysResult,
      programResult,
      shiftsResult,
      reservationsResult,
    ] = await Promise.all([
      adminClient
        .from("festival_days")
        .select("id,name,reservations_enabled,table_count,grid_cols,reservation_times,sort_order")
        .eq("festival_id", festival.id)
        .order("sort_order", { ascending: true }),
      adminClient
        .from("program_items")
        .select("id,time_label,title,location,description,sort_order")
        .eq("festival_id", festival.id)
        .order("sort_order", { ascending: true }),
      adminClient
        .from("shifts")
        .select("id,day_label,time_label,role,needed,notes,shift_helpers(helper_name)")
        .eq("festival_id", festival.id)
        .order("created_at", { ascending: true }),
      adminClient
        .from("reservations")
        .select("id,table_id,table_ids,table_count,guests,date_label,time_label,status")
        .eq("festival_id", festival.id)
        .neq("status", "cancelled"),
    ]);

    const failed = [daysResult, programResult, shiftsResult, reservationsResult].find((result) => result.error);
    if (failed?.error) throw failed.error;

    return new Response(JSON.stringify({
      festivalId: festival.id,
      festInfo: {
        name: festival.name ?? "",
        date: festival.date_label ?? "",
        startDate: festival.start_date ?? "",
        endDate: festival.end_date ?? "",
        location: festival.location ?? "",
        description: festival.description ?? "",
        daysConfig: (daysResult.data ?? []).map((day) => ({
          id: String(day.id),
          name: String(day.name),
          reservationsEnabled: Boolean(day.reservations_enabled),
          tableCount: Number(day.table_count),
          gridCols: Number(day.grid_cols),
          reservationTimes: Array.isArray(day.reservation_times)
            ? day.reservation_times.map((time) => String(time))
            : [],
        })),
      },
      program: (programResult.data ?? []).map((item) => ({
        id: String(item.id),
        time: String(item.time_label),
        title: String(item.title),
        location: String(item.location ?? ""),
        description: String(item.description ?? ""),
      })),
      shifts: (shiftsResult.data ?? []).map((item) => ({
        id: String(item.id),
        day: String(item.day_label),
        time: String(item.time_label),
        role: String(item.role),
        needed: Number(item.needed),
        notes: item.notes ? String(item.notes) : undefined,
        helpers: Array.isArray(item.shift_helpers)
          ? item.shift_helpers.map((helper) => String(helper.helper_name))
          : [],
      })),
      reservations: (reservationsResult.data ?? []).map((item) => ({
        id: String(item.id),
        tableId: Number(item.table_id),
        tableIds: Array.isArray(item.table_ids)
          ? item.table_ids.map((tableId) => Number(tableId))
          : [Number(item.table_id)],
        tableCount: Number(item.table_count ?? 1),
        name: "Reserviert",
        email: "",
        guests: Number(item.guests ?? 10),
        date: String(item.date_label),
        time: String(item.time_label),
        status: item.status === "confirmed" ? "Bestätigt" : "Ausstehend",
      })),
    }), {
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
