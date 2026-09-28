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
    const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
    if (!token) return new Response(JSON.stringify({ error: 'Sign in required' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return new Response(JSON.stringify({ error: 'Invalid session' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
    const { price_id, tenant_id } = await req.json()
    const allowedPrices = ['price_1TNdqeJzNLT19Phao9z7oH4u', 'price_1TNdwNJzNLT19PhaZF15La1v']
    if (!tenant_id || !allowedPrices.includes(price_id)) throw new Error('Invalid subscription request')
    const { data: tenant } = await supabase.from('tenants').select('id').eq('id', tenant_id).eq('owner_id', user.id).maybeSingle()
    if (!tenant) throw new Error('Creator account not found')
    const creator_id = user.id

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
      success_url: 'https://createry.app?subscription=success',
      cancel_url: 'https://createry.app?subscription=cancelled',
      allow_promotion_codes: true,
    })

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
