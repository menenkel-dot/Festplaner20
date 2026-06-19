import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase Edge Function secrets are missing.");
    }

    const { token, shiftId, helperName } = await req.json();
    const cleanedToken = String(token ?? "").trim();
    const cleanedName = String(helperName ?? "").trim();

    if (!cleanedToken || !shiftId || !cleanedName) {
      return new Response(JSON.stringify({ error: "token, shiftId and helperName are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: link, error: linkError } = await adminClient
      .from("public_links")
      .select("festival_id")
      .eq("token", cleanedToken)
      .eq("type", "helper_signup")
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

    const { data: shift, error: shiftError } = await adminClient
      .from("shifts")
      .select("id,festival_id,needed,shift_helpers(helper_name)")
      .eq("id", shiftId)
      .eq("festival_id", link.festival_id)
      .maybeSingle();

    if (shiftError) throw shiftError;
    if (!shift) {
      return new Response(JSON.stringify({ error: "Shift not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const helpers = Array.isArray(shift.shift_helpers)
      ? shift.shift_helpers.map((helper) => String(helper.helper_name).trim())
      : [];

    if (helpers.some((helper) => helper.toLowerCase() === cleanedName.toLowerCase())) {
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (helpers.length >= Number(shift.needed)) {
      return new Response(JSON.stringify({ error: "Diese Schicht ist bereits voll besetzt." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: insertError } = await adminClient.from("shift_helpers").insert({
      shift_id: shift.id,
      helper_name: cleanedName,
    });

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ ok: true }), {
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
