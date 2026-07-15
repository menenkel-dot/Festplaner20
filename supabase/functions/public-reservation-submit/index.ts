import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { sendClubAdminNotifications } from "../_shared/admin-notifications.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const toPositiveInt = (value: unknown, fallback = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
};

const addDaysToIsoDate = (isoDate: string, days: number) => {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const parseTimeLabel = (value: string) => {
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return { hours: Number(match[1]), minutes: Number(match[2]) };
};

type ReservationFieldRow = {
  id: string;
  label: string;
  field_type: "text" | "number" | "boolean";
  required: boolean;
};

const validateReservationAnswers = (
  fields: ReservationFieldRow[],
  rawAnswers: unknown,
) => {
  if (!Array.isArray(rawAnswers) || rawAnswers.length > 20) {
    return { error: "Die individuellen Vereinsangaben sind ungueltig.", answers: [] };
  }

  const configuredIds = new Set(fields.map((field) => field.id));
  const answersById = new Map<string, unknown>();
  for (const rawAnswer of rawAnswers) {
    if (!rawAnswer || typeof rawAnswer !== "object") return { error: "Eine Vereinsangabe ist ungueltig.", answers: [] };
    const fieldId = String((rawAnswer as Record<string, unknown>).fieldId ?? "");
    if (!configuredIds.has(fieldId) || answersById.has(fieldId)) {
      return { error: "Eine Vereinsangabe gehoert nicht zu diesem Fest.", answers: [] };
    }
    answersById.set(fieldId, (rawAnswer as Record<string, unknown>).value);
  }

  const answers: Array<Record<string, unknown>> = [];
  for (const field of fields) {
    const rawValue = answersById.get(field.id);
    const missing = rawValue === undefined || rawValue === null || rawValue === "";
    if (missing) {
      if (field.required) return { error: `Bitte "${field.label}" ausfuellen.`, answers: [] };
      continue;
    }

    let value: string | number | boolean;
    if (field.field_type === "text") {
      value = String(rawValue).trim();
      if (!value || value.length > 500) return { error: `Die Angabe "${field.label}" ist ungueltig.`, answers: [] };
    } else if (field.field_type === "number") {
      value = Number(rawValue);
      if (!Number.isInteger(value) || value < 0) return { error: `Die Angabe "${field.label}" muss eine nichtnegative ganze Zahl sein.`, answers: [] };
    } else {
      if (typeof rawValue !== "boolean") return { error: `Bitte "${field.label}" mit Ja oder Nein beantworten.`, answers: [] };
      value = rawValue;
    }

    answers.push({
      fieldId: field.id,
      label: field.label,
      fieldType: field.field_type,
      value,
    });
  }

  return { error: "", answers };
};

const zonedDateTimeToUtc = (isoDate: string, hours: number, minutes: number, timeZone: string) => {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(utcGuess);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const zonedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  const desiredAsUtc = Date.UTC(year, month - 1, day, hours, minutes);
  return new Date(utcGuess.getTime() + desiredAsUtc - zonedAsUtc);
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
    const token = String(body.token ?? "").trim();
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const email = String(body.email ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const guestType = body.guestType === "club" ? "club" : "private";
    const clubName = String(body.clubName ?? "").trim();
    const clubReservationNotes = String(body.clubReservationNotes ?? "").trim();
    const clubReservationAnswers = body.clubReservationAnswers;
    const dateLabel = String(body.date ?? "").trim();
    const timeLabel = String(body.time ?? "").trim();

    if (!token || !firstName || !lastName || !email || !phone || !dateLabel || !timeLabel) {
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
    if (clubReservationNotes.length > 2000) {
      return new Response(JSON.stringify({ error: "Weitere Bemerkungen duerfen maximal 2000 Zeichen enthalten." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: link, error: linkError } = await adminClient
      .from("public_links")
      .select("festival_id,club_id")
      .eq("token", token)
      .eq("type", "guest_reservation")
      .eq("enabled", true)
      .is("revoked_at", null)
      .maybeSingle();

    if (linkError) throw linkError;
    if (!link?.festival_id) {
      return new Response(JSON.stringify({ error: "Public link not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: club, error: clubError } = await adminClient
      .from("clubs")
      .select("status")
      .eq("id", link.club_id)
      .maybeSingle();

    if (clubError) throw clubError;
    if (!club || club.status !== "active") {
      return new Response(JSON.stringify({ error: "Public link not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: festival, error: festivalError } = await adminClient
      .from("festivals")
      .select("id,start_date")
      .eq("id", link.festival_id)
      .maybeSingle();

    if (festivalError) throw festivalError;
    if (!festival?.id) {
      return new Response(JSON.stringify({ error: "Kein aktives Fest gefunden." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: reservationFields, error: reservationFieldsError } = await adminClient
      .from("festival_reservation_fields")
      .select("id,label,field_type,required")
      .eq("festival_id", festival.id)
      .order("sort_order", { ascending: true });
    if (reservationFieldsError) throw reservationFieldsError;

    const validatedAnswers = guestType === "club"
      ? validateReservationAnswers((reservationFields ?? []) as ReservationFieldRow[], clubReservationAnswers ?? [])
      : { error: "", answers: [] };
    if (validatedAnswers.error) {
      return new Response(JSON.stringify({ error: validatedAnswers.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: day, error: dayError } = await adminClient
      .from("festival_days")
      .select("name,reservations_enabled,table_count,sort_order")
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

    if (!selectedProgram) {
      return new Response(JSON.stringify({ error: "Reservierungen sind nur fuer Programmpunkte moeglich." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const time = parseTimeLabel(timeLabel);
    if (!festival.start_date || !time) {
      return new Response(JSON.stringify({ error: "Reservierungsfrist konnte nicht ermittelt werden." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventDate = addDaysToIsoDate(String(festival.start_date), Number(day.sort_order ?? 0));
    const startsAt = zonedDateTimeToUtc(eventDate, time.hours, time.minutes, "Europe/Berlin");
    const cutoff = new Date(startsAt.getTime() - 2 * 60 * 60 * 1000);
    if (Date.now() > cutoff.getTime()) {
      return new Response(JSON.stringify({ error: "Die Reservierungsfrist fuer diesen Programmpunkt ist abgelaufen." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
        club_reservation_notes: guestType === "club" ? clubReservationNotes : null,
        club_reservation_answers: guestType === "club" ? validatedAnswers.answers : [],
        guests: selectedTableIds.length * 10,
        date_label: dateLabel,
        time_label: timeLabel,
        status: "pending",
      })
      .select("id,table_id,table_ids,table_count,guests,date_label,time_label,status")
      .single();

    if (insertError) throw insertError;

    EdgeRuntime.waitUntil(sendClubAdminNotifications({
      clubId: String(link.club_id),
      festivalId: String(festival.id),
      type: "reservation_request",
      sourceId: String(reservation.id),
      reservationId: String(reservation.id),
      payload: {
        name: displayName,
        firstName,
        lastName,
        email,
        phone,
        date: dateLabel,
        time: timeLabel,
        tableCount: selectedTableIds.length,
        clubReservationAnswers: validatedAnswers.answers,
        clubReservationNotes,
      },
    }).catch((error) => console.error("Reservation notification failed", error)));

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
