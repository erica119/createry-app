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

const FALLBACK_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [showRecipeForm, setShowRecipeForm] = useState(false)
  const [recipes, setRecipes] = useState<any[]>([])
  const [generatingMenu, setGeneratingMenu] = useState(false)
  const [currentMenuId, setCurrentMenuId] = useState<string | null>(null)
  const [menuError, setMenuError] = useState<string | null>(null)
  const [view, setView] = useState<'dashboard' | 'menu' | 'shopping'>('dashboard')
  const [selectedRecipe, setSelectedRecipe] = useState<any | null>(null)
  const [showRecipeImport, setShowRecipeImport] = useState(false)
  const [creatorTenantId, setCreatorTenantId] = useState<string | null>(null)
  const [appMode, setAppMode] = useState<'unknown' | 'user' | 'creator'>('unknown')
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

  const checkOnboarding = async () => {
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
      fetchCurrentMenu(data.id)
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
    if (data) setRecipes(data)
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

  const generateMenu = async () => {
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
          body: JSON.stringify({ family_id: familyId, tenant_id: tenant?.id || FALLBACK_TENANT_ID, week_start_date: weekStr }),
        }
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Generation failed')
      setCurrentMenuId(result.menu.id)
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
        <div style={{ padding: '1rem 2rem', borderBottom: '1px solid #E8D5B7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#2C1810' }}>
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
        <div style={{ padding: '1rem 2rem', borderBottom: '1px solid #E8D5B7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#2C1810' }}>
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
      <div className="nav-bar" style={{ padding: '0 2rem', background: '#2C1810', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }} className="nav-links">
          <span style={{ fontFamily: 'var(--font-serif)', color: 'white', fontWeight: '600', fontSize: '1.1rem', padding: '1rem 0' }}>🍽️ {tenant?.brand_name || 'Plate'}</span>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            {navBtn('Recipes', 'dashboard')}
            {navBtn('This Week', 'menu', !!currentMenuId)}
            {navBtn('Shopping', 'shopping', !!currentMenuId)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span className="nav-email" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>{user.email}</span>
          <button onClick={signOut} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '0.4rem 0.9rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Sign out</button>
        </div>
      </div>

      <div className="main-content" style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem' }}>
        {view === 'menu' && currentMenuId && (
          <WeeklyMenuView menuId={currentMenuId} tenantId={tenant?.id || FALLBACK_TENANT_ID} userId={user?.id} onApproved={() => fetchCurrentMenu(familyId!)} onGoShopping={() => setView('shopping')} />
        )}

        {view === 'shopping' && currentMenuId && familyId && (
          <ShoppingList menuId={currentMenuId} familyId={familyId} tenantId={tenant?.id || FALLBACK_TENANT_ID} />
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
                  onClick={generateMenu}
                  disabled={generatingMenu}
                  style={{ background: 'var(--brand-color)', color: 'white', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', fontSize: '0.9rem', cursor: generatingMenu ? 'not-allowed' : 'pointer', fontWeight: '600', opacity: generatingMenu ? 0.7 : 1, whiteSpace: 'nowrap' }}
                >
                  {generatingMenu ? 'Generating...' : currentMenuId ? '✨ Regenerate' : '✨ Generate Menu'}
                </button>
              </div>
            </div>

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
              {recipes.filter(r => r.title.toLowerCase().includes(recipeSearch.toLowerCase()) || r.description?.toLowerCase().includes(recipeSearch.toLowerCase()) || r.cuisine_tags?.some((t: string) => t.toLowerCase().includes(recipeSearch.toLowerCase()))).map(recipe => (
                <div key={recipe.id} onClick={() => setSelectedRecipe(recipe)} style={{ background: 'white', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E8D5B7', boxShadow: '0 1px 4px rgba(44,24,16,0.06)', cursor: 'pointer' }}>
                  {recipe.image_url && (
                    <img src={recipe.image_url} alt={recipe.title} style={{ width: '100%', height: '160px', objectFit: 'cover' }} />
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
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {selectedRecipe && <RecipeModal recipe={selectedRecipe} onClose={() => setSelectedRecipe(null)} />}
    </div>
  )
}
