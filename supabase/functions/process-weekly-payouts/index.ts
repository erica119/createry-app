// Recipe-pack Checkout already transfers the creator share through Stripe Connect.
// Keep this legacy endpoint disabled to prevent a second payout.
Deno.serve(() => new Response(
  JSON.stringify({ error: 'Legacy weekly payouts are disabled' }),
  { status: 410, headers: { 'Content-Type': 'application/json' } },
))
