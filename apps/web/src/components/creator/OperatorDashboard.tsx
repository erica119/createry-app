import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { User } from '@supabase/supabase-js'

interface Props {
  user: User
  onSignOut: () => void
}

export default function OperatorDashboard({ user, onSignOut }: Props) {
  const [earnings, setEarnings] = useState<any[]>([])
  const [tenants, setTenants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'revenue' | 'tenants'>('revenue')

  useEffect(() => {
    fetchAllEarnings()
    fetchTenants()
  }, [])

  const fetchAllEarnings = async () => {
    const { data } = await supabase
      .from('user_purchases')
      .select('amount_cents, recipe_pack_id, tenant_id, recipe_packs(name), tenants(brand_name)')
      .eq('status', 'paid')
    if (!data) { setLoading(false); return }
    const byTenantPack: Record<string, any> = {}
    for (const p of data) {
      const key = `${p.tenant_id}__${p.recipe_pack_id}`
      if (!byTenantPack[key]) {
        byTenantPack[key] = {
          tenant_name: (p.tenants as any)?.brand_name || 'Unknown',
          pack_name: (p.recipe_packs as any)?.name || 'Unknown',
          units_sold: 0,
          gross_cents: 0,
        }
      }
      byTenantPack[key].units_sold += 1
      byTenantPack[key].gross_cents += p.amount_cents
    }
    setEarnings(Object.values(byTenantPack))
    setLoading(false)
  }

  const fetchTenants = async () => {
    const { data } = await supabase
      .from('tenants')
      .select('id, brand_name, subdomain, subscription_status, stripe_onboarded, created_at')
      .neq('id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
      .order('created_at', { ascending: false })
    if (data) {
      const enriched = await Promise.all(data.map(async t => {
        const [{ count: recipeCount }, { count: packCount }, { data: purchases }] = await Promise.all([
          supabase.from('recipes').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id),
          supabase.from('recipe_packs').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id),
          supabase.from('user_purchases').select('amount_cents').eq('tenant_id', t.id).eq('status', 'paid'),
        ])
        const gross = (purchases || []).reduce((s: number, p: any) => s + p.amount_cents, 0)
        return { ...t, recipe_count: recipeCount || 0, pack_count: packCount || 0, gross_cents: gross }
      }))
      setTenants(enriched)
    }
  }

  const totalGross = earnings.reduce((s, e) => s + e.gross_cents, 0)
  const totalUnits = earnings.reduce((s, e) => s + e.units_sold, 0)
  const totalPlatform = totalGross * 0.2
  const totalCreators = totalGross * 0.8

  const navStyle = (v: string) => ({
    background: 'none', border: 'none', cursor: 'pointer',
    fontWeight: view === v ? '700' : '400',
    color: view === v ? 'white' : 'rgba(255,255,255,0.7)',
    fontSize: '0.95rem', padding: '0.25rem 0',
    fontFamily: 'var(--font-sans)',
    borderBottom: view === v ? '2px solid #C4622D' : '2px solid transparent',
    transition: 'all 0.15s ease',
  })

  return (
    <div style={{ fontFamily: 'var(--font-sans)', minHeight: '100vh', background: '#FDF6EE' }}>
      <div style={{ padding: '0 2rem', background: '#2C1810', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-serif)', color: 'white', fontWeight: '600', fontSize: '1.1rem', padding: '1rem 0' }}>
            🍽️ Plate <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', fontWeight: '400' }}>Operator</span>
          </span>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <button onClick={() => setView('revenue')} style={navStyle('revenue') as any}>Revenue</button>
            <button onClick={() => setView('tenants')} style={navStyle('tenants') as any}>
              Tenants <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.15)', padding: '0.1rem 0.4rem', borderRadius: '10px', marginLeft: '0.3rem' }}>{tenants.length}</span>
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>{user.email}</span>
          <button onClick={onSignOut} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '0.4rem 0.9rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Sign out</button>
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem' }}>
        {loading ? (
          <p style={{ color: '#6B5C52' }}>Loading...</p>
        ) : (
          <>
            {view === 'revenue' && (
              <>
                <div style={{ marginBottom: '1.5rem' }}>
                  <h2 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Platform Revenue</h2>
                  <p style={{ color: '#6B5C52', margin: 0, fontSize: '0.9rem' }}>All-time earnings across all creator tenants.</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                  {[
                    { label: 'Total Gross', value: `$${(totalGross / 100).toFixed(2)}`, icon: '💵' },
                    { label: 'Platform 20%', value: `$${(totalPlatform / 100).toFixed(2)}`, icon: '🏦' },
                    { label: 'Paid to Creators', value: `$${(totalCreators / 100).toFixed(2)}`, icon: '👩‍🍳' },
                    { label: 'Total Units Sold', value: totalUnits, icon: '🧾' },
                  ].map(stat => (
                    <div key={stat.label} style={{ background: 'white', borderRadius: '12px', padding: '1.25rem', border: '1px solid #E8D5B7' }}>
                      <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{stat.icon}</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#2C1810', fontFamily: 'var(--font-serif)' }}>{stat.value}</div>
                      <div style={{ color: '#9B8B82', fontSize: '0.85rem' }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
                {earnings.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', background: '#F5EFE6', borderRadius: '16px', border: '1px dashed #D4B896' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>💰</div>
                    <p style={{ color: '#6B5C52', margin: 0 }}>No sales across the platform yet.</p>
                  </div>
                ) : (
                  <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #E8D5B7', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 1fr', padding: '0.875rem 1.25rem', background: '#F5EFE6', borderBottom: '1px solid #E8D5B7' }}>
                      {['Creator', 'Pack', 'Units', 'Gross', 'Creator 80%', 'Platform 20%'].map(h => (
                        <div key={h} style={{ fontSize: '0.8rem', fontWeight: '700', color: '#6B5C52', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                      ))}
                    </div>
                    {earnings.map((e, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 1fr', padding: '1rem 1.25rem', borderBottom: i < earnings.length - 1 ? '1px solid #F5EFE6' : 'none', alignItems: 'center' }}>
                        <div style={{ fontWeight: '600', color: '#2C1810', fontSize: '0.9rem' }}>{e.tenant_name}</div>
                        <div style={{ color: '#6B5C52', fontSize: '0.9rem' }}>{e.pack_name}</div>
                        <div style={{ color: '#2C1810', fontSize: '0.9rem' }}>{e.units_sold}</div>
                        <div style={{ color: '#2C1810', fontSize: '0.9rem' }}>${(e.gross_cents / 100).toFixed(2)}</div>
                        <div style={{ color: '#16a34a', fontWeight: '600', fontSize: '0.9rem' }}>${(e.gross_cents * 0.8 / 100).toFixed(2)}</div>
                        <div style={{ color: '#C4622D', fontWeight: '600', fontSize: '0.9rem' }}>${(e.gross_cents * 0.2 / 100).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {view === 'tenants' && (
              <>
                <div style={{ marginBottom: '1.5rem' }}>
                  <h2 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Creator Tenants</h2>
                  <p style={{ color: '#6B5C52', margin: 0, fontSize: '0.9rem' }}>All creator accounts on the platform.</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                  {[
                    { label: 'Total Tenants', value: tenants.length, icon: '🏪' },
                    { label: 'Stripe Connected', value: tenants.filter(t => t.stripe_onboarded).length, icon: '💳' },
                    { label: 'Total Recipes', value: tenants.reduce((s, t) => s + t.recipe_count, 0), icon: '📖' },
                  ].map(stat => (
                    <div key={stat.label} style={{ background: 'white', borderRadius: '12px', padding: '1.25rem', border: '1px solid #E8D5B7' }}>
                      <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{stat.icon}</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#2C1810', fontFamily: 'var(--font-serif)' }}>{stat.value}</div>
                      <div style={{ color: '#9B8B82', fontSize: '0.85rem' }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {tenants.map(t => (
                    <div key={t.id} style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', border: '1px solid #E8D5B7', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', alignItems: 'center', gap: '1rem' }}>
                      <div>
                        <div style={{ fontWeight: '700', color: '#2C1810', fontSize: '1rem', marginBottom: '0.2rem' }}>{t.brand_name}</div>
                        <div style={{ color: '#9B8B82', fontSize: '0.8rem' }}>{t.subdomain}.plate.app</div>
                        <div style={{ marginTop: '0.4rem' }}>
                          <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '20px', fontWeight: '600', background: t.subscription_status === 'trialing' ? '#FEF9C3' : '#F0FDF4', color: t.subscription_status === 'trialing' ? '#854D0E' : '#16a34a' }}>
                            {t.subscription_status}
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: '700', color: '#2C1810', fontSize: '1.1rem' }}>{t.recipe_count}</div>
                        <div style={{ color: '#9B8B82', fontSize: '0.75rem' }}>recipes</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: '700', color: '#2C1810', fontSize: '1.1rem' }}>{t.pack_count}</div>
                        <div style={{ color: '#9B8B82', fontSize: '0.75rem' }}>packs</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: '700', color: '#2C1810', fontSize: '1.1rem' }}>${(t.gross_cents / 100).toFixed(2)}</div>
                        <div style={{ color: '#9B8B82', fontSize: '0.75rem' }}>gross</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: '700', color: '#16a34a', fontSize: '1.1rem' }}>${(t.gross_cents * 0.8 / 100).toFixed(2)}</div>
                        <div style={{ color: '#9B8B82', fontSize: '0.75rem' }}>their 80%</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.25rem' }}>{t.stripe_onboarded ? '✅' : '⚠️'}</div>
                        <div style={{ color: '#9B8B82', fontSize: '0.75rem' }}>{t.stripe_onboarded ? 'Stripe connected' : 'Not connected'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
