import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const fullAdminPermissions = [
  "dashboard",
  "info",
  "meetings",
  "shifts",
  "reservations",
  "costs",
  "users",
  "dashboard:reserved_tables",
  "dashboard:pending_reservations",
  "dashboard:open_shift_spots",
  "dashboard:checklist_progress",
  "dashboard:reservations_by_day",
  "dashboard:open_shifts_by_day",
  "dashboard:next_tasks",
];

const slugify = (value: string) => {
  const normalized = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "verein";
};

const allowedLogoTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/svg+xml", "svg"],
]);

const getPublicLogoUrl = (supabaseUrl: string, path?: string | null) => {
  if (!path) return "";
  return `${supabaseUrl}/storage/v1/object/public/club-logos/${encodeURIComponent(path).replace(/%2F/g, "/")}`;
};

const parseDataUrl = (value: string) => {
  const match = value.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    bytes: Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0)),
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

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error("Supabase Edge Function secrets are missing.");
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser();

    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: systemAdmin, error: systemAdminError } = await adminClient
      .from("system_admins")
      .select("user_id")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (systemAdminError) throw systemAdminError;
    if (!systemAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = req.method === "GET" ? { action: "list" } : await req.json().catch(() => ({ action: "list" }));
    const action = String(body.action ?? "list");

    if (action === "create") {
      const clubName = String(body.clubName ?? "").trim();
      const adminEmail = String(body.adminEmail ?? "").trim().toLowerCase();
      const adminPassword = String(body.adminPassword ?? "");
      const adminFullName = String(body.adminFullName ?? "").trim();

      if (!clubName || !adminEmail || !adminPassword) {
        return new Response(JSON.stringify({ error: "clubName, adminEmail and adminPassword are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { full_name: adminFullName },
      });

      if (createUserError) throw createUserError;
      const userId = createdUser.user?.id;
      if (!userId) throw new Error("Admin user was not created.");

      const { data: club, error: clubError } = await adminClient
        .from("clubs")
        .insert({
          name: clubName,
          slug: `${slugify(clubName)}-${crypto.randomUUID().slice(0, 8)}`,
          created_by: caller.id,
        })
        .select("id,name,slug,status,created_at")
        .single();

      if (clubError) throw clubError;

      const { data: role, error: roleError } = await adminClient
        .from("app_roles")
        .insert({
          club_id: club.id,
          name: "Admin",
          description: "Voller Zugriff auf diesen Verein",
          permissions: fullAdminPermissions,
        })
        .select("id")
        .single();

      if (roleError) throw roleError;

      const { error: profileError } = await adminClient.from("app_user_profiles").upsert({
        user_id: userId,
        email: adminEmail,
        full_name: adminFullName,
      });

      if (profileError) throw profileError;

      const { error: membershipError } = await adminClient.from("club_memberships").upsert({
        club_id: club.id,
        user_id: userId,
        role_id: role.id,
      });

      if (membershipError) throw membershipError;

      return new Response(JSON.stringify({ club, adminUserId: userId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "set_status") {
      const clubId = String(body.clubId ?? "");
      const status = body.status === "inactive" ? "inactive" : "active";

      if (!clubId) {
        return new Response(JSON.stringify({ error: "clubId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await adminClient
        .from("clubs")
        .update({ status })
        .eq("id", clubId);

      if (error) throw error;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const clubId = String(body.clubId ?? "");
      const confirmName = String(body.confirmName ?? "").trim();

      const { data: club, error: clubLookupError } = await adminClient
        .from("clubs")
        .select("id,name,logo_path")
        .eq("id", clubId)
        .maybeSingle();

      if (clubLookupError) throw clubLookupError;
      if (!club) {
        return new Response(JSON.stringify({ error: "Club not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (confirmName !== club.name) {
        return new Response(JSON.stringify({ error: "Confirmation name does not match" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: logoObjects } = await adminClient.storage
        .from("club-logos")
        .list(`clubs/${club.id}`, { limit: 100 });
      const logoPaths = (logoObjects ?? []).map((item) => `clubs/${club.id}/${item.name}`);
      if (logoPaths.length > 0) {
        await adminClient.storage.from("club-logos").remove(logoPaths);
      }

      const { error: deleteError } = await adminClient
        .from("clubs")
        .delete()
        .eq("id", club.id);

      if (deleteError) throw deleteError;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "upload_logo") {
      const clubId = String(body.clubId ?? "");
      const logoDataUrl = String(body.logoDataUrl ?? "");
      const parsedLogo = parseDataUrl(logoDataUrl);

      if (!clubId || !parsedLogo) {
        return new Response(JSON.stringify({ error: "clubId and logoDataUrl are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const extension = allowedLogoTypes.get(parsedLogo.mimeType);
      if (!extension) {
        return new Response(JSON.stringify({ error: "Unsupported logo type" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (parsedLogo.bytes.byteLength > 2 * 1024 * 1024) {
        return new Response(JSON.stringify({ error: "Logo must be 2 MB or smaller" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: club, error: clubLookupError } = await adminClient
        .from("clubs")
        .select("id,logo_path")
        .eq("id", clubId)
        .maybeSingle();

      if (clubLookupError) throw clubLookupError;
      if (!club) {
        return new Response(JSON.stringify({ error: "Club not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (club.logo_path) {
        await adminClient.storage.from("club-logos").remove([club.logo_path]);
      }

      const logoPath = `clubs/${clubId}/logo-${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await adminClient.storage
        .from("club-logos")
        .upload(logoPath, parsedLogo.bytes, {
          contentType: parsedLogo.mimeType,
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { error: updateError } = await adminClient
        .from("clubs")
        .update({ logo_path: logoPath, logo_updated_at: new Date().toISOString() })
        .eq("id", clubId);

      if (updateError) throw updateError;

      return new Response(JSON.stringify({ logoPath, logoUrl: getPublicLogoUrl(supabaseUrl, logoPath) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [
      { data: clubs, error: clubsError },
      { data: memberships, error: membershipsError },
      { data: profiles, error: profilesError },
      { data: roles, error: rolesError },
    ] = await Promise.all([
      adminClient
        .from("clubs")
        .select("id,name,slug,status,logo_path,logo_updated_at,created_at")
        .order("created_at", { ascending: false }),
      adminClient
        .from("club_memberships")
        .select("club_id,user_id,role_id,created_at")
        .order("created_at", { ascending: false }),
      adminClient
        .from("app_user_profiles")
        .select("user_id,email,full_name"),
      adminClient
        .from("app_roles")
        .select("id,name"),
    ]);

    if (clubsError) throw clubsError;
    if (membershipsError) throw membershipsError;
    if (profilesError) throw profilesError;
    if (rolesError) throw rolesError;

    const profilesById = new Map((profiles ?? []).map((profile) => [String(profile.user_id), profile]));
    const rolesById = new Map((roles ?? []).map((role) => [String(role.id), role]));
    const enrichedMemberships = (memberships ?? []).map((membership) => ({
      club_id: membership.club_id,
      user_id: membership.user_id,
      profile: profilesById.get(String(membership.user_id)) ?? null,
      role: membership.role_id ? rolesById.get(String(membership.role_id)) ?? null : null,
    }));

    const enrichedClubs = (clubs ?? []).map((club) => ({
      ...club,
      logoUrl: getPublicLogoUrl(supabaseUrl, club.logo_path),
    }));

    return new Response(JSON.stringify({ clubs: enrichedClubs, memberships: enrichedMemberships }), {
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
