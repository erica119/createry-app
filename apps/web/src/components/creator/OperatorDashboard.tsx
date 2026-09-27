import BrandMark from '../shared/BrandMark'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import type { User } from '@supabase/supabase-js'

interface Props {
  user: User
  onSignOut: () => void
  accessToken: string | null
}

export default function OperatorDashboard({ user, onSignOut, accessToken }: Props) {
  const [earnings, setEarnings] = useState<any[]>([])
  const [tenants, setTenants] = useState<any[]>([])
  const [allPayouts, setAllPayouts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [totalUsers, setTotalUsers] = useState(0)
  const [totalMenusGenerated, setTotalMenusGenerated] = useState(0)
  const [selectedTenant, setSelectedTenant] = useState<any | null>(null)

  const [scraperMode, setScraperMode] = useState<'single' | 'blog'>('single')
  const [scraperUrl, setScraperUrl] = useState('')
  const [scraperTenantId, setScraperTenantId] = useState('')
  const [discovering, setDiscovering] = useState(false)
  const [discoveredLinks, setDiscoveredLinks] = useState<{ title: string; url: string }[]>([])
  const [selectedLinks, setSelectedLinks] = useState<Set<string>>(new Set())
  const [parsing, setParsing] = useState(false)
  const [parsedRecipes, setParsedRecipes] = useState<{ url: string; recipe: any; error: string | null; selected: boolean }[]>([])
  const [saving, setSaving] = useState(false)
  const [scraperError, setScraperError] = useState<string | null>(null)
  const [scraperSuccess, setScraperSuccess] = useState<string | null>(null)
  const [view, setView] = useState<'overview' | 'revenue' | 'tenants' | 'payouts' | 'scraper'>('overview')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchAllEarnings()
    fetchAllPayouts()
    // Fetch operator stats first (needs service-role), then enrich tenants
    fetchOperatorStats().then(({ usersByTenant, menusByTenant }) => {
      fetchTenants(usersByTenant, menusByTenant)
    })
  }, [])

  const fetchOperatorStats = async (): Promise<{ usersByTenant: Record<string, number>; menusByTenant: Record<string, number> }> => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-operator-stats`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        }
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || response.status.toString())
      setTotalUsers(result.total_users || 0)
      setTotalMenusGenerated(result.total_menus || 0)
      return {
        usersByTenant: result.users_by_tenant || {},
        menusByTenant: result.menus_by_tenant || {},
      }
    } catch (err) {
      console.error('fetchOperatorStats error:', err)
      return { usersByTenant: {}, menusByTenant: {} }
    }
  }

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

  const fetchTenants = async (usersByTenant: Record<string, number>, menusByTenant: Record<string, number>) => {
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
        return {
          ...t,
          recipe_count: recipeCount || 0,
          pack_count: packCount || 0,
          gross_cents: gross,
          user_count: usersByTenant[t.id] || 0,
          menu_count: menusByTenant[t.id] || 0,
        }
      }))
      setTenants(enriched)
    }
    setLoading(false)
  }

  const fetchAllPayouts = async () => {
    const { data } = await supabase
      .from('creator_payouts')
      .select('*, tenants(brand_name)')
      .order('created_at', { ascending: false })
    if (data) setAllPayouts(data)
  }

  const totalGross = earnings.reduce((s, e) => s + e.gross_cents, 0)
  const totalUnits = earnings.reduce((s, e) => s + e.units_sold, 0)
  const totalPlatform = totalGross * 0.2
  const totalCreators = totalGross * 0.8

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  const callScraper = async (body: any) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${supabaseUrl}/functions/v1/scrape-recipe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify(body),
    })
    return await res.json()
  }

  const handleDiscover = async () => {
    if (!scraperUrl.trim()) return
    setDiscovering(true)
    setScraperError(null)
    setDiscoveredLinks([])
    setSelectedLinks(new Set())
    setParsedRecipes([])
    try {
      const data = await callScraper({ mode: 'discover', url: scraperUrl.trim() })
      if (data.error) throw new Error(data.error)
      setDiscoveredLinks(data.links || [])
      if ((data.links || []).length === 0) setScraperError('No recipe links found on that page. Try a more specific URL.')
    } catch (err: any) {
      setScraperError(err.message)
    } finally {
      setDiscovering(false)
    }
  }

  const handleParseSingle = async () => {
    if (!scraperUrl.trim()) return
    setParsing(true)
    setScraperError(null)
    setParsedRecipes([])
    try {
      const data = await callScraper({ mode: 'parse', urls: [scraperUrl.trim()] })
      if (data.error) throw new Error(data.error)
      setParsedRecipes((data.results || []).map((r: any) => ({ ...r, selected: !r.error })))
    } catch (err: any) {
      setScraperError(err.message)
    } finally {
      setParsing(false)
    }
  }

  const handleParseSelected = async () => {
    const urls = Array.from(selectedLinks)
    if (urls.length === 0) return
    setParsing(true)
    setScraperError(null)
    setParsedRecipes([])
    try {
      const data = await callScraper({ mode: 'parse', urls })
      if (data.error) throw new Error(data.error)
      setParsedRecipes((data.results || []).map((r: any) => ({ ...r, selected: !r.error })))
    } catch (err: any) {
      setScraperError(err.message)
    } finally {
      setParsing(false)
    }
  }

  const handleSave = async () => {
    if (!scraperTenantId) { setScraperError('Please select a tenant.'); return }
    const toSave = parsedRecipes.filter(r => r.selected && r.recipe)
    if (toSave.length === 0) { setScraperError('No recipes selected to save.'); return }
    setSaving(true)
    setScraperError(null)
    try {
      const recipesToInsert = toSave.map(r => ({
        tenant_id: scraperTenantId,
        title: r.recipe.title,
        description: r.recipe.description || null,
        ingredients: (r.recipe.ingredients || []).map((ing: string) => ({ name: ing, quantity: '', unit: '' })),
        instructions: r.recipe.instructions || '',
        prep_time_minutes: r.recipe.prep_time_minutes || null,
        cook_time_minutes: r.recipe.cook_time_minutes || null,
        servings: r.recipe.servings || null,
        cuisine_tags: r.recipe.cuisine_tags || [],
        meal_type: r.recipe.meal_type || ['dinner'],
        dietary_tags: r.recipe.dietary_tags || [],
        complexity: r.recipe.complexity || 'moderate',
        image_url: r.recipe.image_url || null,
        is_premium: false,
        is_active: true,
        created_by: user.id,
      }))
      const { error } = await supabase.from('recipes').insert(recipesToInsert)
      if (error) throw new Error(error.message)
      setScraperSuccess(`${toSave.length} recipe${toSave.length > 1 ? 's' : ''} saved successfully!`)
      setParsedRecipes([])
      setDiscoveredLinks([])
      setSelectedLinks(new Set())
      setScraperUrl('')
      setTimeout(() => setScraperSuccess(null), 4000)
    } catch (err: any) {
      setScraperError(err.message)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const OP_TABS: { view: typeof view; label: string }[] = [
    { view: 'overview', label: '📊 Overview' },
    { view: 'tenants', label: `🏪 Tenants${tenants.length ? ` (${tenants.length})` : ''}` },
    { view: 'revenue', label: '💵 Revenue' },
    { view: 'payouts', label: '💸 Payouts' },
    { view: 'scraper', label: '🔍 Scraper' },
  ]

  return (
    <div style={{ fontFamily: 'var(--font-sans)', minHeight: '100vh', background: '#FAF3E8' }}>
      <div ref={menuRef} style={{ position: 'relative' }}>
        <div className="op-nav-bar" style={{ padding: '0 2rem', background: '#1F3B30', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-display)', color: 'white', fontWeight: '600', fontSize: '1.1rem', padding: '1rem 0', whiteSpace: 'nowrap' }}>
            <BrandMark onDark /> <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', fontWeight: '400' }}>Operator</span>
            <span style={{ fontWeight: '400', color: 'rgba(255,255,255,0.7)', marginLeft: '0.5rem', fontSize: '0.9rem' }}>· {{ overview: 'Overview', revenue: 'Revenue', tenants: 'Tenants', payouts: 'Payouts', scraper: 'Scraper' }[view]}</span>
          </span>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span className="nav-email" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>{user.email}</span>
            <button onClick={onSignOut} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '0.4rem 0.9rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Sign out</button>
            <button onClick={() => setMenuOpen(o => !o)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1, padding: '0.25rem' }}>☰</button>
          </div>
        </div>
        {menuOpen && (
          <div style={{ position: 'absolute', top: '100%', right: '1rem', background: 'white', borderRadius: '12px', boxShadow: '0 8px 32px rgba(44,24,16,0.18)', border: '1px solid #DDCDBB', minWidth: '180px', zIndex: 50, overflow: 'hidden' }}>
            {OP_TABS.map(({ view: v, label }, i, arr) => (
              <button key={v} onClick={() => { setView(v); setMenuOpen(false) }} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '0.8rem 1.25rem',
                background: view === v ? '#FAF3E8' : 'white',
                color: view === v ? '#C9471F' : '#1F3B30',
                fontWeight: view === v ? '700' : '400',
                fontSize: '0.95rem', border: 'none',
                borderBottom: i < arr.length - 1 ? '1px solid #F5E8D7' : 'none',
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}>{label}</button>
            ))}
          </div>
        )}
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem' }}>
        {loading ? (
          <p style={{ color: '#52645A' }}>Loading...</p>
        ) : (
          <>
            {view === 'overview' && (
              <>
                <div style={{ marginBottom: '1.5rem' }}>
                  <h2 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Platform Overview</h2>
                  <p style={{ color: '#52645A', margin: 0, fontSize: '0.9rem' }}>Health and activity across all creator tenants.</p>
                </div>
                <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                  {[
                    { label: 'Total Tenants', value: tenants.length, icon: '🏪', sub: `${tenants.filter(t => t.subscription_status === 'active').length} active` },
                    { label: 'Total Users', value: totalUsers, icon: '👥', sub: 'across all tenants' },
                    { label: 'Menus Generated', value: totalMenusGenerated, icon: '📋', sub: 'all time' },
                  ].map(stat => (
                    <div key={stat.label} style={{ background: 'white', borderRadius: '12px', padding: '1.25rem', border: '1px solid #DDCDBB' }}>
                      <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{stat.icon}</div>
                      <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#1F3B30', fontFamily: 'var(--font-display)' }}>{stat.value}</div>
                      <div style={{ color: '#687A70', fontSize: '0.85rem' }}>{stat.label}</div>
                      <div style={{ color: '#8A9A8F', fontSize: '0.75rem', marginTop: '0.2rem' }}>{stat.sub}</div>
                    </div>
                  ))}
                </div>
                <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                  {[
                    { label: 'Total Platform Revenue', value: `$${(totalGross / 100).toFixed(2)}`, icon: '💵', sub: 'gross across all tenants' },
                    { label: 'Platform Take (20%)', value: `$${(totalPlatform / 100).toFixed(2)}`, icon: '🏦', sub: 'your share' },
                    { label: 'Stripe Connected', value: tenants.filter(t => t.stripe_onboarded).length, icon: '💳', sub: `of ${tenants.length} tenants` },
                  ].map(stat => (
                    <div key={stat.label} style={{ background: 'white', borderRadius: '12px', padding: '1.25rem', border: '1px solid #DDCDBB' }}>
                      <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{stat.icon}</div>
                      <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#1F3B30', fontFamily: 'var(--font-display)' }}>{stat.value}</div>
                      <div style={{ color: '#687A70', fontSize: '0.85rem' }}>{stat.label}</div>
                      <div style={{ color: '#8A9A8F', fontSize: '0.75rem', marginTop: '0.2rem' }}>{stat.sub}</div>
                    </div>
                  ))}
                </div>

                <h3 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 1rem', fontSize: '1.15rem' }}>Tenant Health</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {tenants.map(t => {
                    const isActive = t.user_count > 0 && t.recipe_count > 0
                    const isSetup = !isActive && t.recipe_count > 0
                    const health = isActive ? 'active' : isSetup ? 'setup' : 'inactive'
                    const healthStyle: Record<string, { bg: string; color: string; label: string }> = {
                      active: { bg: '#F0FDF4', color: '#16a34a', label: '● Active' },
                      setup: { bg: '#FEF9C3', color: '#854D0E', label: '◑ Setup' },
                      inactive: { bg: '#FFF5F5', color: '#dc2626', label: '○ Inactive' },
                    }
                    const hs = healthStyle[health]
                    return (
                      <div key={t.id} onClick={() => { setSelectedTenant(t); setView('tenants') }} style={{ background: 'white', borderRadius: '12px', padding: '1rem 1.25rem', border: '1px solid #DDCDBB', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
                        <div>
                          <div style={{ fontWeight: '700', color: '#1F3B30', fontSize: '0.95rem' }}>{t.brand_name}</div>
                          <div style={{ color: '#687A70', fontSize: '0.75rem' }}>{t.subdomain}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: '700', color: '#1F3B30' }}>{t.user_count}</div>
                          <div style={{ color: '#687A70', fontSize: '0.72rem' }}>users</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: '700', color: '#1F3B30' }}>{t.recipe_count}</div>
                          <div style={{ color: '#687A70', fontSize: '0.72rem' }}>recipes</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: '700', color: '#1F3B30' }}>{t.menu_count}</div>
                          <div style={{ color: '#687A70', fontSize: '0.72rem' }}>menus</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: '700', color: '#16a34a' }}>${(t.gross_cents / 100).toFixed(0)}</div>
                          <div style={{ color: '#687A70', fontSize: '0.72rem' }}>revenue</div>
                        </div>
                        <span style={{ background: hs.bg, color: hs.color, fontSize: '0.72rem', fontWeight: '700', padding: '0.2rem 0.6rem', borderRadius: '20px', whiteSpace: 'nowrap' }}>{hs.label}</span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {view === 'revenue' && (
              <>
                <div style={{ marginBottom: '1.5rem' }}>
                  <h2 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Platform Revenue</h2>
                  <p style={{ color: '#52645A', margin: 0, fontSize: '0.9rem' }}>All-time earnings across all creator tenants.</p>
                </div>
                <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                  {[
                    { label: 'Total Gross', value: `$${(totalGross / 100).toFixed(2)}`, icon: '💵' },
                    { label: 'Platform 20%', value: `$${(totalPlatform / 100).toFixed(2)}`, icon: '🏦' },
                    { label: 'Paid to Creators', value: `$${(totalCreators / 100).toFixed(2)}`, icon: '👩‍🍳' },
                    { label: 'Total Units Sold', value: totalUnits, icon: '🧾' },
                  ].map(stat => (
                    <div key={stat.label} style={{ background: 'white', borderRadius: '12px', padding: '1.25rem', border: '1px solid #DDCDBB' }}>
                      <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{stat.icon}</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1F3B30', fontFamily: 'var(--font-display)' }}>{stat.value}</div>
                      <div style={{ color: '#687A70', fontSize: '0.85rem' }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
                {earnings.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', background: '#F5E8D7', borderRadius: '16px', border: '1px dashed #CAB7A4' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>💰</div>
                    <p style={{ color: '#52645A', margin: 0 }}>No sales across the platform yet.</p>
                  </div>
                ) : (
                  <div className="table-scroll">
                  <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #DDCDBB', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 1fr', padding: '0.875rem 1.25rem', background: '#F5E8D7', borderBottom: '1px solid #DDCDBB' }}>
                      {['Creator', 'Pack', 'Units', 'Gross', 'Creator 80%', 'Platform 20%'].map(h => (
                        <div key={h} style={{ fontSize: '0.8rem', fontWeight: '700', color: '#52645A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                      ))}
                    </div>
                    {earnings.map((e, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 1fr', padding: '1rem 1.25rem', borderBottom: i < earnings.length - 1 ? '1px solid #F5E8D7' : 'none', alignItems: 'center' }}>
                        <div style={{ fontWeight: '600', color: '#1F3B30', fontSize: '0.9rem' }}>{e.tenant_name}</div>
                        <div style={{ color: '#52645A', fontSize: '0.9rem' }}>{e.pack_name}</div>
                        <div style={{ color: '#1F3B30', fontSize: '0.9rem' }}>{e.units_sold}</div>
                        <div style={{ color: '#1F3B30', fontSize: '0.9rem' }}>${(e.gross_cents / 100).toFixed(2)}</div>
                        <div style={{ color: '#16a34a', fontWeight: '600', fontSize: '0.9rem' }}>${(e.gross_cents * 0.8 / 100).toFixed(2)}</div>
                        <div style={{ color: '#C9471F', fontWeight: '600', fontSize: '0.9rem' }}>${(e.gross_cents * 0.2 / 100).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                  </div>
                )}
              </>
            )}

            {view === 'tenants' && !selectedTenant && (
              <>
                <div style={{ marginBottom: '1.5rem' }}>
                  <h2 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Creator Tenants</h2>
                  <p style={{ color: '#52645A', margin: 0, fontSize: '0.9rem' }}>All creator accounts on the platform. Click a tenant to view details.</p>
                </div>
                <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                  {[
                    { label: 'Total Tenants', value: tenants.length, icon: '🏪' },
                    { label: 'Total Users', value: totalUsers, icon: '👥' },
                    { label: 'Stripe Connected', value: tenants.filter(t => t.stripe_onboarded).length, icon: '💳' },
                    { label: 'Total Recipes', value: tenants.reduce((s, t) => s + t.recipe_count, 0), icon: '📖' },
                  ].map(stat => (
                    <div key={stat.label} style={{ background: 'white', borderRadius: '12px', padding: '1.25rem', border: '1px solid #DDCDBB' }}>
                      <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{stat.icon}</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1F3B30', fontFamily: 'var(--font-display)' }}>{stat.value}</div>
                      <div style={{ color: '#687A70', fontSize: '0.85rem' }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {tenants.map(t => {
                    const isActive = t.user_count > 0 && t.recipe_count > 0
                    const isSetup = !isActive && t.recipe_count > 0
                    const health = isActive ? 'active' : isSetup ? 'setup' : 'inactive'
                    const healthStyle: Record<string, { bg: string; color: string; label: string }> = {
                      active: { bg: '#F0FDF4', color: '#16a34a', label: '● Active' },
                      setup: { bg: '#FEF9C3', color: '#854D0E', label: '◑ Setup' },
                      inactive: { bg: '#FFF5F5', color: '#dc2626', label: '○ Inactive' },
                    }
                    const hs = healthStyle[health]
                    return (
                      <div key={t.id} onClick={() => setSelectedTenant(t)} style={{ background: 'white', borderRadius: '16px', padding: '1.25rem 1.5rem', border: '1px solid #DDCDBB', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr auto', alignItems: 'center', gap: '1rem', cursor: 'pointer', transition: 'box-shadow 0.15s' }}>
                        <div>
                          <div style={{ fontWeight: '700', color: '#1F3B30', fontSize: '1rem', marginBottom: '0.2rem' }}>{t.brand_name}</div>
                          <div style={{ color: '#687A70', fontSize: '0.8rem' }}>{t.subdomain}.createry.app</div>
                          <div style={{ marginTop: '0.4rem' }}>
                            <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '20px', fontWeight: '600', background: t.subscription_status === 'trialing' ? '#FEF9C3' : '#F0FDF4', color: t.subscription_status === 'trialing' ? '#854D0E' : '#16a34a' }}>
                              {t.subscription_status}
                            </span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: '700', color: '#1F3B30', fontSize: '1.1rem' }}>{t.user_count}</div>
                          <div style={{ color: '#687A70', fontSize: '0.75rem' }}>users</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: '700', color: '#1F3B30', fontSize: '1.1rem' }}>{t.recipe_count}</div>
                          <div style={{ color: '#687A70', fontSize: '0.75rem' }}>recipes</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: '700', color: '#1F3B30', fontSize: '1.1rem' }}>{t.pack_count}</div>
                          <div style={{ color: '#687A70', fontSize: '0.75rem' }}>packs</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: '700', color: '#1F3B30', fontSize: '1.1rem' }}>{t.menu_count}</div>
                          <div style={{ color: '#687A70', fontSize: '0.75rem' }}>menus</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: '700', color: '#16a34a', fontSize: '1.1rem' }}>${(t.gross_cents / 100).toFixed(2)}</div>
                          <div style={{ color: '#687A70', fontSize: '0.75rem' }}>gross</div>
                        </div>
                        <span style={{ background: hs.bg, color: hs.color, fontSize: '0.72rem', fontWeight: '700', padding: '0.2rem 0.6rem', borderRadius: '20px', whiteSpace: 'nowrap' }}>{hs.label}</span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {view === 'tenants' && selectedTenant && (
              <>
                <button onClick={() => setSelectedTenant(null)} style={{ background: 'none', border: 'none', color: '#C9471F', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '600', padding: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.25rem', fontFamily: 'var(--font-sans)' }}>
                  ← Back to Tenants
                </button>
                <div style={{ background: 'white', borderRadius: '16px', padding: '1.75rem', border: '1px solid #DDCDBB', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                      <h2 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.25rem', fontSize: '1.5rem' }}>{selectedTenant.brand_name}</h2>
                      <div style={{ color: '#687A70', fontSize: '0.85rem', marginBottom: '0.5rem' }}>{selectedTenant.subdomain}.createry.app · ID: {selectedTenant.id}</div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '20px', fontWeight: '600', background: selectedTenant.subscription_status === 'trialing' ? '#FEF9C3' : '#F0FDF4', color: selectedTenant.subscription_status === 'trialing' ? '#854D0E' : '#16a34a' }}>
                          {selectedTenant.subscription_status}
                        </span>
                        <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '20px', fontWeight: '600', background: selectedTenant.stripe_onboarded ? '#F0FDF4' : '#FFF5F5', color: selectedTenant.stripe_onboarded ? '#16a34a' : '#dc2626' }}>
                          {selectedTenant.stripe_onboarded ? '✓ Stripe connected' : '✗ Stripe not connected'}
                        </span>
                      </div>
                    </div>
                    <a href={`/?creator=${selectedTenant.subdomain}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.85rem', color: '#C9471F', fontWeight: '600', textDecoration: 'none' }}>
                      View tenant page →
                    </a>
                  </div>
                  <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                    {[
                      { label: 'Users', value: selectedTenant.user_count, icon: '👥' },
                      { label: 'Recipes', value: selectedTenant.recipe_count, icon: '📖' },
                      { label: 'Recipe Packs', value: selectedTenant.pack_count, icon: '📦' },
                      { label: 'Menus Generated', value: selectedTenant.menu_count, icon: '📋' },
                      { label: 'Gross Revenue', value: `$${(selectedTenant.gross_cents / 100).toFixed(2)}`, icon: '💵' },
                      { label: 'Their Earnings (80%)', value: `$${(selectedTenant.gross_cents * 0.8 / 100).toFixed(2)}`, icon: '💰' },
                    ].map(stat => (
                      <div key={stat.label} style={{ background: '#FAF3E8', borderRadius: '10px', padding: '1rem', border: '1px solid #DDCDBB' }}>
                        <div style={{ fontSize: '1.25rem', marginBottom: '0.3rem' }}>{stat.icon}</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1F3B30', fontFamily: 'var(--font-display)' }}>{stat.value}</div>
                        <div style={{ color: '#687A70', fontSize: '0.8rem' }}>{stat.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ background: '#FFF8EC', border: '1px solid #F5A623', borderRadius: '12px', padding: '1.25rem 1.5rem' }}>
                  <p style={{ margin: '0 0 0.5rem', fontWeight: '600', color: '#1F3B30', fontSize: '0.9rem' }}>⚙️ Tenant ID</p>
                  <code style={{ fontSize: '0.85rem', color: '#52645A', background: 'rgba(0,0,0,0.05)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>{selectedTenant.id}</code>
                  <p style={{ margin: '0.75rem 0 0', fontSize: '0.8rem', color: '#687A70' }}>Use this ID with the Recipe Scraper to import recipes directly into this tenant.</p>
                </div>
              </>
            )}

            {view === 'payouts' && (
              <>
                <div style={{ marginBottom: '1.5rem' }}>
                  <h2 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Creator Payouts</h2>
                  <p style={{ color: '#52645A', margin: 0, fontSize: '0.9rem' }}>All weekly payouts processed across the platform.</p>
                </div>
                <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                  {[
                    { label: 'Total Paid Out', value: `$${(allPayouts.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount_cents, 0) / 100).toFixed(2)}`, icon: '💸' },
                    { label: 'Platform Fees Collected', value: `$${(allPayouts.reduce((s, p) => s + p.amount_cents, 0) / 100 / 0.8 * 0.2).toFixed(2)}`, icon: '🏦' },
                    { label: 'Total Payouts', value: allPayouts.length, icon: '🧾' },
                  ].map(stat => (
                    <div key={stat.label} style={{ background: 'white', borderRadius: '12px', padding: '1.25rem', border: '1px solid #DDCDBB' }}>
                      <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{stat.icon}</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1F3B30', fontFamily: 'var(--font-display)' }}>{stat.value}</div>
                      <div style={{ color: '#687A70', fontSize: '0.85rem' }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
                {allPayouts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', background: '#F5E8D7', borderRadius: '16px', border: '1px dashed #CAB7A4' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>💸</div>
                    <p style={{ color: '#52645A', margin: 0 }}>No payouts processed yet.</p>
                  </div>
                ) : (
                  <div className="table-scroll">
                  <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #DDCDBB', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 2fr 1fr 1fr', padding: '0.875rem 1.25rem', background: '#F5E8D7', borderBottom: '1px solid #DDCDBB' }}>
                      {['Creator', 'Period', 'Amount', 'Stripe Transfer ID', 'Status', 'Date'].map(h => (
                        <div key={h} style={{ fontSize: '0.8rem', fontWeight: '700', color: '#52645A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                      ))}
                    </div>
                    {allPayouts.map((p, i) => (
                      <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 2fr 1fr 1fr', padding: '1rem 1.25rem', borderBottom: i < allPayouts.length - 1 ? '1px solid #F5E8D7' : 'none', alignItems: 'center' }}>
                        <div style={{ fontWeight: '600', color: '#1F3B30', fontSize: '0.9rem' }}>{(p.tenants as any)?.brand_name || '—'}</div>
                        <div style={{ color: '#52645A', fontSize: '0.85rem' }}>{p.period_start} → {p.period_end}</div>
                        <div style={{ color: '#16a34a', fontWeight: '600', fontSize: '0.9rem' }}>${(p.amount_cents / 100).toFixed(2)}</div>
                        <div style={{ color: '#687A70', fontSize: '0.75rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>{p.stripe_transfer_id || '—'}</div>
                        <div>
                          <span style={{ fontSize: '0.75rem', background: p.status === 'paid' ? '#F0FDF4' : '#FEF9C3', color: p.status === 'paid' ? '#16a34a' : '#854D0E', padding: '0.2rem 0.6rem', borderRadius: '20px', fontWeight: '600' }}>
                            {p.status === 'paid' ? '✓ Paid' : p.status}
                          </span>
                        </div>
                        <div style={{ color: '#687A70', fontSize: '0.85rem' }}>{new Date(p.created_at).toLocaleDateString()}</div>
                      </div>
                    ))}
                  </div>
                  </div>
                )}
              </>
            )}

            {view === 'scraper' && (
              <>
                <div style={{ marginBottom: '1.5rem' }}>
                  <h2 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Recipe Scraper</h2>
                  <p style={{ color: '#52645A', margin: 0, fontSize: '0.9rem' }}>Import recipes from any website into a creator tenant.</p>
                </div>

                <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', border: '1px solid #DDCDBB', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    {(['single', 'blog'] as const).map(m => (
                      <button key={m} onClick={() => { setScraperMode(m); setDiscoveredLinks([]); setSelectedLinks(new Set()); setParsedRecipes([]); setScraperError(null) }}
                        style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: `2px solid ${scraperMode === m ? '#C9471F' : '#DDCDBB'}`, background: scraperMode === m ? '#C9471F' : 'white', color: scraperMode === m ? 'white' : '#52645A', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                        {m === 'single' ? '🔗 Single Recipe' : '📰 Blog / Recipe Index'}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontWeight: '600', color: '#1F3B30', marginBottom: '0.4rem', fontSize: '0.875rem' }}>
                        {scraperMode === 'single' ? 'Recipe URL' : 'Blog or Recipe Index URL'}
                      </label>
                      <input type="url" value={scraperUrl} onChange={e => setScraperUrl(e.target.value)}
                        placeholder={scraperMode === 'single' ? 'https://www.example.com/recipes/chocolate-cake' : 'https://www.example.com/recipes'}
                        style={{ width: '100%', padding: '0.75rem 1rem', fontSize: '0.95rem', borderRadius: '10px', border: '2px solid #DDCDBB', background: '#FAF3E8', color: '#1F3B30', fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box' as const }} />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontWeight: '600', color: '#1F3B30', marginBottom: '0.4rem', fontSize: '0.875rem' }}>Save to tenant</label>
                      <select value={scraperTenantId} onChange={e => setScraperTenantId(e.target.value)}
                        style={{ width: '100%', padding: '0.75rem 1rem', fontSize: '0.95rem', borderRadius: '10px', border: '2px solid #DDCDBB', background: '#FAF3E8', color: '#1F3B30', fontFamily: 'var(--font-sans)', outline: 'none' }}>
                        <option value=''>Select a tenant...</option>
                        {tenants.map(t => (
                          <option key={t.id} value={t.id}>{t.brand_name}</option>
                        ))}
                      </select>
                    </div>

                    {scraperError && (
                      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '0.875rem 1rem' }}>
                        <p style={{ color: '#dc2626', margin: 0, fontSize: '0.9rem' }}>{scraperError}</p>
                      </div>
                    )}

                    {scraperSuccess && (
                      <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '0.875rem 1rem' }}>
                        <p style={{ color: '#16a34a', margin: 0, fontSize: '0.9rem' }}>✅ {scraperSuccess}</p>
                      </div>
                    )}

                    {scraperMode === 'single' && (
                      <button onClick={handleParseSingle} disabled={parsing || !scraperUrl.trim()}
                        style={{ background: '#C9471F', color: 'white', border: 'none', padding: '0.875rem', borderRadius: '10px', fontSize: '1rem', fontWeight: '600', cursor: parsing || !scraperUrl.trim() ? 'not-allowed' : 'pointer', opacity: parsing || !scraperUrl.trim() ? 0.6 : 1, fontFamily: 'var(--font-sans)' }}>
                        {parsing ? 'Parsing...' : '✨ Parse Recipe'}
                      </button>
                    )}

                    {scraperMode === 'blog' && discoveredLinks.length === 0 && (
                      <button onClick={handleDiscover} disabled={discovering || !scraperUrl.trim()}
                        style={{ background: '#C9471F', color: 'white', border: 'none', padding: '0.875rem', borderRadius: '10px', fontSize: '1rem', fontWeight: '600', cursor: discovering || !scraperUrl.trim() ? 'not-allowed' : 'pointer', opacity: discovering || !scraperUrl.trim() ? 0.6 : 1, fontFamily: 'var(--font-sans)' }}>
                        {discovering ? 'Discovering...' : '🔍 Find Recipes'}
                      </button>
                    )}
                  </div>
                </div>

                {discoveredLinks.length > 0 && (
                  <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', border: '1px solid #DDCDBB', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h3 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: 0, fontSize: '1.1rem' }}>Found {discoveredLinks.length} recipe links</h3>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => setSelectedLinks(new Set(discoveredLinks.map(l => l.url)))}
                          style={{ background: 'none', border: '1.5px solid #C9471F', color: '#C9471F', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: '600' }}>Select All</button>
                        <button onClick={() => setSelectedLinks(new Set())}
                          style={{ background: 'none', border: '1.5px solid #DDCDBB', color: '#52645A', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: '600' }}>Clear</button>
                      </div>
                    </div>
                    <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
                      {discoveredLinks.map(link => (
                        <label key={link.url} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: '8px', background: selectedLinks.has(link.url) ? '#FAF3E8' : 'transparent', cursor: 'pointer', border: `1px solid ${selectedLinks.has(link.url) ? '#DDCDBB' : 'transparent'}` }}>
                          <input type='checkbox' checked={selectedLinks.has(link.url)}
                            onChange={e => { const next = new Set(selectedLinks); e.target.checked ? next.add(link.url) : next.delete(link.url); setSelectedLinks(next) }}
                            style={{ marginTop: '2px', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1F3B30' }}>{link.title}</div>
                            <div style={{ fontSize: '0.75rem', color: '#687A70', wordBreak: 'break-all' }}>{link.url}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                    <button onClick={handleParseSelected} disabled={parsing || selectedLinks.size === 0}
                      style={{ background: '#C9471F', color: 'white', border: 'none', padding: '0.875rem 1.5rem', borderRadius: '10px', fontSize: '0.95rem', fontWeight: '600', cursor: parsing || selectedLinks.size === 0 ? 'not-allowed' : 'pointer', opacity: parsing || selectedLinks.size === 0 ? 0.6 : 1, fontFamily: 'var(--font-sans)' }}>
                      {parsing ? 'Parsing...' : `✨ Parse ${selectedLinks.size} Selected Recipe${selectedLinks.size !== 1 ? 's' : ''}`}
                    </button>
                  </div>
                )}

                {parsedRecipes.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h3 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: 0, fontSize: '1.1rem' }}>
                        Preview — {parsedRecipes.filter(r => r.selected).length} of {parsedRecipes.length} selected
                      </h3>
                      <button onClick={handleSave} disabled={saving || parsedRecipes.filter(r => r.selected).length === 0 || !scraperTenantId}
                        style={{ background: '#16a34a', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '10px', fontSize: '0.95rem', fontWeight: '600', cursor: 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'var(--font-sans)' }}>
                        {saving ? 'Saving...' : `💾 Save to ${tenants.find(t => t.id === scraperTenantId)?.brand_name || 'Tenant'}`}
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {parsedRecipes.map((r, i) => (
                        <div key={i} style={{ background: 'white', borderRadius: '16px', border: `1px solid ${r.error ? '#fecaca' : r.selected ? '#DDCDBB' : '#F0EDE8'}`, overflow: 'hidden', opacity: r.selected ? 1 : 0.6 }}>
                          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #F5E8D7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                              <input type='checkbox' checked={r.selected} disabled={!!r.error}
                                onChange={e => { const next = [...parsedRecipes]; next[i] = { ...next[i], selected: e.target.checked }; setParsedRecipes(next) }} />
                              <span style={{ fontWeight: '700', color: '#1F3B30', fontSize: '1rem' }}>{r.recipe?.title || 'Parse failed'}</span>
                            </label>
                            {r.error && <span style={{ fontSize: '0.8rem', color: '#dc2626' }}>⚠️ {r.error}</span>}
                          </div>
                          {r.recipe && (
                            <div style={{ padding: '1rem 1.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.875rem' }}>
                              {r.recipe.image_url && <div style={{ gridColumn: '1 / -1' }}><img src={r.recipe.image_url} alt={r.recipe.title} style={{ height: '120px', borderRadius: '8px', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} /></div>}
                              {r.recipe.description && <div style={{ gridColumn: '1 / -1', color: '#52645A' }}>{r.recipe.description}</div>}
                              <div><span style={{ color: '#687A70' }}>Prep:</span> {r.recipe.prep_time_minutes ? `${r.recipe.prep_time_minutes}m` : '—'}</div>
                              <div><span style={{ color: '#687A70' }}>Cook:</span> {r.recipe.cook_time_minutes ? `${r.recipe.cook_time_minutes}m` : '—'}</div>
                              <div><span style={{ color: '#687A70' }}>Servings:</span> {r.recipe.servings || '—'}</div>
                              <div><span style={{ color: '#687A70' }}>Complexity:</span> {r.recipe.complexity}</div>
                              <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#687A70' }}>Ingredients:</span> {(r.recipe.ingredients || []).length} items</div>
                              {r.recipe.cuisine_tags?.length > 0 && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#687A70' }}>Cuisine:</span> {r.recipe.cuisine_tags.join(', ')}</div>}
                              {r.recipe.dietary_tags?.length > 0 && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#687A70' }}>Dietary:</span> {r.recipe.dietary_tags.join(', ')}</div>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
