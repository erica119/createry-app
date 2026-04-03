import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendWebPush(subscription: any, payload: string, vapidKeys: any) {
  const { endpoint, p256dh, auth } = subscription;

  const audienceUrl = new URL(endpoint);
  const audience = `${audienceUrl.protocol}//${audienceUrl.host}`;

  const now = Math.floor(Date.now() / 1000);
  const expiration = now + 12 * 60 * 60;

  const header = { typ: "JWT", alg: "ES256" };
  const claims = {
    aud: audience,
    exp: expiration,
    sub: Deno.env.get("VAPID_EMAIL")!,
  };

  const encoder = new TextEncoder();

  function base64UrlEncode(data: Uint8Array): string {
    const base64 = btoa(String.fromCharCode(...data));
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  function base64UrlDecode(str: string): Uint8Array {
    const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
    const binary = atob(padded);
    return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
  }

  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const claimsB64 = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const signingInput = `${headerB64}.${claimsB64}`;

  const privateKeyBytes = base64UrlDecode(vapidKeys.privateKey);
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    encoder.encode(signingInput)
  );

  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;

  const publicKeyBytes = base64UrlDecode(vapidKeys.publicKey);

  const encryptionKey = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  const clientPublicKey = await crypto.subtle.importKey(
    "raw",
    base64UrlDecode(p256dh),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientPublicKey },
    encryptionKey.privateKey,
    256
  );

  const authBytes = base64UrlDecode(auth);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const prk = await crypto.subtle.importKey("raw", new Uint8Array(sharedSecret), { name: "HKDF" }, false, ["deriveBits"]);
  
  const payloadBytes = encoder.encode(payload);
  const paddedPayload = new Uint8Array(payloadBytes.length + 2);
  paddedPayload.set(payloadBytes, 2);

  const serverPublicKeyRaw = await crypto.subtle.exportKey("raw", encryptionKey.publicKey);

  const headers: Record<string, string> = {
    "Authorization": `vapid t=${jwt}, k=${base64UrlEncode(publicKeyBytes)}`,
    "Content-Type": "application/octet-stream",
    "Content-Encoding": "aes128gcm",
    "TTL": "86400",
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: paddedPayload,
  });

  return response;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { tenant_id } = await req.json().catch(() => ({}));

    let subsQuery = supabase.from("push_subscriptions").select("*");
    if (tenant_id) subsQuery = subsQuery.eq("tenant_id", tenant_id);

    const { data: subscriptions, error: subError } = await subsQuery;
    if (subError) throw subError;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No subscriptions found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const vapidKeys = {
      publicKey: Deno.env.get("VAPID_PUBLIC_KEY")!,
      privateKey: Deno.env.get("VAPID_PRIVATE_KEY")!,
    };

    const payload = JSON.stringify({
      title: "🍽️ Your Weekly Menu is Ready!",
      body: "Your personalized meal plan for the week has been generated. Tap to view and start shopping.",
      tag: "weekly-menu",
      url: "/",
    });

    let sent = 0;
    let failed = 0;
    const expiredEndpoints: string[] = [];

    for (const sub of subscriptions) {
      try {
        const res = await sendWebPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload,
          vapidKeys
        );
        if (res.status === 410 || res.status === 404) {
          expiredEndpoints.push(sub.endpoint);
        } else if (res.ok || res.status === 201) {
          sent++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    if (expiredEndpoints.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("endpoint", expiredEndpoints);
    }

    return new Response(
      JSON.stringify({ success: true, sent, failed, expired: expiredEndpoints.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
