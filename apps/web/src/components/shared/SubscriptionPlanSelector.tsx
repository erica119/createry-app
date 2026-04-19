import { useState } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  userId: string
  tenantId: string
  tenantName: string
  onSuccess?: () => void
}

export default function SubscriptionPlanSelector({ userId, tenantId, tenantName, onSuccess: _onSuccess }: Props) {
  const [planLoading, setPlanLoading] = useState<string | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [creatorNotReady, setCreatorNotReady] = useState<string | null>(null)

  const handlePlanSelect = async (plan: 'monthly' | 'annual') => {
    setPlanLoading(plan)
    setPlanError(null)
    setCreatorNotReady(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          user_id: userId,
          tenant_id: tenantId,
          plan,
          success_url: `${window.location.origin}/?user_subscription=success`,
          cancel_url: `${window.location.origin}/`,
        }),
      })
      const data = await res.json()
      if (data.error === 'creator_not_ready') {
        setCreatorNotReady(data.creator_name || tenantName)
        return
      }
      if (data.error) throw new Error(data.error)
      window.location.href = data.url
    } catch (err: any) {
      setPlanError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setPlanLoading(null)
    }
  }

  return (
    <div>
      {creatorNotReady && (
        <div style={{ background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1.25rem', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#92400E', fontWeight: '500' }}>
            Oops! {creatorNotReady} isn't totally ready for you just yet. Try again soon.
          </p>
        </div>
      )}

      {planError && (
        <p style={{ color: '#dc2626', fontSize: '0.85rem', textAlign: 'center', marginBottom: '1rem' }}>{planError}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
        <button
          onClick={() => handlePlanSelect('monthly')}
          disabled={!!planLoading}
          style={{
            width: '100%', background: 'var(--color-primary)', color: 'white', border: 'none',
            padding: '1rem 1.25rem', borderRadius: '12px', cursor: planLoading ? 'not-allowed' : 'pointer',
            opacity: planLoading ? 0.7 : 1, textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}
        >
          <div>
            <div style={{ fontWeight: '700', fontSize: '1rem', marginBottom: '0.2rem' }}>Monthly</div>
            <div style={{ fontSize: '0.8rem', opacity: 0.85 }}>7-day free trial, then $9/month</div>
          </div>
          <div style={{ fontWeight: '700', fontSize: '1.1rem' }}>
            {planLoading === 'monthly' ? '...' : '$9'}<span style={{ fontSize: '0.75rem', fontWeight: '400' }}>/mo</span>
          </div>
        </button>

        <button
          onClick={() => handlePlanSelect('annual')}
          disabled={!!planLoading}
          style={{
            width: '100%', background: 'white', color: 'var(--espresso)',
            border: '2px solid var(--color-primary)', padding: '1rem 1.25rem', borderRadius: '12px',
            cursor: planLoading ? 'not-allowed' : 'pointer', opacity: planLoading ? 0.7 : 1,
            textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}
        >
          <div>
            <div style={{ fontWeight: '700', fontSize: '1rem', marginBottom: '0.2rem' }}>
              Annual
              <span style={{ marginLeft: '0.5rem', background: '#D1FAE5', color: '#065F46', fontSize: '0.7rem', fontWeight: '600', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                SAVE 17%
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>7-day free trial, then $90/year</div>
          </div>
          <div style={{ fontWeight: '700', fontSize: '1.1rem', color: 'var(--espresso)' }}>
            {planLoading === 'annual' ? '...' : '$90'}<span style={{ fontSize: '0.75rem', fontWeight: '400' }}>/yr</span>
          </div>
        </button>
      </div>

      {planLoading && (
        <p style={{ textAlign: 'center', color: 'var(--text-light)', fontSize: '0.85rem' }}>Redirecting to checkout...</p>
      )}
    </div>
  )
}
