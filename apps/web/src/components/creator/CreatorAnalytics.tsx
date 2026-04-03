import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  tenantId: string
  primaryColor: string
}

interface RecipeStats {
  id: string
  title: string
  meal_type: string[]
  complexity: string
  image_url: string | null
  appearances: number
}

interface MonthlySales {
  month: string
  count: number
  revenue_cents: number
}

interface AnalyticsData {
  totalUsers: number
  totalMenus: number
  totalRevenue: number
  totalSales: number
  recipeStats: RecipeStats[]
  monthlySales: MonthlySales[]
}

export default function CreatorAnalytics({ tenantId, primaryColor }: Props) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const color = primaryColor || '#C4622D'

  useEffect(() => {
    fetchAnalytics()
  }, [tenantId])

  async function fetchAnalytics() {
    setLoading(true)

    const [
      { count: totalUsers },
      { data: menus },
      { data: purchases },
      { data: recipes },
    ] = await Promise.all([
      supabase.from('family_profiles').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.from('weekly_menus').select('menu_data, created_at').eq('tenant_id', tenantId),
      supabase.from('user_purchases').select('amount_cents, created_at, status').eq('tenant_id', tenantId).eq('status', 'paid'),
      supabase.from('recipes').select('id, title, meal_type, complexity, image_url').eq('tenant_id', tenantId).eq('is_active', true),
    ])

    const recipeMap: Record<string, number> = {}
    for (const menu of menus || []) {
      const days = menu.menu_data?.days || {}
      for (const day of Object.values(days) as any[]) {
        for (const slot of ['breakfast', 'lunch', 'dinner']) {
          if (day[slot]) {
            recipeMap[day[slot]] = (recipeMap[day[slot]] || 0) + 1
          }
        }
      }
    }

    const recipeStats: RecipeStats[] = (recipes || [])
      .map(r => ({ ...r, appearances: recipeMap[r.id] || 0 }))
      .sort((a, b) => b.appearances - a.appearances)
      .slice(0, 20)

    const monthMap: Record<string, MonthlySales> = {}
    for (const p of purchases || []) {
      const d = new Date(p.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      if (!monthMap[key]) monthMap[key] = { month: label, count: 0, revenue_cents: 0 }
      monthMap[key].count += 1
      monthMap[key].revenue_cents += p.amount_cents
    }
    const monthlySales = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v)
      .slice(-6)

    setData({
      totalUsers: totalUsers || 0,
      totalMenus: (menus || []).length,
      totalRevenue: (purchases || []).reduce((s, p) => s + p.amount_cents, 0),
      totalSales: (purchases || []).length,
      recipeStats,
      monthlySales,
    })
    setLoading(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', color: '#9B8B82', fontSize: '0.9rem' }}>
      Loading analytics…
    </div>
  )

  if (!data) return null

  const maxBar = Math.max(...(data.monthlySales.map(m => m.count)), 1)
  const maxAppearances = Math.max(...data.recipeStats.map(r => r.appearances), 1)

  const statCard = (icon: string, label: string, value: string | number, sub?: string) => (
    <div style={{ background: 'white', borderRadius: '14px', padding: '1.25rem 1.5rem', border: '1px solid #E8D5B7', boxShadow: '0 1px 4px rgba(44,24,16,0.05)' }}>
      <div style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>{icon}</div>
      <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#2C1810', fontFamily: 'var(--font-serif)', lineHeight: 1 }}>{value}</div>
      <div style={{ color: '#6B5C52', fontSize: '0.82rem', marginTop: '0.3rem', fontWeight: '600' }}>{label}</div>
      {sub && <div style={{ color: '#9B8B82', fontSize: '0.75rem', marginTop: '0.15rem' }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      <div>
        <h2 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Analytics</h2>
        <p style={{ color: '#6B5C52', margin: 0, fontSize: '0.9rem' }}>How your recipes and revenue are performing.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
        {statCard('👨‍👩‍👧', 'Total Users', data.totalUsers, 'on your platform')}
        {statCard('📅', 'Menus Generated', data.totalMenus, 'all time')}
        {statCard('🧾', 'Total Sales', data.totalSales, 'recipe pack purchases')}
        {statCard('💵', 'Your Revenue', `$${(data.totalRevenue * 0.8 / 100).toFixed(2)}`, `$${(data.totalRevenue / 100).toFixed(2)} gross`)}
      </div>

      {data.monthlySales.length > 0 && (
        <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', border: '1px solid #E8D5B7' }}>
          <h3 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 1.5rem', fontSize: '1.1rem' }}>Sales — Last 6 Months</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', height: '140px' }}>
            {data.monthlySales.map((m, i) => {
              const barHeight = Math.max(4, Math.round((m.count / maxBar) * 120))
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: '700', color: color }}>{m.count}</div>
                  <div
                    style={{
                      width: '100%', height: `${barHeight}px`,
                      background: color, borderRadius: '6px 6px 0 0',
                      opacity: 0.85, transition: 'height 0.3s ease',
                      position: 'relative',
                    }}
                    title={`$${(m.revenue_cents / 100).toFixed(2)} revenue`}
                  />
                  <div style={{ fontSize: '0.7rem', color: '#9B8B82', textAlign: 'center', whiteSpace: 'nowrap' }}>{m.month}</div>
                </div>
              )
            })}
          </div>
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #F5EFE6', display: 'flex', gap: '2rem' }}>
            <div>
              <span style={{ fontSize: '0.78rem', color: '#9B8B82' }}>Total sales</span>
              <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#2C1810', marginLeft: '0.5rem' }}>{data.monthlySales.reduce((s, m) => s + m.count, 0)}</span>
            </div>
            <div>
              <span style={{ fontSize: '0.78rem', color: '#9B8B82' }}>Total revenue</span>
              <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#2C1810', marginLeft: '0.5rem' }}>${(data.monthlySales.reduce((s, m) => s + m.revenue_cents, 0) / 100).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {data.recipeStats.length > 0 && (
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #E8D5B7', overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #F5EFE6' }}>
            <h3 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 0.15rem', fontSize: '1.1rem' }}>Recipe Performance</h3>
            <p style={{ color: '#9B8B82', margin: 0, fontSize: '0.8rem' }}>How often each recipe appears in generated menus</p>
          </div>
          <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
            {data.recipeStats.map((r, i) => {
              const barWidth = Math.max(2, Math.round((r.appearances / maxAppearances) * 100))
              return (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: '1rem',
                  padding: '0.85rem 1.5rem',
                  borderBottom: i < data.recipeStats.length - 1 ? '1px solid #F5EFE6' : 'none',
                  background: i % 2 === 0 ? 'white' : '#FDFAF6',
                }}>
                  <div style={{ width: '24px', textAlign: 'right', color: '#C8BAB2', fontSize: '0.78rem', fontWeight: '700', flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  {r.image_url ? (
                    <img src={r.image_url} alt={r.title} style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#F5EFE6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>🍽️</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '600', color: '#2C1810', fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.3rem' }}>
                      <div style={{ flex: 1, height: '5px', background: '#F5EFE6', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{ width: `${barWidth}%`, height: '100%', background: color, borderRadius: '999px', opacity: r.appearances === 0 ? 0.2 : 0.8 }} />
                      </div>
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ fontSize: '1rem', fontWeight: '700', color: r.appearances > 0 ? color : '#C8BAB2' }}>{r.appearances}</div>
                    <div style={{ fontSize: '0.68rem', color: '#9B8B82' }}>uses</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {data.recipeStats.length === 0 && data.monthlySales.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', background: '#F5EFE6', borderRadius: '16px', border: '1px dashed #D4B896' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📊</div>
          <p style={{ color: '#6B5C52', margin: 0 }}>Analytics will populate as users generate menus and purchase recipe packs.</p>
        </div>
      )}

    </div>
  )
}
