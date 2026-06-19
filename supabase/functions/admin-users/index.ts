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

    const { email, password, fullName, roleId, clubId } = await req.json();
    if (!email || !password || !roleId || !clubId) {
      return new Response(JSON.stringify({ error: "email, password, roleId and clubId are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: callerMembership }, { data: systemAdmin }] = await Promise.all([
      adminClient
      .from("club_memberships")
      .select("role:app_roles(permissions)")
      .eq("club_id", clubId)
      .eq("user_id", caller.id)
        .maybeSingle(),
      adminClient
        .from("system_admins")
        .select("user_id")
        .eq("user_id", caller.id)
        .maybeSingle(),
    ]);

    const permissions = callerMembership?.role?.permissions ?? [];
    if (!systemAdmin && !permissions.includes("users")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: role, error: roleError } = await adminClient
      .from("app_roles")
      .select("id")
      .eq("id", roleId)
      .eq("club_id", clubId)
      .maybeSingle();

    if (roleError) throw roleError;
    if (!role) {
      return new Response(JSON.stringify({ error: "Role not found for club" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName ?? "" },
    });

    if (createError) throw createError;

    const userId = created.user?.id;
    if (!userId) throw new Error("User was not created.");

    const { error: profileError } = await adminClient.from("app_user_profiles").upsert({
      user_id: userId,
      email,
      full_name: fullName ?? "",
    });

    if (profileError) throw profileError;

    const { error: membershipError } = await adminClient.from("club_memberships").upsert({
      club_id: clubId,
      user_id: userId,
      role_id: roleId,
    });

    if (membershipError) throw membershipError;

    return new Response(JSON.stringify({ userId }), {
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
