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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { price_id, creator_id, tenant_id } = await req.json()
    console.log('creator-subscription request:', { price_id, creator_id, tenant_id })

    if (!price_id || !creator_id || !tenant_id) {
      throw new Error('Missing price_id, creator_id, or tenant_id')
    }

    const plan = price_id === 'price_1TNdqeJzNLT19Phao9z7oH4u' ? 'monthly' : 'annual'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: price_id, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
        metadata: { creator_id, tenant_id },
      },
      metadata: { creator_id, tenant_id, plan },
      success_url: 'https://easymealplanning.netlify.app?subscription=success',
      cancel_url: 'https://easymealplanning.netlify.app?subscription=cancelled',
      allow_promotion_codes: true,
    })

    await supabase.from('creator_subscriptions').upsert({
      creator_id,
      tenant_id,
      status: 'pending',
      plan,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'creator_id' })

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('creator-subscription error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
