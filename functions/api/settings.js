export async function onRequestGet() {
  return new Response(
    JSON.stringify({
      settings: null,
      isDefaultFallback: true,
      source: "cloudflare_edge_client_firestore",
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    return new Response(
      JSON.stringify({
        success: true,
        settings: body,
        persistedTo: "client_firestore",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
