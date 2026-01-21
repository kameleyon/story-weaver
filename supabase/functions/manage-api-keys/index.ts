import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// AES-GCM encryption using Web Crypto API
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyString = Deno.env.get("ENCRYPTION_KEY");
  if (!keyString) {
    throw new Error("ENCRYPTION_KEY not configured");
  }
  
  // Create a consistent 256-bit key from the secret
  const encoder = new TextEncoder();
  const keyData = encoder.encode(keyString);
  const hashBuffer = await crypto.subtle.digest("SHA-256", keyData);
  
  return crypto.subtle.importKey(
    "raw",
    hashBuffer,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encrypt(plaintext: string): Promise<string> {
  if (!plaintext) return "";
  
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );
  
  // Combine IV + ciphertext and encode as base64
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(ciphertext: string): Promise<string> {
  if (!ciphertext) return "";
  
  try {
    const key = await getEncryptionKey();
    
    // Decode base64
    const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
    
    // Extract IV and ciphertext
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encrypted
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error("Decryption failed:", error);
    // Return empty string if decryption fails (legacy unencrypted data)
    return "";
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with anon key for auth verification
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user token
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await anonClient.auth.getClaims(token);
    
    if (authError || !claimsData?.claims?.sub) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub as string;
    const method = req.method;

    if (method === "GET") {
      // Retrieve and decrypt API keys
      const { data, error } = await serviceClient
        .from("user_api_keys")
        .select("gemini_api_key, replicate_api_token")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("Database error:", error);
        throw error;
      }

      if (!data) {
        return new Response(
          JSON.stringify({ gemini_api_key: "", replicate_api_token: "" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Decrypt the keys
      const decryptedGemini = await decrypt(data.gemini_api_key || "");
      const decryptedReplicate = await decrypt(data.replicate_api_token || "");

      // Return masked versions for display (show last 4 chars only)
      const maskKey = (key: string) => {
        if (!key || key.length < 8) return key ? "••••••••" : "";
        return "••••••••" + key.slice(-4);
      };

      return new Response(
        JSON.stringify({
          gemini_api_key: maskKey(decryptedGemini),
          replicate_api_token: maskKey(decryptedReplicate),
          has_gemini: !!decryptedGemini,
          has_replicate: !!decryptedReplicate,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (method === "POST") {
      // Save encrypted API keys
      const body = await req.json();
      const { gemini_api_key, replicate_api_token } = body;

      console.log("Encrypting and saving API keys for user:", userId);

      // Encrypt the keys
      const encryptedGemini = gemini_api_key ? await encrypt(gemini_api_key) : null;
      const encryptedReplicate = replicate_api_token ? await encrypt(replicate_api_token) : null;

      // Check if record exists
      const { data: existing } = await serviceClient
        .from("user_api_keys")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (existing) {
        // Update existing record
        const { error } = await serviceClient
          .from("user_api_keys")
          .update({
            gemini_api_key: encryptedGemini,
            replicate_api_token: encryptedReplicate,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);

        if (error) throw error;
      } else {
        // Insert new record
        const { error } = await serviceClient
          .from("user_api_keys")
          .insert({
            user_id: userId,
            gemini_api_key: encryptedGemini,
            replicate_api_token: encryptedReplicate,
          });

        if (error) throw error;
      }

      console.log("API keys saved successfully for user:", userId);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (method === "DELETE") {
      // Delete API keys
      const { error } = await serviceClient
        .from("user_api_keys")
        .delete()
        .eq("user_id", userId);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in manage-api-keys:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
