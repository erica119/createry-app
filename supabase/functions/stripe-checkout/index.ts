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
    const body = await req.json()
    const { recipe_pack_id, tenant_id } = body
    const { data: pack, error: packError } = await supabase
      .from('recipe_packs')
      .select('*, tenants(stripe_account_id)')
      .eq('id', recipe_pack_id)
      .single()
    if (packError || !pack) throw new Error('Recipe pack not found')
    if (tenant_id && pack.tenant_id !== tenant_id) throw new Error('Recipe pack does not belong to this creator')
    const connectedAccountId = pack.tenants?.stripe_account_id
    if (!connectedAccountId) throw new Error('Creator has not connected Stripe')
    const platformFeeCents = Math.round(pack.price_cents * 0.20)
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: pack.name, description: pack.description || undefined },
          unit_amount: pack.price_cents,
        },
        quantity: 1,
      }],
      payment_intent_data: {
        application_fee_amount: platformFeeCents,
        transfer_data: { destination: connectedAccountId },
      },
      metadata: { recipe_pack_id, user_id: user.id, tenant_id: pack.tenant_id },
      success_url: 'https://createry.app/?purchase=success',
      cancel_url: 'https://createry.app/',
    })
    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('stripe-checkout error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
