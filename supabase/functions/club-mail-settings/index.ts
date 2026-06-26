import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import {
  DEFAULT_MAIL_BODY,
  DEFAULT_MAIL_SUBJECT,
  decryptSecret,
  encryptSecret,
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

const toInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(65535, Math.max(1, Math.floor(parsed)));
};

const clean = (value: unknown) => String(value ?? "").trim();

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

const serializeSettings = (settings: Record<string, unknown> | null) => {
  const hasPassword = Boolean(settings?.smtp_password_encrypted);
  return {
    senderName: String(settings?.sender_name ?? ""),
    senderEmail: String(settings?.sender_email ?? ""),
    replyToEmail: String(settings?.reply_to_email ?? ""),
    smtpHost: String(settings?.smtp_host ?? ""),
    smtpPort: Number(settings?.smtp_port ?? 587),
    smtpSecure: Boolean(settings?.smtp_secure),
    smtpUsername: String(settings?.smtp_username ?? ""),
    smtpPassword: "",
    hasPassword,
    subjectTemplate: String(settings?.subject_template ?? DEFAULT_MAIL_SUBJECT),
    bodyTemplate: String(settings?.body_template ?? DEFAULT_MAIL_BODY),
    updatedAt: settings?.updated_at ? String(settings.updated_at) : "",
    configured: Boolean(
      settings?.sender_email &&
      settings?.smtp_host &&
      settings?.smtp_port &&
      settings?.smtp_username &&
      settings?.smtp_password_encrypted &&
      settings?.subject_template &&
      settings?.body_template
    ),
  };
};

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
    const action = String(payload.action ?? "get");
    const clubId = clean(payload.clubId);
    if (!clubId) return jsonResponse({ error: "Verein fehlt." }, 400);

    const canManage = await hasClubPermission(adminClient, user.id, clubId, "users");
    if (!canManage) return jsonResponse({ error: "Forbidden" }, 403);

    const { data: existing, error: existingError } = await adminClient
      .from("club_mail_settings")
      .select("*")
      .eq("club_id", clubId)
      .maybeSingle();

    if (existingError) throw existingError;

    if (action === "get") {
      return jsonResponse({ settings: serializeSettings(existing as Record<string, unknown> | null) });
    }

    if (action === "save") {
      const settings = payload.settings ?? {};
      const password = clean(settings.smtpPassword ?? settings.smtp_password);
      const encryptedPassword = password
        ? await encryptSecret(password, encryptionKey)
        : String((existing as { smtp_password_encrypted?: string } | null)?.smtp_password_encrypted ?? "") || null;

      const subjectTemplate = clean(settings.subjectTemplate ?? settings.subject_template) || DEFAULT_MAIL_SUBJECT;
      const bodyTemplate = String(settings.bodyTemplate ?? settings.body_template ?? "").trim() || DEFAULT_MAIL_BODY;

      const { data: saved, error: saveError } = await adminClient
        .from("club_mail_settings")
        .upsert({
          club_id: clubId,
          sender_name: clean(settings.senderName ?? settings.sender_name),
          sender_email: clean(settings.senderEmail ?? settings.sender_email).toLowerCase(),
          reply_to_email: clean(settings.replyToEmail ?? settings.reply_to_email).toLowerCase() || null,
          smtp_host: clean(settings.smtpHost ?? settings.smtp_host),
          smtp_port: toInt(settings.smtpPort ?? settings.smtp_port, 587),
          smtp_secure: Boolean(settings.smtpSecure ?? settings.smtp_secure),
          smtp_username: clean(settings.smtpUsername ?? settings.smtp_username),
          smtp_password_encrypted: encryptedPassword,
          subject_template: subjectTemplate,
          body_template: bodyTemplate,
          updated_by: user.id,
        })
        .select("*")
        .single();

      if (saveError) throw saveError;
      return jsonResponse({ settings: serializeSettings(saved as Record<string, unknown>) });
    }

    if (action === "test") {
      if (!existing) return jsonResponse({ error: "Mailsettings sind noch nicht gespeichert." }, 400);
      const encryptedPassword = String((existing as { smtp_password_encrypted?: string }).smtp_password_encrypted ?? "");
      if (!encryptedPassword) return jsonResponse({ error: "SMTP-Passwort fehlt." }, 400);

      const smtpPassword = await decryptSecret(encryptedPassword, encryptionKey);
      const senderEmail = String((existing as { sender_email?: string }).sender_email ?? "").trim();
      if (!senderEmail) return jsonResponse({ error: "Absender-E-Mail fehlt." }, 400);

      await sendSmtpMail(
        {
          sender_name: String((existing as { sender_name?: string }).sender_name ?? ""),
          sender_email: senderEmail,
          reply_to_email: String((existing as { reply_to_email?: string | null }).reply_to_email ?? "") || null,
          smtp_host: String((existing as { smtp_host?: string }).smtp_host ?? ""),
          smtp_port: Number((existing as { smtp_port?: number }).smtp_port ?? 587),
          smtp_secure: Boolean((existing as { smtp_secure?: boolean }).smtp_secure),
          smtp_username: String((existing as { smtp_username?: string }).smtp_username ?? ""),
          smtp_password: smtpPassword,
        },
        senderEmail,
        "FestPlaner Testmail",
        "Diese Testmail bestätigt, dass der Mailversand für FestPlaner eingerichtet ist.",
      );

      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "Unbekannte Aktion." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
