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
    const periodEnd = new Date()
    const periodStart = new Date(periodEnd)
    periodStart.setDate(periodStart.getDate() - 7)
    const periodStartStr = periodStart.toISOString().split('T')[0]
    const periodEndStr = periodEnd.toISOString().split('T')[0]

    // Fetch all paid, not-yet-paid-out purchases in the window
    const { data: purchases, error: fetchError } = await supabase
      .from('user_purchases')
      .select('id, tenant_id, amount_cents, tenants(stripe_account_id, brand_name)')
      .eq('status', 'paid')
      .eq('paid_out', false)
      .gte('purchased_at', periodStart.toISOString())
      .lte('purchased_at', periodEnd.toISOString())

    if (fetchError) throw new Error(fetchError.message)

    if (!purchases || purchases.length === 0) {
      return new Response(JSON.stringify({ success: true, payouts: [], message: 'No unpaid purchases in period' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Group by tenant
    const byTenant: Record<string, {
      gross_cents: number
      purchase_ids: string[]
      stripe_account_id: string | null
      brand_name: string
    }> = {}

    for (const p of purchases) {
      const tenant = p.tenants as any
      if (!byTenant[p.tenant_id]) {
        byTenant[p.tenant_id] = {
          gross_cents: 0,
          purchase_ids: [],
          stripe_account_id: tenant?.stripe_account_id || null,
          brand_name: tenant?.brand_name || 'Unknown',
        }
      }
      byTenant[p.tenant_id].gross_cents += p.amount_cents
      byTenant[p.tenant_id].purchase_ids.push(p.id)
    }

    const results = []

    for (const [tenantId, data] of Object.entries(byTenant)) {
      const creatorCents = Math.floor(data.gross_cents * 0.8)
      let stripeTransferId: string | null = null
      let status = 'pending_stripe'

      // Transfer via Stripe if the tenant has connected their account
      if (data.stripe_account_id) {
        try {
          const transfer = await stripe.transfers.create({
            amount: creatorCents,
            currency: 'usd',
            destination: data.stripe_account_id,
            description: `Plate payout for ${data.brand_name} — ${periodStartStr} to ${periodEndStr}`,
          })
          stripeTransferId = transfer.id
          status = 'paid'
        } catch (stripeErr: any) {
          console.error(`Stripe transfer failed for tenant ${tenantId}:`, stripeErr.message)
          results.push({ tenantId, success: false, error: stripeErr.message })
          continue
        }
      }

      // Record payout in creator_payouts
      const { error: payoutError } = await supabase.from('creator_payouts').insert({
        tenant_id: tenantId,
        amount_cents: creatorCents,
        stripe_transfer_id: stripeTransferId,
        status,
        period_start: periodStartStr,
        period_end: periodEndStr,
      })

      if (payoutError) {
        console.error(`Failed to record payout for ${tenantId}:`, payoutError.message)
        results.push({ tenantId, success: false, error: payoutError.message })
        continue
      }

      // Mark purchases as paid out
      await supabase
        .from('user_purchases')
        .update({ paid_out: true })
        .in('id', data.purchase_ids)

      results.push({ tenantId, success: true, amount_cents: creatorCents, stripe_transfer_id: stripeTransferId, status })
    }

    return new Response(JSON.stringify({ success: true, payouts: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
