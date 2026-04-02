import Stripe from 'https://esm.sh/stripe@13.3.0?target=deno&no-check'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-08-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await req.json()
    console.log('Request body:', JSON.stringify(body))
    const { recipe_pack_id, user_id, tenant_id, success_url, cancel_url } = body
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    console.log('Querying pack:', recipe_pack_id)
    const { data: pack, error: packError } = await supabase
      .from('recipe_packs')
      .select('*, tenants(stripe_account_id)')
      .eq('id', recipe_pack_id)
      .single()
    console.log('Pack result:', JSON.stringify(pack), 'Error:', JSON.stringify(packError))
    if (!pack) throw new Error('Recipe pack not found')
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
      metadata: { recipe_pack_id, user_id, tenant_id },
      success_url: success_url || 'https://easymealplanning.netlify.app/?purchase=success',
      cancel_url: cancel_url || 'https://easymealplanning.netlify.app/',
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
