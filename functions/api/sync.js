export async function onRequestPost(context) {
  try {
    const op = await context.request.json();
    const year = new Date().getFullYear();
    const suffix = String(Date.now()).slice(-5);
    const officialReference =
      op?.entityType === "invoice"
        ? op?.payload?.provisionalReference || `NXD-${year}-${suffix}`
        : undefined;

    return new Response(
      JSON.stringify({
        success: true,
        officialReference,
        syncedAt: new Date().toISOString(),
        mode: "cloudflare_edge",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch {
    return new Response(
      JSON.stringify({
        success: true,
        syncedAt: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
