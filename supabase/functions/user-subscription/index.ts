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

const PRICE_IDS = {
  monthly: 'price_1TO2FOJzNLT19PhajR1RFngH',
  annual: 'price_1TO2HjJzNLT19PhazkTrMt66',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { tenant_id, plan } = body
    const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
    if (!token) throw new Error('Sign in required')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user || !user.email) throw new Error('Invalid session')
    const user_id = user.id

    if (!user_id || !tenant_id || !plan) {
      throw new Error('Missing required fields: user_id, tenant_id, plan')
    }

    if (!PRICE_IDS[plan as keyof typeof PRICE_IDS]) {
      throw new Error('Invalid plan. Must be monthly or annual')
    }

    // Get tenant info including creator name and stripe_account_id
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('name, stripe_account_id, stripe_onboarded')
      .eq('id', tenant_id)
      .single()

    if (tenantError || !tenant) throw new Error('Tenant not found')

    // Block if creator has not connected Stripe
    if (!tenant.stripe_account_id || !tenant.stripe_onboarded) {
      return new Response(
        JSON.stringify({
          error: 'creator_not_ready',
          creator_name: tenant.name,
        }),
        {
          status: 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const { data: userProfile } = await supabase.from('user_profiles')
      .select('tenant_id').eq('user_id', user_id).eq('tenant_id', tenant_id).maybeSingle()
    const { data: familyProfile } = !userProfile ? await supabase.from('family_profiles')
      .select('id').eq('user_id', user_id).eq('tenant_id', tenant_id).maybeSingle() : { data: null }
    if (!userProfile && !familyProfile) throw new Error('This creator is not available to your account')

    const platformFeeCents = plan === 'monthly' ? Math.round(900 * 0.20) : Math.round(9000 * 0.20)

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: user.email,
      line_items: [{
        price: PRICE_IDS[plan as keyof typeof PRICE_IDS],
        quantity: 1,
      }],
      subscription_data: {
        trial_period_days: 7,
        application_fee_percent: 20,
        transfer_data: {
          destination: tenant.stripe_account_id,
        },
        metadata: { user_id, tenant_id, plan },
      },
      metadata: { user_id, tenant_id, plan },
      success_url: 'https://createry.app/?user_subscription=success',
      cancel_url: 'https://createry.app/',
    })

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('user-subscription error:', err.message)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
