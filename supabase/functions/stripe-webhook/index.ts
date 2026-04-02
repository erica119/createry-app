import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const signature = req.headers.get('stripe-signature')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const body = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, webhookSecret!)
  } catch (err: any) {
    return new Response(`Webhook error: ${err.message}`, { status: 400 })
  }

  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account
    const chargesEnabled = account.charges_enabled
    const detailsSubmitted = account.details_submitted
    if (chargesEnabled && detailsSubmitted) {
      await supabase
        .from('tenants')
        .update({ stripe_onboarded: true })
        .eq('stripe_account_id', account.id)
    }
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const { recipe_pack_id, user_id, tenant_id } = session.metadata || {}
    if (recipe_pack_id && user_id && tenant_id) {
      await supabase.from('user_purchases').upsert({
        user_id,
        tenant_id,
        recipe_pack_id,
        stripe_session_id: session.id,
      }, { onConflict: 'user_id,recipe_pack_id' })
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
