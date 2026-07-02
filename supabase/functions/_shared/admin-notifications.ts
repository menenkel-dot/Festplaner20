import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import { decryptSecret, sendSmtpMail } from "./mail.ts";

type NotificationType = "reservation_request" | "helper_signup";

interface NotificationInput {
  clubId: string;
  festivalId: string;
  type: NotificationType;
  sourceId: string;
  reservationId?: string;
  shiftId?: string;
  payload: Record<string, unknown>;
}

const clean = (value: unknown) => String(value ?? "").trim();

const formatReceivedAt = () => new Intl.DateTimeFormat("de-AT", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Vienna",
}).format(new Date());

const buildMail = (
  type: NotificationType,
  clubName: string,
  festivalName: string,
  payload: Record<string, unknown>,
) => {
  if (type === "reservation_request") {
    const guestName = [payload.firstName, payload.lastName].map(clean).filter(Boolean).join(" ") || clean(payload.name);
    return {
      subject: `Neue Reservierungsanfrage für ${festivalName}`,
      text: `Hallo,\n\nfür ${festivalName} ist eine neue Reservierungsanfrage eingegangen.\n\nName: ${guestName || "-"}\nE-Mail: ${clean(payload.email) || "-"}\nTelefon: ${clean(payload.phone) || "-"}\nDatum: ${clean(payload.date) || "-"}\nUhrzeit: ${clean(payload.time) || "-"}\nAnzahl Tische: ${clean(payload.tableCount) || "-"}\nEingegangen: ${formatReceivedAt()}\n\nBitte prüfe die Anfrage im FestPlaner.\n\n${clubName}`,
    };
  }

  return {
    subject: `Neue Helferanmeldung für ${festivalName}`,
    text: `Hallo,\n\nfür ${festivalName} hat sich eine Person zu einer Schicht angemeldet.\n\nHelfer/in: ${clean(payload.helperName) || "-"}\nSchicht: ${clean(payload.role) || "-"}\nTag: ${clean(payload.day) || "-"}\nUhrzeit: ${clean(payload.time) || "-"}\nEingegangen: ${formatReceivedAt()}\n\nBitte prüfe die Eintragung im FestPlaner.\n\n${clubName}`,
  };
};

export const sendClubAdminNotifications = async (input: NotificationInput) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const encryptionKey = Deno.env.get("MAIL_SETTINGS_ENCRYPTION_KEY");
  if (!supabaseUrl || !serviceRoleKey || !encryptionKey) throw new Error("Supabase oder Mail-Secrets fehlen.");

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const preferenceColumn = input.type === "reservation_request"
    ? "reservation_requests_enabled"
    : "helper_signups_enabled";

  const [{ data: club }, { data: festival }, { data: preferences }, { data: settings }] = await Promise.all([
    adminClient.from("clubs").select("name").eq("id", input.clubId).maybeSingle(),
    adminClient.from("festivals").select("name").eq("id", input.festivalId).eq("club_id", input.clubId).maybeSingle(),
    adminClient.from("club_notification_preferences").select("user_id").eq("club_id", input.clubId).eq(preferenceColumn, true),
    adminClient.from("club_mail_settings").select("*").eq("club_id", input.clubId).maybeSingle(),
  ]);

  const preferredUserIds = (preferences ?? []).map((item) => String(item.user_id));
  const { data: memberships } = preferredUserIds.length
    ? await adminClient
      .from("club_memberships")
      .select("user_id,role:app_roles(name)")
      .eq("club_id", input.clubId)
      .in("user_id", preferredUserIds)
    : { data: [] };

  const adminUserIds = (memberships ?? [])
    .filter((item) => clean((item.role as unknown as { name?: unknown } | null)?.name).toLowerCase() === "admin")
    .map((item) => String(item.user_id));
  const { data: profiles } = adminUserIds.length
    ? await adminClient.from("app_user_profiles").select("user_id,email").in("user_id", adminUserIds)
    : { data: [] };
  const recipients = (profiles ?? []).filter((profile) => clean(profile.email));

  const eventBase = {
    club_id: input.clubId,
    festival_id: input.festivalId,
    event_type: input.type,
    source_id: input.sourceId,
    reservation_id: input.reservationId ?? null,
    shift_id: input.shiftId ?? null,
    payload: input.payload,
  };

  if (!recipients.length) {
    await adminClient.from("club_notification_events").insert({
      ...eventBase,
      status: "skipped",
      error_message: "Keine Vereins-Admins haben diese Benachrichtigung aktiviert.",
    });
    return;
  }

  const settingsReady = settings?.sender_email && settings?.smtp_host && settings?.smtp_username && settings?.smtp_password_encrypted;
  const mail = buildMail(input.type, clean(club?.name) || "Verein", clean(festival?.name) || "Vereinsfest", input.payload);

  await Promise.all(recipients.map(async (recipient) => {
    const recipientEmail = clean(recipient.email);
    const event = {
      ...eventBase,
      recipient_user_id: recipient.user_id,
      recipient_email: recipientEmail,
      subject: mail.subject,
    };
    if (!settingsReady) {
      await adminClient.from("club_notification_events").insert({
        ...event,
        status: "skipped",
        error_message: "Die SMTP-Einstellungen des Vereins sind unvollständig.",
      });
      return;
    }

    const { data: eventRow, error: eventError } = await adminClient.from("club_notification_events").insert({
      ...event,
      status: "pending",
      error_message: null,
    }).select("id").single();
    if (eventError || !eventRow) return;

    try {
      const smtpPassword = await decryptSecret(clean(settings.smtp_password_encrypted), encryptionKey);
      await sendSmtpMail({
        sender_name: clean(settings.sender_name),
        sender_email: clean(settings.sender_email),
        reply_to_email: clean(settings.reply_to_email) || null,
        smtp_host: clean(settings.smtp_host),
        smtp_port: Number(settings.smtp_port ?? 587),
        smtp_secure: Boolean(settings.smtp_secure),
        smtp_username: clean(settings.smtp_username),
        smtp_password: smtpPassword,
      }, recipientEmail, mail.subject, mail.text);
      await adminClient.from("club_notification_events").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", eventRow.id);
    } catch (error) {
      await adminClient.from("club_notification_events").update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Unbekannter SMTP-Fehler",
      }).eq("id", eventRow.id);
    }
  }));
};
