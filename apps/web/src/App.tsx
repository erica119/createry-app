import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { resolveTenant, clearCreatorSession } from './lib/tenant'
import type { TenantConfig } from './lib/tenant'
import type { User } from '@supabase/supabase-js'
import OnboardingWizard from './components/onboarding/OnboardingWizard'
import RecipeForm from './components/recipes/RecipeForm'
import WeeklyMenuView from './components/menu/WeeklyMenuView'
import ShoppingList from './components/shopping/ShoppingList'
import LoginScreen from './components/auth/LoginScreen'
import RecipeModal from './components/recipes/RecipeModal'
import RecipeImport from './components/recipes/RecipeImport'
import RoleSelect from './components/auth/RoleSelect'
import CreatorOnboarding from './components/creator/CreatorOnboarding'
import CreatorDashboard from './components/creator/CreatorDashboard'
import ProfileSettings from './components/profile/ProfileSettings'
import OperatorDashboard from './components/creator/OperatorDashboard'

const FALLBACK_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [showRecipeForm, setShowRecipeForm] = useState(false)
  const [recipes, setRecipes] = useState<any[]>([])
  const [generatingMenu, setGeneratingMenu] = useState(false)
  const [currentMenuId, setCurrentMenuId] = useState<string | null>(null)
  const [menuRefreshKey, setMenuRefreshKey] = useState(0)
  const [menuError, setMenuError] = useState<string | null>(null)
  const [view, setView] = useState<'dashboard' | 'menu' | 'shopping' | 'settings'>('dashboard')
  const [selectedRecipe, setSelectedRecipe] = useState<any | null>(null)
  const [showRecipeImport, setShowRecipeImport] = useState(false)
  const [creatorTenantId, setCreatorTenantId] = useState<string | null>(null)
  const [appMode, setAppMode] = useState<'unknown' | 'user' | 'creator'>('unknown')
  const [isOperator, setIsOperator] = useState(false)
  const [tenant, setTenant] = useState<TenantConfig | null>(() => {
    // Synchronously initialize from localStorage so branding shows immediately
    const subdomain = new URLSearchParams(window.location.search).get('creator') 
      || localStorage.getItem('creator_subdomain')
    if (subdomain) {
      // Return a placeholder with just the subdomain — will be replaced by resolveTenant
      return { id: FALLBACK_TENANT_ID, brand_name: '', primary_color: '', tagline: null, logo_url: null, subdomain }
    }
    return null
  })
  const [tenantLoading, setTenantLoading] = useState(true)
  const [recipeSearch, setRecipeSearch] = useState('')
  const [unlockedPackIds, setUnlockedPackIds] = useState<Set<string>>(new Set())
  const [unlockModal, setUnlockModal] = useState<{ pack: { id: string; name: string; price_cents: number }; recipeTitles: string[] } | null>(null)
  const [checkingOut, setCheckingOut] = useState(false)
  const [purchaseSuccess, setPurchaseSuccess] = useState(false)
  const [recipePacks, setRecipePacks] = useState<Record<string, { id: string; name: string; price_cents: number }>>({})
  const [menuHistory, setMenuHistory] = useState<{ id: string; week_start_date: string; status: string }[]>([])

  useEffect(() => {
    const color = tenant?.primary_color || '#C4622D'
    // Parse hex to RGB for derived colors
    const hex = color.replace('#', '')
    const r = parseInt(hex.substring(0,2), 16)
    const g = parseInt(hex.substring(2,4), 16)
    const b = parseInt(hex.substring(4,6), 16)
    // Darken by ~20% for hover states
    const dr = Math.max(0, Math.round(r * 0.8))
    const dg = Math.max(0, Math.round(g * 0.8))
    const db = Math.max(0, Math.round(b * 0.8))
    const darkColor = '#' + [dr,dg,db].map(x => x.toString(16).padStart(2,'0')).join('')
    // Light tint at 20% opacity for backgrounds
    const lightColor = `rgba(${r},${g},${b},0.15)`
    const root = document.documentElement
    root.style.setProperty('--brand-color', color)
    root.style.setProperty('--color-primary', color)
    root.style.setProperty('--color-primary-dark', darkColor)
    root.style.setProperty('--color-primary-light', lightColor)
  }, [tenant])

  useEffect(() => {
    resolveTenant().then(t => { console.log('tenant resolved:', t); setTenant(t); setTenantLoading(false) })
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
    checkOnboarding()
  }, [user])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('purchase') === 'success') {
      setPurchaseSuccess(true)
      window.history.replaceState({}, '', '/')
      if (user && tenant) {
        fetchUnlockedPacks(user.id, tenant.id)
        fetchRecipes(tenant.id)
      }
      setTimeout(() => setPurchaseSuccess(false), 6000)
    }
  }, [user, tenant])

  const checkOnboarding = async () => {
    // Check if platform admin first
    const { data: adminRow } = await supabase
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', user!.id)
      .maybeSingle()
    if (adminRow) {
      setIsOperator(true)
      return
    }

    // Check if creator first
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, tenant_id')
      .eq('user_id', user!.id)
      .maybeSingle()

    if (profile?.role === 'creator' && profile?.tenant_id) {
      setCreatorTenantId(profile.tenant_id)
      setAppMode('creator')
      return
    }

    // Check for pending tenant from creator URL
    const pendingTenantId = localStorage.getItem('pending_tenant_id')
    if (pendingTenantId) {
      localStorage.removeItem('pending_tenant_id')
      // Look up the tenant and set it
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('id, brand_name, primary_color, tagline, logo_url, subdomain')
        .eq('id', pendingTenantId)
        .maybeSingle()
      if (tenantData) {
        setTenant({
          id: tenantData.id,
          brand_name: tenantData.brand_name || 'Plate',
          primary_color: tenantData.primary_color || '#C4622D',
          tagline: tenantData.tagline,
          logo_url: tenantData.logo_url,
          subdomain: tenantData.subdomain,
        })
      }
    }

    // Check family profile for regular user
    const { data } = await supabase
      .from('family_profiles')
      .select('id, tenant_id')
      .eq('user_id', user!.id)
      .maybeSingle()
    if (data?.id) {
      setFamilyId(data.id)
      setAppMode('user')
      // Use the tenant from their family profile, not the URL
      if (data.tenant_id) {
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('id, brand_name, primary_color, tagline, logo_url, subdomain')
          .eq('id', data.tenant_id)
          .maybeSingle()
        if (tenantData) {
          const resolvedTenant = {
            id: tenantData.id,
            brand_name: tenantData.brand_name || 'Plate',
            primary_color: tenantData.primary_color || '#C4622D',
            tagline: tenantData.tagline,
            logo_url: tenantData.logo_url,
            subdomain: tenantData.subdomain,
          }
          setTenant(resolvedTenant)
          // Store in localStorage so it persists through refreshes
          localStorage.setItem('creator_subdomain', tenantData.subdomain)
        }
      }
      fetchRecipes(data.tenant_id)
      fetchUnlockedPacks(user!.id, data.tenant_id)
      fetchCurrentMenu(data.id)
      fetchMenuHistory(data.id)
    }
    // If no family profile, stay 'unknown' so role select shows
    // unless we came from a creator URL right now - then go straight to user onboarding
    else if (new URLSearchParams(window.location.search).get('creator') || pendingTenantId) {
      setAppMode('user')
    }
    // Brand new user with no context - show role select
  }

  const fetchRecipes = async (overrideTenantId?: string) => {
    const tid = overrideTenantId || tenant?.id || FALLBACK_TENANT_ID
    const { data } = await supabase
      .from('recipes')
      .select('*')
      .eq('tenant_id', tid)
      .order('created_at', { ascending: false })
    if (data) {
      setRecipes(data)
      const packIds = [...new Set(data.map((r: any) => r.recipe_pack_id).filter(Boolean))]
      if (packIds.length > 0) {
        const { data: packs } = await supabase.from('recipe_packs').select('id, name, price_cents').in('id', packIds)
        if (packs) {
          const map: Record<string, { id: string; name: string; price_cents: number }> = {}
          packs.forEach((p: any) => { map[p.id] = p })
          setRecipePacks(map)
        }
      }
    }
  }

  const handleCheckout = async (packId: string) => {
    setCheckingOut(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ recipe_pack_id: packId, tenant_id: tenant?.id || FALLBACK_TENANT_ID, user_id: user?.id, success_url: `${window.location.origin}/?purchase=success`, cancel_url: `${window.location.origin}/` }),
      })
      const { url, error } = await res.json()
      if (error) throw new Error(error)
      if (!url) throw new Error('No checkout URL returned')
      window.location.href = url
    } catch (err) {
      console.error('Checkout error:', err)
      alert('Something went wrong. Please try again.')
    } finally {
      setCheckingOut(false)
    }
  }

  const fetchUnlockedPacks = async (uid: string, tid: string) => {
    const { data } = await supabase
      .from('user_purchases')
      .select('recipe_pack_id')
      .eq('user_id', uid)
      .eq('tenant_id', tid)
    if (data) {
      setUnlockedPackIds(new Set(data.map((p: any) => p.recipe_pack_id).filter(Boolean)))
    }
  }

  const fetchCurrentMenu = async (fid: string) => {
    const { data } = await supabase
      .from('weekly_menus')
      .select('id')
      .eq('family_id', fid)
      .order('week_start_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.id) setCurrentMenuId(data.id)
  }

  const fetchMenuHistory = async (fid: string) => {
    const { data } = await supabase
      .from('weekly_menus')
      .select('id, week_start_date, status')
      .eq('family_id', fid)
      .order('week_start_date', { ascending: false })
      .limit(12)
    if (data) setMenuHistory(data)
  }

  const generateMenu = async (feedback?: string) => {
    if (!familyId) return
    setGeneratingMenu(true)
    setMenuError(null)
    try {
      const weekStartDate = new Date()
      const day = weekStartDate.getDay()
      weekStartDate.setDate(weekStartDate.getDate() - day)
      const weekStr = weekStartDate.toISOString().split('T')[0]
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-weekly-menu`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ family_id: familyId, tenant_id: tenant?.id || FALLBACK_TENANT_ID, week_start_date: weekStr, feedback: feedback || undefined }),
        }
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Generation failed')
      setCurrentMenuId(result.menu.id)
      setMenuRefreshKey(k => k + 1)
      setView('menu')
    } catch (err: any) {
      setMenuError(err.message)
    } finally {
      setGeneratingMenu(false)
    }
  }

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    clearCreatorSession()
    setFamilyId(null)
    setRecipes([])
    setCurrentMenuId(null)
    setCreatorTenantId(null)
    setAppMode('unknown')
    setTenant(null)
    setIsOperator(false)
  }

  if (isOperator) {
    return <OperatorDashboard user={user!} onSignOut={signOut} />
  }

  if (appMode === 'creator' && creatorTenantId) {
    return <CreatorDashboard user={user!} tenantId={creatorTenantId} onSignOut={signOut} />
  }

  if (loading || tenantLoading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#FDF6EE' }}><p>Loading...</p></div>

  // Ensure we have real tenant data before rendering anything
  // Use tenant if it has a real ID (not the fallback)
  const activeTenant = (tenant?.id && tenant.id !== FALLBACK_TENANT_ID) ? tenant : null


  if (!user) {
    return <LoginScreen onGoogleSignIn={signInWithGoogle} onSignIn={setUser} tenant={tenant} />
  }

  if (appMode === 'unknown') {
    return <RoleSelect
      user={user}
      onSelectUser={() => setAppMode('user')}
      onSelectCreator={() => setAppMode('creator')}
    />
  }

  if (appMode === 'creator' && !creatorTenantId) {
    return <CreatorOnboarding
      user={user}
      onComplete={(tenantId) => {
        setCreatorTenantId(tenantId)
      }}
    />
  }

  if (!familyId) {
    return (
      <div style={{ fontFamily: 'var(--font-sans)' }}>
        <div style={{ padding: '1rem 2rem', borderBottom: '1px solid #E8D5B7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: tenant?.primary_color || '#2C1810' }}>
          <span style={{ fontFamily: 'var(--font-serif)', color: 'white', fontWeight: '600', fontSize: '1.1rem' }}>🍽️ {tenant?.brand_name || 'Plate'}</span>
          <button onClick={signOut} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '0.4rem 0.9rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Sign out</button>
        </div>
        <OnboardingWizard
          user={user}
          tenantId={tenant?.id || FALLBACK_TENANT_ID}
          onComplete={() => checkOnboarding()}
          brandName={activeTenant?.brand_name}
          brandColor={activeTenant?.primary_color}
        />
      </div>
    )
  }

  if (showRecipeImport) {
    return (
      <div style={{ fontFamily: 'var(--font-sans)' }}>
        <RecipeImport
          user={user}
          tenantId={tenant?.id || FALLBACK_TENANT_ID}
          onComplete={() => { setShowRecipeImport(false); fetchRecipes() }}
          onCancel={() => setShowRecipeImport(false)}
        />
      </div>
    )
  }

  if (showRecipeForm) {
    return (
      <div style={{ fontFamily: 'var(--font-sans)' }}>
        <div style={{ padding: '1rem 2rem', borderBottom: '1px solid #E8D5B7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: tenant?.primary_color || '#2C1810' }}>
          <span style={{ fontFamily: 'var(--font-serif)', color: 'white', fontWeight: '600', fontSize: '1.1rem' }}>🍽️ {tenant?.brand_name || 'Plate'}</span>
          <button onClick={signOut} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '0.4rem 0.9rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Sign out</button>
        </div>
        <RecipeForm
          user={user}
          tenantId={tenant?.id || FALLBACK_TENANT_ID}
          onSaved={() => { setShowRecipeForm(false); fetchRecipes() }}
          onCancel={() => setShowRecipeForm(false)}
        />
      </div>
    )
  }

  const navBtn = (label: string, viewName: typeof view, enabled = true) => (
    <button
      onClick={() => enabled && setView(viewName)}
      style={{
        background: 'none', border: 'none',
        cursor: enabled ? 'pointer' : 'not-allowed',
        fontWeight: view === viewName ? '700' : '400',
        color: view === viewName ? 'white' : enabled ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)',
        fontSize: '0.95rem', padding: '0.25rem 0',
        fontFamily: 'var(--font-sans)',
        borderBottom: view === viewName ? '2px solid var(--brand-color)' : '2px solid transparent',
        transition: 'all 0.15s ease',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ fontFamily: 'var(--font-sans)', minHeight: '100vh', background: '#FDF6EE' }}>
      <div className="nav-bar" style={{ padding: '0 2rem', background: tenant?.primary_color || '#2C1810', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }} className="nav-links">
          <span style={{ fontFamily: 'var(--font-serif)', color: 'white', fontWeight: '600', fontSize: '1.1rem', padding: '1rem 0' }}>🍽️ {tenant?.brand_name || 'Plate'}</span>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            {navBtn('Recipes', 'dashboard')}
            {navBtn('This Week', 'menu', !!currentMenuId)}
            {navBtn('Shopping', 'shopping', !!currentMenuId)}
            {navBtn('Settings', 'settings')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span className="nav-email" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>{user.email}</span>
          <button onClick={signOut} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '0.4rem 0.9rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Sign out</button>
        </div>
      </div>

      <div className="main-content" style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem' }}>
        {view === 'menu' && generatingMenu && (
          <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✨</div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.4rem', color: '#2C1810', marginBottom: '0.5rem' }}>Generating your menu...</div>
            <div style={{ color: '#6B5C52', fontSize: '0.95rem' }}>This usually takes 15-30 seconds. Hang tight!</div>
          </div>
        )}
        {view === 'menu' && currentMenuId && !generatingMenu && (
          <WeeklyMenuView key={`${currentMenuId}-${menuRefreshKey}`}
            menuId={currentMenuId}
            tenantId={tenant?.id || FALLBACK_TENANT_ID}
            userId={user?.id}
            familyId={familyId}
            onApproved={() => fetchCurrentMenu(familyId!)}
            onGoShopping={() => setView('shopping')}
            onWeekChange={(newMenuId, _weekDate) => {
              if (newMenuId) {
                setCurrentMenuId(newMenuId)
              } else {
                setCurrentMenuId(null)
                setView('dashboard')
              }
            }}
            onRegenerate={(feedback) => generateMenu(feedback)}
          />
        )}

        {view === 'shopping' && currentMenuId && familyId && (
          <ShoppingList menuId={currentMenuId} familyId={familyId} tenantId={tenant?.id || FALLBACK_TENANT_ID} />
        )}

        {view === 'settings' && familyId && (
          <ProfileSettings user={user!} familyId={familyId} tenantId={tenant?.id || FALLBACK_TENANT_ID} />
        )}

        {view === 'dashboard' && (
          <>
            <div className="dashboard-header" style={{ marginBottom: '2rem', padding: '1.5rem 2rem', background: '#F5EFE6', borderRadius: '16px', border: '1px solid #E8D5B7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-serif)', margin: '0 0 0.25rem', color: '#2C1810', fontSize: '1.4rem' }}>This Week's Menu</h2>
                <p style={{ color: '#6B5C52', margin: 0, fontSize: '0.9rem' }}>
                  {currentMenuId ? "Your meal plan is ready." : "Generate a personalized weekly meal plan."}
                </p>
                {menuError && <p style={{ color: '#dc2626', margin: '0.5rem 0 0', fontSize: '0.85rem' }}>{menuError}</p>}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexShrink: 0 }}>
                {currentMenuId && (
                  <>
                    <button onClick={() => setView('menu')} style={{ background: 'white', color: 'var(--brand-color)', border: '1.5px solid var(--brand-color)', padding: '0.6rem 1.1rem', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '500' }}>
                      View Menu
                    </button>
                    <button onClick={() => setView('shopping')} style={{ background: 'white', color: '#16a34a', border: '1.5px solid #16a34a', padding: '0.6rem 1.1rem', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '500' }}>
                      Shopping List
                    </button>
                  </>
                )}
                <button
                  onClick={() => generateMenu()}
                  disabled={generatingMenu}
                  style={{ background: 'var(--brand-color)', color: 'white', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', fontSize: '0.9rem', cursor: generatingMenu ? 'not-allowed' : 'pointer', fontWeight: '600', opacity: generatingMenu ? 0.7 : 1, whiteSpace: 'nowrap' }}
                >
                  {generatingMenu ? 'Generating...' : currentMenuId ? '✨ Regenerate' : '✨ Generate Menu'}
                </button>
              </div>
            </div>

            {menuHistory.length > 1 && (
              <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #E8D5B7', marginBottom: '1.5rem', overflow: 'hidden' }}>
                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #F5EFE6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: 0, fontSize: '1.1rem' }}>Menu History</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {menuHistory.map((m, i) => {
                    const weekDate = new Date(m.week_start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
                    const isCurrent = m.id === currentMenuId
                    return (
                      <div key={m.id} onClick={() => { setCurrentMenuId(m.id); setView('menu') }}
                        style={{ padding: '0.875rem 1.5rem', borderBottom: i < menuHistory.length - 1 ? '1px solid #F5EFE6' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: isCurrent ? '#FDF6EE' : 'white' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ fontSize: '1rem' }}>📅</span>
                          <span style={{ fontWeight: isCurrent ? '700' : '500', color: '#2C1810', fontSize: '0.9rem' }}>Week of {weekDate}</span>
                          {isCurrent && <span style={{ fontSize: '0.7rem', background: 'var(--color-primary-light)', color: 'var(--color-primary)', padding: '0.15rem 0.5rem', borderRadius: '10px', fontWeight: '600' }}>Current</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ fontSize: '0.8rem', color: m.status === 'approved' ? '#16a34a' : '#9B8B82', fontWeight: '500' }}>
                            {m.status === 'approved' ? '✓ Approved' : 'Draft'}
                          </span>
                          <span style={{ color: '#C8BAB2', fontSize: '0.85rem' }}>→</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {purchaseSuccess && (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>🎉</span>
                <div>
                  <p style={{ margin: '0 0 0.2rem', color: '#16a34a', fontWeight: '700', fontSize: '0.95rem' }}>Purchase successful!</p>
                  <p style={{ margin: 0, color: '#16a34a', fontSize: '0.85rem' }}>Your recipes have been unlocked and are ready to use.</p>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontFamily: 'var(--font-serif)', margin: 0, color: '#2C1810', fontSize: '1.5rem' }}>My Recipes <span style={{ color: '#9B8B82', fontSize: '1rem', fontFamily: 'var(--font-sans)', fontWeight: '400' }}>({recipes.length})</span></h2>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={() => setShowRecipeImport(true)} style={{ background: 'white', color: 'var(--brand-color)', border: '1.5px solid var(--brand-color)', padding: '0.6rem 1.1rem', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '500' }}>⬆ Import CSV</button>
                <button onClick={() => setShowRecipeForm(true)} style={{ background: 'var(--brand-color)', color: 'white', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '600' }}>+ Add Recipe</button>
              </div>
            </div>
            <input
              type="text"
              placeholder="🔍 Search recipes..."
              value={recipeSearch}
              onChange={e => setRecipeSearch(e.target.value)}
              style={{ width: '100%', padding: '0.75rem 1rem', fontSize: '0.95rem', borderRadius: '10px', border: '2px solid #E8D5B7', background: '#FDF6EE', color: '#2C1810', fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box', marginBottom: '1rem' }}
            />
            <div className="recipe-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', maxHeight: '60vh', overflowY: 'auto', paddingRight: '0.25rem' }}>
              {recipes.filter(r => r.title.toLowerCase().includes(recipeSearch.toLowerCase()) || r.description?.toLowerCase().includes(recipeSearch.toLowerCase()) || r.cuisine_tags?.some((t: string) => t.toLowerCase().includes(recipeSearch.toLowerCase()))).sort((a, b) => (a.is_premium === b.is_premium ? 0 : a.is_premium ? 1 : -1)).map(recipe => {
                const isLocked = recipe.is_premium && recipe.recipe_pack_id && !unlockedPackIds.has(recipe.recipe_pack_id)
                const pack = recipe.recipe_pack_id ? recipePacks[recipe.recipe_pack_id] : null
                return (
                <div key={recipe.id} onClick={() => !isLocked && setSelectedRecipe(recipe)} style={{ background: 'white', borderRadius: '12px', overflow: 'hidden', border: isLocked ? '1px dashed #D4B0B0' : '1px solid #E8D5B7', boxShadow: '0 1px 4px rgba(44,24,16,0.06)', cursor: isLocked ? 'default' : 'pointer', opacity: isLocked ? 0.85 : 1, position: 'relative' }}>
                  {recipe.image_url && (
                    <img src={recipe.image_url} alt={recipe.title} style={{ width: '100%', height: '160px', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  )}
                  <div style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', color: '#2C1810', fontWeight: '600', lineHeight: 1.3 }}>{recipe.title}</h3>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0, marginLeft: '0.5rem' }}>
                      <span style={{ fontSize: '0.7rem', background: '#F5EFE6', color: 'var(--brand-color)', padding: '0.2rem 0.5rem', borderRadius: '20px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{recipe.complexity}</span>
                      <button onClick={async () => { if (confirm('Delete this recipe?')) { await supabase.from('recipes').delete().eq('id', recipe.id); fetchRecipes() } }} style={{ background: 'none', border: 'none', color: '#C8BAB2', cursor: 'pointer', fontSize: '1rem', padding: '0.1rem', lineHeight: 1 }} title="Delete recipe">✕</button>
                    </div>
                  </div>
                  {recipe.description && <p style={{ color: '#6B5C52', margin: '0 0 0.75rem', fontSize: '0.875rem', lineHeight: 1.5 }}>{recipe.description}</p>}
                  <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', color: '#9B8B82', flexWrap: 'wrap' }}>
                    {recipe.prep_time_minutes && <span>⏱ {recipe.prep_time_minutes}m prep</span>}
                    {recipe.cook_time_minutes && <span>🔥 {recipe.cook_time_minutes}m cook</span>}
                    {recipe.servings && <span>🍽 {recipe.servings} servings</span>}
                  </div>
                  {recipe.cuisine_tags?.length > 0 && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {recipe.cuisine_tags.slice(0, 2).map((tag: string) => (
                        <span key={tag} style={{ fontSize: '0.7rem', background: '#FDF6EE', color: 'var(--brand-color)', padding: '0.2rem 0.6rem', borderRadius: '20px', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.04em' }}>{tag}</span>
                      ))}
                    </div>
                  )}
                  {isLocked && pack && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #F0E0E0' }}>
                      <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: '#9B8B82' }}>🔒 {pack.name}</p>
                      <button
                        onClick={e => { e.stopPropagation(); setUnlockModal({ pack, recipeTitles: recipes.filter((r: any) => r.recipe_pack_id === pack.id).map((r: any) => r.title) }) }}
                        style={{ width: '100%', background: 'var(--color-primary)', color: 'white', border: 'none', padding: '0.4rem 0.75rem', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer' }}
                      >
                        Unlock {pack.name}
                      </button>
                    </div>
                  )}
                  </div>
                </div>
                )
              })}
            </div>
          </>
        )}
      </div>
      {selectedRecipe && <RecipeModal recipe={selectedRecipe} onClose={() => setSelectedRecipe(null)} />}

      {unlockModal && (
        <div onClick={() => setUnlockModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(44,24,16,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '20px', maxWidth: '420px', width: '100%', overflow: 'hidden', boxShadow: '0 20px 60px rgba(44,24,16,0.25)' }}>
            <div style={{ background: 'var(--color-primary)', padding: '1.5rem 2rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</div>
              <h2 style={{ fontFamily: 'var(--font-serif)', color: 'white', margin: '0 0 0.25rem', fontSize: '1.35rem' }}>{unlockModal.pack.name}</h2>
              <p style={{ color: 'rgba(255,255,255,0.75)', margin: 0, fontSize: '0.875rem' }}>Unlock this recipe pack to access all premium recipes</p>
            </div>
            <div style={{ padding: '1.5rem 2rem' }}>
              <div style={{ background: '#FDF6EE', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
                <p style={{ margin: '0 0 0.25rem', fontSize: '0.8rem', color: '#9B8B82', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Includes</p>
                <ul style={{ margin: 0, padding: '0 0 0 1.1rem' }}>
                  {unlockModal.recipeTitles.map((t, i) => (
                    <li key={i} style={{ color: '#2C1810', fontSize: '0.875rem', marginBottom: '0.3rem', lineHeight: 1.4 }}>{t}</li>
                  ))}
                </ul>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <span style={{ color: '#6B5C52', fontSize: '0.9rem' }}>One-time purchase</span>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', color: '#2C1810', fontWeight: '700' }}>${(unlockModal.pack.price_cents / 100).toFixed(2)}</span>
              </div>
              <button
                onClick={() => handleCheckout(unlockModal.pack.id)}
                disabled={checkingOut}
                style={{ width: '100%', background: 'var(--color-primary)', color: 'white', border: 'none', padding: '0.875rem', borderRadius: '10px', fontSize: '1rem', fontWeight: '700', cursor: checkingOut ? 'not-allowed' : 'pointer', opacity: checkingOut ? 0.7 : 1 }}
              >
                {checkingOut ? 'Redirecting...' : `Unlock ${unlockModal.pack.name}`}
              </button>
              <button onClick={() => setUnlockModal(null)} style={{ width: '100%', background: 'none', border: 'none', color: '#9B8B82', padding: '0.75rem', fontSize: '0.875rem', cursor: 'pointer', marginTop: '0.5rem' }}>
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

