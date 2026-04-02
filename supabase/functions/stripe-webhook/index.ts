import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno&no-check'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-08-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

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
    console.error('Webhook signature error:', err.message)
    return new Response(`Webhook error: ${err.message}`, { status: 400 })
  }
  console.log('Webhook event type:', event.type)
  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account
    if (account.charges_enabled && account.details_submitted) {
      await supabase
        .from('tenants')
        .update({ stripe_onboarded: true })
        .eq('stripe_account_id', account.id)
    }
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const { recipe_pack_id, user_id, tenant_id } = session.metadata || {}
    console.log('Purchase metadata:', { recipe_pack_id, user_id, tenant_id })
    if (recipe_pack_id && user_id && tenant_id) {
      const { error } = await supabase.from('user_purchases').upsert({
        user_id,
        tenant_id,
        recipe_pack_id,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent as string || '',
        amount_cents: session.amount_total || 0,
        currency: session.currency || 'usd',
        status: session.payment_status || 'paid',
        purchased_at: new Date().toISOString(),
      }, { onConflict: 'user_id,recipe_pack_id' })
      console.log('Upsert error:', JSON.stringify(error))
    }
  }
  return new Response(JSON.stringify({ received: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
