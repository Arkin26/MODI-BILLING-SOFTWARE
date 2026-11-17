import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type CreateBody = {
  username: string;
  password: string;
  name: string;
  role: "admin" | "user";
  email?: string;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json(401, { error: "Missing authorization" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await caller.auth.getUser();
    if (userError || !user) {
      return json(401, { error: "Invalid session" });
    }

    const { data: profile, error: profileError } = await caller
      .from("app_users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || profile?.role !== "admin") {
      return json(403, { error: "Only admins can create users" });
    }

    const body = (await req.json()) as CreateBody;
    const username = (body.username ?? "").trim();
    const password = body.password ?? "";
    const name = (body.name ?? "").trim();
    const role = body.role === "admin" ? "admin" : "user";

    if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
      return json(400, {
        error:
          "Username must be 3–32 characters (letters, numbers, . _ -)",
      });
    }
    if (password.length < 8) {
      return json(400, { error: "Password must be at least 8 characters" });
    }
    if (!name) {
      return json(400, { error: "Name is required" });
    }

    const email =
      (body.email ?? "").trim().toLowerCase() ||
      `${username.toLowerCase()}@modielectricals.com`;

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username, name },
        app_metadata: { role },
      });

    if (createError || !created.user) {
      return json(400, {
        error: createError?.message ?? "Failed to create auth user",
      });
    }

    const { error: insertError } = await admin.from("app_users").insert({
      id: created.user.id,
      username,
      name,
      email,
      role,
    });

    if (insertError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json(400, { error: insertError.message });
    }

    return json(200, {
      user: {
        id: created.user.id,
        username,
        name,
        email,
        role,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return json(500, { error: message });
  }
});
