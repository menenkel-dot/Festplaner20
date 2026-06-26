import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import {
  DEFAULT_MAIL_BODY,
  DEFAULT_MAIL_SUBJECT,
  decryptSecret,
  renderTemplate,
  sendSmtpMail,
} from "../_shared/mail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
};

const clean = (value: unknown) => String(value ?? "").trim();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isAdminRole = (role: unknown) => {
  const roleName = String((role as { name?: unknown } | null)?.name ?? "").toLowerCase();
  return roleName === "admin";
};

const rolePermissions = (role: unknown) => {
  const permissions = (role as { permissions?: unknown } | null)?.permissions;
  return Array.isArray(permissions) ? permissions.map(String) : [];
};

const hasClubPermission = async (
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  clubId: string,
  permission: string,
) => {
  const [{ data: membership }, { data: systemAdmin }] = await Promise.all([
    adminClient
      .from("club_memberships")
      .select("role:app_roles(name,permissions)")
      .eq("club_id", clubId)
      .eq("user_id", userId)
      .maybeSingle(),
    adminClient
      .from("system_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (systemAdmin) return true;
  const role = (membership as { role?: unknown } | null)?.role;
  const permissions = rolePermissions(role);
  return isAdminRole(role) || permissions.includes(permission) || permissions.includes("users");
};

const tableIdsFrom = (reservation: Record<string, unknown>) => {
  const ids = Array.isArray(reservation.table_ids)
    ? reservation.table_ids
    : Array.isArray(reservation.tableIds)
      ? reservation.tableIds
      : [];
  return ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
};

const getTableLabel = (reservation: Record<string, unknown>) => {
  const tableIds = tableIdsFrom(reservation);
  const fallback = Number(reservation.table_id ?? reservation.tableId ?? 0);
  const ids = tableIds.length ? tableIds : fallback > 0 ? [fallback] : [];
  return ids.length ? `Tisch ${ids.join(", ")}` : "-";
};

const getTableCount = (reservation: Record<string, unknown>) => {
  const configured = Number(reservation.table_count ?? reservation.tableCount ?? 0);
  if (configured > 0) return configured;
  const ids = tableIdsFrom(reservation);
  return Math.max(1, ids.length || 1);
};

const getGuestName = (reservation: Record<string, unknown>) => {
  const firstLast = [reservation.first_name ?? reservation.firstName, reservation.last_name ?? reservation.lastName]
    .map(clean)
    .filter(Boolean)
    .join(" ");
  return firstLast || clean(reservation.name) || clean(reservation.club_name ?? reservation.clubName) || "Gast";
};

const getReservationDisplayName = (reservation: Record<string, unknown>) => {
  const guestType = clean(reservation.guest_type ?? reservation.guestType);
  if (guestType === "club") return clean(reservation.club_name ?? reservation.clubName) || clean(reservation.name);
  return getGuestName(reservation);
};

const serializeSettings = (settings: Record<string, unknown>) => ({
  sender_name: clean(settings.sender_name),
  sender_email: clean(settings.sender_email),
  reply_to_email: clean(settings.reply_to_email) || null,
  smtp_host: clean(settings.smtp_host),
  smtp_port: Number(settings.smtp_port ?? 587),
  smtp_secure: Boolean(settings.smtp_secure),
  smtp_username: clean(settings.smtp_username),
  smtp_password_encrypted: clean(settings.smtp_password_encrypted),
  subject_template: clean(settings.subject_template) || DEFAULT_MAIL_SUBJECT,
  body_template: clean(settings.body_template) || DEFAULT_MAIL_BODY,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const encryptionKey = Deno.env.get("MAIL_SETTINGS_ENCRYPTION_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey || !encryptionKey) {
      throw new Error("Supabase oder Mail-Secrets fehlen.");
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();

    if (userError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const payload = await req.json();
    const clubId = clean(payload.clubId);
    const festivalId = clean(payload.festivalId);
    const reservationPayload = (payload.reservation ?? {}) as Record<string, unknown>;

    if (!clubId || !festivalId || !reservationPayload.email) {
      return jsonResponse({ error: "Verein, Fest oder Reservierung fehlt." }, 400);
    }

    const canSend = await hasClubPermission(adminClient, user.id, clubId, "reservations");
    if (!canSend) return jsonResponse({ error: "Forbidden" }, 403);

    const [{ data: club, error: clubError }, { data: festival, error: festivalError }, { data: mailSettings, error: settingsError }] = await Promise.all([
      adminClient.from("clubs").select("id,name,status").eq("id", clubId).maybeSingle(),
      adminClient.from("festivals").select("id,club_id,name,location").eq("id", festivalId).maybeSingle(),
      adminClient.from("club_mail_settings").select("*").eq("club_id", clubId).maybeSingle(),
    ]);

    if (clubError) throw clubError;
    if (festivalError) throw festivalError;
    if (settingsError) throw settingsError;
    if (!club || club.status !== "active" || !festival || festival.club_id !== clubId) {
      return jsonResponse({ error: "Verein oder Fest wurde nicht gefunden." }, 404);
    }
    if (!mailSettings) return jsonResponse({ error: "Mailsettings sind nicht eingerichtet." }, 400);

    const settings = serializeSettings(mailSettings as Record<string, unknown>);
    if (!settings.sender_email || !settings.smtp_host || !settings.smtp_username || !settings.smtp_password_encrypted) {
      return jsonResponse({ error: "Mailsettings sind unvollständig." }, 400);
    }

    const reservationId = clean(reservationPayload.id);
    let reservation: Record<string, unknown> | null = null;
    if (uuidPattern.test(reservationId)) {
      const { data, error } = await adminClient
        .from("reservations")
        .select("*")
        .eq("festival_id", festivalId)
        .eq("id", reservationId)
        .maybeSingle();
      if (error) throw error;
      reservation = data as Record<string, unknown> | null;
    }

    if (!reservation) {
      const { data, error } = await adminClient
        .from("reservations")
        .select("*")
        .eq("festival_id", festivalId)
        .eq("email", clean(reservationPayload.email))
        .eq("date_label", clean(reservationPayload.date ?? reservationPayload.date_label))
        .eq("time_label", clean(reservationPayload.time ?? reservationPayload.time_label))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      reservation = data as Record<string, unknown> | null;
    }

    if (!reservation) return jsonResponse({ error: "Reservierung wurde nicht gefunden." }, 404);

    const uiStatus = clean(reservationPayload.status);
    if (uiStatus !== "Bestätigt" && clean(reservation.status) !== "confirmed") {
      return jsonResponse({ error: "Reservierung ist noch nicht bestätigt." }, 400);
    }

    if (clean(reservation.status) !== "confirmed") {
      const { data: updatedReservation, error: updateError } = await adminClient
        .from("reservations")
        .update({ status: "confirmed" })
        .eq("id", reservation.id)
        .select("*")
        .single();
      if (updateError) throw updateError;
      reservation = updatedReservation as Record<string, unknown>;
    }

    const smtpPassword = await decryptSecret(settings.smtp_password_encrypted, encryptionKey);
    const variables = {
      gast_name: getGuestName(reservation),
      reservierungsname: getReservationDisplayName(reservation),
      verein_name: String(club.name ?? ""),
      fest_name: String(festival.name ?? ""),
      veranstaltungsort: String(festival.location ?? ""),
      datum: clean(reservation.date_label),
      uhrzeit: clean(reservation.time_label),
      tische: getTableLabel(reservation),
      anzahl_tische: String(getTableCount(reservation)),
      telefon: clean(reservation.phone),
      email: clean(reservation.email),
      notizen: clean(reservation.club_reservation_notes),
    };
    const subject = renderTemplate(settings.subject_template, variables);
    const text = renderTemplate(settings.body_template, variables);
    const recipientEmail = clean(reservation.email);

    try {
      await sendSmtpMail(
        {
          ...settings,
          smtp_password: smtpPassword,
        },
        recipientEmail,
        subject,
        text,
      );

      const { error: eventError } = await adminClient.from("reservation_email_events").insert({
        club_id: clubId,
        festival_id: festivalId,
        reservation_id: reservation.id,
        recipient_email: recipientEmail,
        subject,
        status: "sent",
        reservation_snapshot: reservation,
        sent_by: user.id,
      });
      if (eventError) throw eventError;

      return jsonResponse({ ok: true, sentAt: new Date().toISOString() });
    } catch (mailError) {
      const message = mailError instanceof Error ? mailError.message : "Mailversand fehlgeschlagen.";
      await adminClient.from("reservation_email_events").insert({
        club_id: clubId,
        festival_id: festivalId,
        reservation_id: reservation.id,
        recipient_email: recipientEmail,
        subject,
        status: "failed",
        error_message: message,
        reservation_snapshot: reservation,
        sent_by: user.id,
      });
      return jsonResponse({ error: message }, 500);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
