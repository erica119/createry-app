import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { recipe_pack_id, user_id, tenant_id, success_url, cancel_url } = await req.json()

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: pack } = await supabase
      .from('recipe_packs')
      .select('*, tenants(stripe_account_id)')
      .eq('id', recipe_pack_id)
      .single()

    if (!pack) throw new Error('Recipe pack not found')

    const connectedAccountId = pack.tenants?.stripe_account_id
    if (!connectedAccountId) throw new Error('Creator has not connected Stripe')

    const platformFeePercent = 20
    const platformFeeCents = Math.round(pack.price_cents * (platformFeePercent / 100))

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: pack.name,
            description: pack.description || undefined,
          },
          unit_amount: pack.price_cents,
        },
        quantity: 1,
      }],
      payment_intent_data: {
        application_fee_amount: platformFeeCents,
        transfer_data: {
          destination: connectedAccountId,
        },
      },
      metadata: {
        recipe_pack_id,
        user_id,
        tenant_id,
      },
      success_url,
      cancel_url,
    })

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
