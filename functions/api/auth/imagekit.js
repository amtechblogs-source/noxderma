// Cloudflare Pages Function for ImageKit Auth using standard Web Crypto API (HMAC-SHA1)
async function hmacSha1Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestGet(context) {
  const env = context.env || {};
  const privateKey = env.IMAGEKIT_PRIVATE_KEY;
  const publicKey = env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;
  const urlEndpoint = env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;

  const token = crypto.randomUUID().replace(/-/g, "");
  const expire = Math.floor(Date.now() / 1000) + 1800;

  if (!privateKey || !publicKey || !urlEndpoint) {
    return new Response(
      JSON.stringify({
        token: `mock_token_${Date.now()}`,
        expire,
        signature: `mock_sig_${Date.now()}`,
        warning: "IMAGEKIT_PRIVATE_KEY not configured on Cloudflare Pages.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const signature = await hmacSha1Hex(privateKey, `${token}${expire}`);
  return new Response(JSON.stringify({ token, expire, signature }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestDelete(context) {
  const env = context.env || {};
  const privateKey = env.IMAGEKIT_PRIVATE_KEY;
  const url = new URL(context.request.url);
  const fileId = url.searchParams.get("fileId");

  if (!fileId) {
    return new Response(JSON.stringify({ error: "Missing fileId parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!privateKey) {
    return new Response(JSON.stringify({ success: true, fileId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = "Basic " + btoa(`${privateKey}:`);
    const res = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
      headers: { Authorization: authHeader },
    });
    return new Response(JSON.stringify({ success: res.ok, fileId }), {
      status: res.ok ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
