import './App.css'
import BrandMark from './components/shared/BrandMark'
import WorkspaceFrame from './components/shared/WorkspaceFrame'
import HouseholdHero from './components/shared/HouseholdHero'
import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { applyRecipeOverrides, getRecipeOverrides } from './lib/recipeOverrides'
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
import SupportModal from './components/shared/SupportModal'
import SubscriptionPlanSelector from './components/shared/SubscriptionPlanSelector'

const FALLBACK_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

// Sunday-anchored week start (matches how weekly_menus.week_start_date is stored),
// formatted as YYYY-MM-DD.
function getWeekStartString(from: Date = new Date()): string {
  const d = new Date(from)
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().split('T')[0]
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [showRecipeForm, setShowRecipeForm] = useState(false)
  const [recipes, setRecipes] = useState<any[]>([])
  const [generatingMenu, setGeneratingMenu] = useState(false)
  const [currentMenuId, setCurrentMenuId] = useState<string | null>(null)
  const [menuRefreshKey, setMenuRefreshKey] = useState(0)
  const [nextWeekMenuId, setNextWeekMenuId] = useState<string | null>(null)
  const [nextWeekStart, setNextWeekStart] = useState<string | null>(null)
  const [menuError, setMenuError] = useState<string | null>(null)
  const [view, setView] = useState<'dashboard' | 'menu' | 'shopping' | 'settings' | 'recipes'>('dashboard')
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
  const [familyTenantId, setFamilyTenantId] = useState<string | null>(null)
  const [recipeSearch, setRecipeSearch] = useState('')
  const [unlockedPackIds, setUnlockedPackIds] = useState<Set<string>>(new Set())
  const [unlockModal, setUnlockModal] = useState<{ pack: { id: string; name: string; price_cents: number }; recipeTitles: string[] } | null>(null)
  const [showSupport, setShowSupport] = useState(false)
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [checkingOut, setCheckingOut] = useState(false)
  const [purchaseSuccess, setPurchaseSuccess] = useState(false)
  const [userSubStatus, setUserSubStatus] = useState<string | null>(null)
  const [recipePacks, setRecipePacks] = useState<Record<string, { id: string; name: string; price_cents: number }>>({})
  // const [menuHistory, setMenuHistory] = useState<{ id: string; week_start_date: string; status: string }[]>([])
  const [menuData, setMenuData] = useState<any>(null)
  const [currentMenuStatus, setCurrentMenuStatus] = useState<string | null>(null)
  const [shoppingListBuilt, setShoppingListBuilt] = useState(false)
  const [instacartLive, setInstacartLive] = useState(false)

  useEffect(() => {
    const color = tenant?.primary_color || '#C9471F'
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
      setAccessToken(session?.access_token ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setAccessToken(session?.access_token ?? null)
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
        fetchFavorites()
      }
      setTimeout(() => setPurchaseSuccess(false), 6000)
    }
    if (params.get('user_subscription') === 'success') {
      window.history.replaceState({}, '', '/')
      checkOnboarding()
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
          brand_name: tenantData.brand_name || 'Createry',
          primary_color: tenantData.primary_color || '#C9471F',
          tagline: tenantData.tagline,
          logo_url: tenantData.logo_url,
          subdomain: tenantData.subdomain,
        })
      }
    }

    // Handle return from Stripe creator subscription checkout
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('subscription') === 'success') {
      window.history.replaceState({}, '', '/')
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('tenant_id')
        .eq('user_id', user!.id)
        .eq('role', 'creator')
        .maybeSingle()
      if (profile?.tenant_id) {
        setCreatorTenantId(profile.tenant_id)
        setAppMode('creator')
        return
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
      setFamilyTenantId(data.tenant_id)

      // Check user subscription status
      const { data: subData } = await supabase
        .from('user_subscriptions')
        .select('status')
        .eq('user_id', user!.id)
        .maybeSingle()

      const validStatuses = ['trialing', 'active', 'grandfathered']
      if (!subData || !validStatuses.includes(subData.status)) {
        // No valid subscription — send to plan selection
        setUserSubStatus(subData?.status || 'none')
        setAppMode('user')
        setView('dashboard')
        return
      }

      setUserSubStatus(subData.status)
      setAppMode('user')
      setView('dashboard')
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
            brand_name: tenantData.brand_name || 'Createry',
            primary_color: tenantData.primary_color || '#C9471F',
            tagline: tenantData.tagline,
            logo_url: tenantData.logo_url,
            subdomain: tenantData.subdomain,
          }
          setTenant(resolvedTenant)
          // Store in localStorage so it persists through refreshes
          localStorage.setItem('creator_subdomain', tenantData.subdomain)
        }
      }
      fetchRecipes(data.tenant_id, data.id)
      fetchUnlockedPacks(user!.id, data.tenant_id)
      fetchCurrentMenu(data.id)
      // fetchMenuHistory(data.id)
    }
    // If no family profile, stay 'unknown' so role select shows
    // unless we came from a creator URL right now - then go straight to user onboarding
    else if (new URLSearchParams(window.location.search).get('creator') || pendingTenantId) {
      setAppMode('user')
      setView('dashboard')
    }
    // Brand new user with no context - show role select
  }

  const fetchFavorites = async () => {
    if (!user) return
    const { data } = await supabase.from('recipe_favorites').select('recipe_id').eq('user_id', user.id)
    if (data) setFavorites(new Set(data.map((f: any) => f.recipe_id)))
  }

  const fetchRecipes = async (overrideTenantId?: string, overrideFamilyId?: string) => {
    const tid = overrideTenantId || tenant?.id || FALLBACK_TENANT_ID
    const { data } = await supabase
      .from('recipes')
      .select('*')
      .eq('tenant_id', tid)
      .order('created_at', { ascending: false })
    if (data) {
      try {
        const householdId = overrideFamilyId || familyId
        setRecipes(householdId ? applyRecipeOverrides(data, await getRecipeOverrides(householdId, data.map(r => r.id))) : data)
      } catch (error) {
        console.error('Could not load household recipe edits:', error)
        setRecipes(data)
      }
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
    const currentWeekStart = getWeekStartString()
    const { data } = await supabase
      .from('weekly_menus')
      .select('id, menu_data, status')
      .eq('family_id', fid)
      .eq('week_start_date', currentWeekStart)
      .maybeSingle()
    if (data?.id) {
      setCurrentMenuId(data.id)
      setMenuData(data.menu_data || null)
      setCurrentMenuStatus(data.status || null)
      const { data: shoppingData } = await supabase
        .from('grocery_lists')
        .select('id, status, instacart_cart_url')
        .eq('weekly_menu_id', data.id)
        .limit(1)
        .maybeSingle()
      setShoppingListBuilt(!!shoppingData?.id)
      try {
        const host = new URL(shoppingData?.instacart_cart_url || '').hostname
        setInstacartLive(host === 'instacart.com' || host.endsWith('.instacart.com'))
      } catch { setInstacartLive(false) }

      // Current week is handled — see whether next week has already been planned ahead.
      const nextWeekDate = new Date(currentWeekStart)
      nextWeekDate.setDate(nextWeekDate.getDate() + 7)
      const nextWeekStr = nextWeekDate.toISOString().split('T')[0]
      setNextWeekStart(nextWeekStr)
      const { data: nextWeekData } = await supabase
        .from('weekly_menus')
        .select('id')
        .eq('family_id', fid)
        .eq('week_start_date', nextWeekStr)
        .maybeSingle()
      setNextWeekMenuId(nextWeekData?.id || null)
    } else {
      // No menu exists for the current week yet. Rather than waiting on a manual
      // click, generate it now that the user has actually logged in this week —
      // this only spends AI compute on accounts that are actively using the app.
      setCurrentMenuId(null)
      setMenuData(null)
      setCurrentMenuStatus(null)
      setShoppingListBuilt(false)
      setInstacartLive(false)
      setNextWeekMenuId(null)
      setNextWeekStart(null)
      generateMenu(undefined, undefined, true)
    }
  }



  const generateMenu = async (feedback?: string, weekStartDateOverride?: string, skipNavigate?: boolean) => {
    if (!familyId) return
    setGeneratingMenu(true)
    setMenuError(null)
    try {
      const weekStr = weekStartDateOverride || getWeekStartString()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Please sign in again to generate your menu.')
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-weekly-menu`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ family_id: familyId, tenant_id: tenant?.id || FALLBACK_TENANT_ID, week_start_date: weekStr, feedback: feedback || undefined }),
        }
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Generation failed')
      // Only reflect the freshly generated menu as "current" if it's for the
      // current week — a "plan ahead" generation for next week shouldn't
      // hijack what the dashboard is showing right now.
      if (!weekStartDateOverride || weekStartDateOverride === getWeekStartString()) {
        setCurrentMenuId(result.menu.id)
      } else {
        setNextWeekMenuId(result.menu.id)
      }
      setMenuRefreshKey(k => k + 1)
      if (!skipNavigate) setView('menu')
    } catch (err: any) {
      setMenuError(err.message)
    } finally {
      setGeneratingMenu(false)
    }
  }

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } }
    })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    clearCreatorSession()
    setFamilyId(null)
    setRecipes([])
    setCurrentMenuId(null)
    setMenuData(null)
    setCurrentMenuStatus(null)
    setShoppingListBuilt(false)
    setCreatorTenantId(null)
    setAppMode('unknown')
    setTenant(null)
    setIsOperator(false)
  }

  if (isOperator) {
    return <OperatorDashboard user={user!} onSignOut={signOut} accessToken={accessToken} />
  }

  if (appMode === 'creator' && creatorTenantId) {
    return <CreatorDashboard user={user!} tenantId={creatorTenantId} onSignOut={signOut} />
  }

  if (loading || tenantLoading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#FAF3E8' }}><p>Loading...</p></div>

  // Ensure we have real tenant data before rendering anything
  // Use tenant if it has a real ID (not the fallback)
  const activeTenant = (tenant?.id && tenant.id !== FALLBACK_TENANT_ID) ? tenant : null

  const path = window.location.pathname

  const legalFooter = (
    <footer style={{ padding: '0.6rem 2rem', background: 'rgba(244,235,225,0.95)', borderTop: '1px solid #DDCDBB', display: 'flex', justifyContent: 'center', gap: '1.5rem', alignItems: 'center' }}>
      <a href="/terms" style={{ fontSize: '0.75rem', color: '#C9471F', textDecoration: 'none', fontWeight: '500' }}>Terms</a>
      <a href="/privacy" style={{ fontSize: '0.75rem', color: '#C9471F', textDecoration: 'none', fontWeight: '500' }}>Privacy</a>
      <a href="/cookies" style={{ fontSize: '0.75rem', color: '#C9471F', textDecoration: 'none', fontWeight: '500' }}>Cookies</a>
    </footer>
  )

  if (path === '/terms') {
    return (
      <div style={{ fontFamily: 'var(--font-sans)', minHeight: '100vh', background: '#FAF3E8', display: 'flex', flexDirection: 'column' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '3rem 2rem', flex: 1 }}>
          <a href="/" style={{ fontSize: '0.85rem', color: '#C9471F', textDecoration: 'none', fontWeight: '600', display: 'block', marginBottom: '2rem' }}>← Back</a>
          <h1 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', marginBottom: '0.5rem' }}>Terms of Service</h1>
          <p style={{ color: '#687A70', fontSize: '0.85rem', marginBottom: '2rem' }}>Effective July 1, 2025</p>
          <p style={{ color: '#52645A', lineHeight: 1.7, marginBottom: '1rem' }}>For the full Terms of Service, please visit:</p>
          <a href="https://www.notion.so/Terms-of-Service-33cf2e6d5092819ab105d956ab1c5d62" target="_blank" rel="noopener noreferrer" style={{ color: '#C9471F', fontWeight: '600', fontSize: '1rem' }}>View Terms of Service →</a>
        </div>
        {legalFooter}
      </div>
    )
  }

  if (path === '/privacy') {
    return (
      <div style={{ fontFamily: 'var(--font-sans)', minHeight: '100vh', background: '#FAF3E8', display: 'flex', flexDirection: 'column' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '3rem 2rem', flex: 1 }}>
          <a href="/" style={{ fontSize: '0.85rem', color: '#C9471F', textDecoration: 'none', fontWeight: '600', display: 'block', marginBottom: '2rem' }}>← Back</a>
          <h1 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', marginBottom: '0.5rem' }}>Privacy Policy</h1>
          <p style={{ color: '#687A70', fontSize: '0.85rem', marginBottom: '2rem' }}>Effective July 1, 2025</p>
          <p style={{ color: '#52645A', lineHeight: 1.7, marginBottom: '1rem' }}>For the full Privacy Policy, please visit:</p>
          <a href="https://www.notion.so/Privacy-Policy-33cf2e6d509281b282d0c0bdb872eff8" target="_blank" rel="noopener noreferrer" style={{ color: '#C9471F', fontWeight: '600', fontSize: '1rem' }}>View Privacy Policy →</a>
        </div>
        {legalFooter}
      </div>
    )
  }

  if (path === '/cookies') {
    return (
      <div style={{ fontFamily: 'var(--font-sans)', minHeight: '100vh', background: '#FAF3E8', display: 'flex', flexDirection: 'column' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '3rem 2rem', flex: 1 }}>
          <a href="/" style={{ fontSize: '0.85rem', color: '#C9471F', textDecoration: 'none', fontWeight: '600', display: 'block', marginBottom: '2rem' }}>← Back</a>
          <h1 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', marginBottom: '0.5rem' }}>Cookies Policy</h1>
          <p style={{ color: '#687A70', fontSize: '0.85rem', marginBottom: '2rem' }}>Effective July 1, 2025</p>
          <p style={{ color: '#52645A', lineHeight: 1.7, marginBottom: '1rem' }}>For the full Cookies Policy, please visit:</p>
          <a href="https://www.notion.so/Cookies-Policy-33cf2e6d5092819083bfe0df26e03c71" target="_blank" rel="noopener noreferrer" style={{ color: '#C9471F', fontWeight: '600', fontSize: '1rem' }}>View Cookies Policy →</a>
        </div>
        {legalFooter}
      </div>
    )
  }

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
    />
  }

  if (!familyId) {
    return (
      <div style={{ fontFamily: 'var(--font-sans)' }}>
        <div style={{ padding: '1rem 2rem', borderBottom: '1px solid #DDCDBB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: tenant?.id !== FALLBACK_TENANT_ID ? (tenant?.primary_color || '#C9471F') : '#1F3B30' }}>
          <span style={{ fontFamily: 'var(--font-display)', color: 'white', fontWeight: '600', fontSize: '1.1rem' }}><BrandMark tenant={tenant} onDark /></span>
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

  // User has completed onboarding but has no valid subscription
  const validStatuses = ['trialing', 'active', 'grandfathered']
  if (familyId && userSubStatus !== null && !validStatuses.includes(userSubStatus)) {
    return (
      <div style={{ fontFamily: 'var(--font-sans)' }}>
        <div style={{ padding: '1rem 2rem', borderBottom: '1px solid #DDCDBB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: tenant?.id !== FALLBACK_TENANT_ID ? (tenant?.primary_color || '#C9471F') : '#1F3B30' }}>
          <span style={{ fontFamily: 'var(--font-display)', color: 'white', fontWeight: '600', fontSize: '1.1rem' }}><BrandMark tenant={tenant} onDark /></span>
          <button onClick={signOut} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '0.4rem 0.9rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Sign out</button>
        </div>
        <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ width: '100%', maxWidth: '480px' }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🥗</div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', color: 'var(--espresso)', margin: '0 0 0.5rem' }}>
                {userSubStatus === 'past_due' ? 'Payment issue' : 'Choose your plan'}
              </h1>
              <p style={{ color: 'var(--text-light)', margin: 0, fontSize: '0.95rem' }}>
                {userSubStatus === 'past_due'
                  ? 'There was a problem with your payment. Please update your billing info to continue.'
                  : 'Start with a free 7-day trial. Cancel anytime.'}
              </p>
            </div>
            <div className="card" style={{ padding: '2rem' }}>
              <SubscriptionPlanSelector
                userId={user!.id}
                tenantId={tenant?.id || FALLBACK_TENANT_ID}
                tenantName={tenant?.brand_name || 'Createry'}
                onSuccess={() => checkOnboarding()}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (showRecipeImport) {
    return (
      <div style={{ fontFamily: 'var(--font-sans)' }}>
        <RecipeImport
          user={user}
          tenantId={familyTenantId || tenant?.id || FALLBACK_TENANT_ID}
          source="user"
          onComplete={() => { setShowRecipeImport(false); fetchRecipes() }}
          onCancel={() => setShowRecipeImport(false)}
        />
      </div>
    )
  }

  if (showRecipeForm) {
    return (
      <div style={{ fontFamily: 'var(--font-sans)' }}>
        <div style={{ padding: '1rem 2rem', borderBottom: '1px solid #DDCDBB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: tenant?.id !== FALLBACK_TENANT_ID ? (tenant?.primary_color || '#C9471F') : '#1F3B30' }}>
          <span style={{ fontFamily: 'var(--font-display)', color: 'white', fontWeight: '600', fontSize: '1.1rem' }}><BrandMark tenant={tenant} onDark /></span>
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

  const toggleFavorite = async (e: React.MouseEvent, recipeId: string) => {
    e.stopPropagation()
    if (!user || !tenant) return
    if (favorites.has(recipeId)) {
      await supabase.from('recipe_favorites').delete().eq('user_id', user.id).eq('recipe_id', recipeId)
      setFavorites(prev => { const next = new Set(prev); next.delete(recipeId); return next })
    } else {
      const { error } = await supabase.from('recipe_favorites').insert({ user_id: user.id, tenant_id: tenant.id, recipe_id: recipeId })
      if (error) { console.error('Favorite insert error:', error); return }
      setFavorites(prev => new Set(prev).add(recipeId))
    }
  }

  const brandColor = tenant?.id !== FALLBACK_TENANT_ID ? (tenant?.primary_color || '#C9471F') : '#1F3B30'

  return (
    <div style={{ fontFamily: 'var(--font-sans)', minHeight: '100vh', background: '#FAF3E8' }}>
      <WorkspaceFrame
        tenant={activeTenant}
        role="Household"
        greeting={activeTenant?.brand_name || 'Createry'}
        groups={[{ label: 'YOUR KITCHEN', items: [
          { id: 'dashboard', label: 'Overview' },
          { id: 'recipes', label: 'My Recipes' },
          { id: 'menu', label: 'My Meal Plan', disabled: !currentMenuId },
          { id: 'shopping', label: 'Shopping', disabled: !currentMenuId },
        ] }, { label: 'ACCOUNT', items: [{ id: 'settings', label: 'Settings' }] }]}
        active={view}
        onNavigate={id => setView(id as typeof view)}
        onSignOut={signOut}
        foot={activeTenant?.brand_name || 'Createry'}
      >
        {view === 'menu' && generatingMenu && (
          <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✨</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: '#1F3B30', marginBottom: '0.5rem' }}>Generating your menu...</div>
            <div style={{ color: '#52645A', fontSize: '0.95rem' }}>This usually takes 15-30 seconds. Hang tight!</div>
          </div>
        )}
        {view === 'menu' && currentMenuId && !generatingMenu && (
          <div>
          <p style={{ fontSize: '0.78rem', color: '#687A70', margin: '0 0 0.75rem', textAlign: 'center' }}>AI-generated plan based on your preferences</p>
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
          </div>
        )}

        {view === 'shopping' && currentMenuId && familyId && (
          <ShoppingList menuId={currentMenuId} familyId={familyId} tenantId={tenant?.id || FALLBACK_TENANT_ID} onShoppingComplete={() => setShoppingListBuilt(true)} />
        )}

        {view === 'settings' && familyId && (
          <ProfileSettings user={user!} familyId={familyId} tenantId={tenant?.id || FALLBACK_TENANT_ID} />
        )}

        {view === 'recipes' && (
          <>
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
              <h2 style={{ fontFamily: 'var(--font-display)', margin: 0, color: '#1F3B30', fontSize: '1.5rem' }}>My Recipes <span style={{ color: '#687A70', fontSize: '1rem', fontFamily: 'var(--font-sans)', fontWeight: '400' }}>({recipes.length})</span></h2>
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
              style={{ width: '100%', padding: '0.75rem 1rem', fontSize: '0.95rem', borderRadius: '10px', border: '2px solid #DDCDBB', background: '#FAF3E8', color: '#1F3B30', fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box', marginBottom: '1rem' }}
            />
            <div className="recipe-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {recipes.filter(r => r.title.toLowerCase().includes(recipeSearch.toLowerCase()) || r.description?.toLowerCase().includes(recipeSearch.toLowerCase()) || r.cuisine_tags?.some((t: string) => t.toLowerCase().includes(recipeSearch.toLowerCase()))).sort((a, b) => (a.is_premium === b.is_premium ? 0 : a.is_premium ? 1 : -1)).map(recipe => {
                const isLocked = recipe.is_premium && recipe.recipe_pack_id && !unlockedPackIds.has(recipe.recipe_pack_id)
                const pack = recipe.recipe_pack_id ? recipePacks[recipe.recipe_pack_id] : null
                return (
                <div key={recipe.id} onClick={() => !isLocked && setSelectedRecipe(recipe)} style={{ background: 'white', borderRadius: '12px', overflow: 'hidden', border: isLocked ? '1px dashed #D4B0B0' : '1px solid #DDCDBB', boxShadow: '0 1px 4px rgba(44,24,16,0.06)', cursor: isLocked ? 'default' : 'pointer', opacity: isLocked ? 0.85 : 1, position: 'relative' }}>
                  {recipe.image_url && (
                    <img src={recipe.image_url} alt={recipe.title} style={{ width: '100%', height: '160px', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  )}
                  <div style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', color: '#1F3B30', fontWeight: '600', lineHeight: 1.3 }}>{recipe.title}</h3>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0, marginLeft: '0.5rem' }}>
                      {recipe.source === 'user' && recipe.created_by === user?.id && <button onClick={async e => { e.stopPropagation(); if (confirm('Delete your personal recipe?')) { const { data, error } = await supabase.from('recipes').delete().eq('id', recipe.id).select('id').single(); if (error || !data) alert('Could not delete this recipe. Please try again.'); else fetchRecipes() } }} style={{ background: 'none', border: 'none', color: '#8A9A8F', cursor: 'pointer', fontSize: '1rem', padding: '0.1rem', lineHeight: 1 }} title="Delete personal recipe">✕</button>}
                      <button onClick={e => toggleFavorite(e, recipe.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '0.1rem', lineHeight: 1 }} title={favorites.has(recipe.id) ? 'Remove from favorites' : 'Add to favorites'}>{favorites.has(recipe.id) ? '❤️' : '🤍'}</button>
                    </div>
                  </div>
                  {recipe.description && <p style={{ color: '#52645A', margin: '0 0 0.75rem', fontSize: '0.875rem', lineHeight: 1.5 }}>{recipe.description}</p>}
                  <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', color: '#687A70', flexWrap: 'wrap' }}>
                    {recipe.prep_time_minutes && <span>⏱ {recipe.prep_time_minutes}m prep</span>}
                    {recipe.cook_time_minutes && <span>🔥 {recipe.cook_time_minutes}m cook</span>}
                    {recipe.servings && <span>🍽 {recipe.servings} servings</span>}
                  </div>
                  {recipe.cuisine_tags?.length > 0 && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {recipe.cuisine_tags.slice(0, 2).map((tag: string) => (
                        <span key={tag} style={{ fontSize: '0.7rem', background: '#FAF3E8', color: 'var(--brand-color)', padding: '0.2rem 0.6rem', borderRadius: '20px', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.04em' }}>{tag}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.6rem' }}>
                    {tenant?.brand_name && (
                      <p style={{ margin: 0, fontSize: '0.72rem', color: '#687A70', fontStyle: 'italic' }}>
                        {tenant.brand_name}'s Recipe
                      </p>
                    )}
                    {recipe.complexity && (
                      <span style={{ fontSize: '0.65rem', background: '#F5E8D7', color: 'var(--brand-color)', padding: '0.2rem 0.5rem', borderRadius: '20px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{recipe.complexity}</span>
                    )}
                  </div>
                  {isLocked && pack && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #F0E0E0' }}>
                      <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: '#687A70' }}>🔒 {pack.name}</p>
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

        {view === 'dashboard' && (
          <>
            <HouseholdHero tenant={activeTenant} recipeCount={recipes.length} hasMenu={!!currentMenuId} instacartLive={instacartLive} onNavigate={setView} />
            {/* Context-aware status card */}
            {!currentMenuId ? (
              <div style={{ background: '#F5E8D7', borderRadius: '16px', border: '1px solid #DDCDBB', padding: '2rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👩‍🍳</div>
                  <h2 style={{ fontFamily: 'var(--font-display)', margin: '0 0 0.25rem', color: '#1F3B30', fontSize: '1.4rem' }}>{generatingMenu ? "Building this week's menu…" : "Let's get started"}</h2>
                  <p style={{ color: '#52645A', margin: 0, fontSize: '0.9rem' }}>{generatingMenu ? 'Personalizing your meal plan from your recipes. This only takes a moment.' : 'Generate a personalized weekly meal plan from your recipes.'}</p>
                  {menuError && <p style={{ color: '#dc2626', margin: '0.5rem 0 0', fontSize: '0.85rem' }}>{menuError}</p>}
                </div>
                {!generatingMenu && (
                  <button onClick={() => generateMenu()} style={{ background: 'var(--brand-color)', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '10px', fontSize: '0.95rem', fontWeight: '600', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {menuError ? '↺ Try Again' : '✨ Generate Menu'}
                  </button>
                )}
              </div>
            ) : currentMenuStatus !== 'approved' ? (
              <div style={{ background: '#FFF9F0', borderRadius: '16px', border: '1.5px solid var(--brand-color)', padding: '2rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
                  <h2 style={{ fontFamily: 'var(--font-display)', margin: '0 0 0.25rem', color: '#1F3B30', fontSize: '1.4rem' }}>Your menu is ready to review</h2>
                  <p style={{ color: '#52645A', margin: 0, fontSize: '0.9rem' }}>Take a look at this week's meal plan and approve it when ready.</p>
                </div>
                <button onClick={() => setView('menu')} style={{ background: 'var(--brand-color)', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '10px', fontSize: '0.95rem', fontWeight: '600', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  View Menu →
                </button>
              </div>
            ) : !shoppingListBuilt ? (
              <div style={{ background: '#F0FDF4', borderRadius: '16px', border: '1.5px solid #16a34a', padding: '2rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🛒</div>
                  <h2 style={{ fontFamily: 'var(--font-display)', margin: '0 0 0.25rem', color: '#1F3B30', fontSize: '1.4rem' }}>Time to shop</h2>
                  <p style={{ color: '#52645A', margin: 0, fontSize: '0.9rem' }}>Your menu is approved — build your shopping list and you're all set.</p>
                </div>
                <button onClick={() => setView('shopping')} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '10px', fontSize: '0.95rem', fontWeight: '600', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  Shopping List →
                </button>
              </div>
            ) : (
              <div style={{ background: '#F0FDF4', borderRadius: '16px', border: '1px solid #86efac', padding: '2rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '2rem' }}>✅</span>
                  <div>
                    <h2 style={{ fontFamily: 'var(--font-display)', margin: '0 0 0.25rem', color: '#1F3B30', fontSize: '1.4rem' }}>You're all set this week</h2>
                    <p style={{ color: '#52645A', margin: 0, fontSize: '0.9rem' }}>Menu approved and shopping list ready. Enjoy your meals!</p>
                  </div>
                </div>
                {nextWeekMenuId ? (
                  <button onClick={() => { setCurrentMenuId(nextWeekMenuId); setMenuRefreshKey(k => k + 1); setView('menu') }} style={{ background: 'white', color: 'var(--brand-color)', border: '1.5px solid var(--brand-color)', padding: '0.6rem 1.25rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    Next week is planned →
                  </button>
                ) : (
                  <button onClick={() => nextWeekStart && generateMenu(undefined, nextWeekStart, true)} disabled={generatingMenu || !nextWeekStart} style={{ background: 'white', color: 'var(--brand-color)', border: '1.5px solid var(--brand-color)', padding: '0.6rem 1.25rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: '600', cursor: generatingMenu ? 'not-allowed' : 'pointer', opacity: generatingMenu ? 0.7 : 1, flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {generatingMenu ? 'Planning...' : '📅 Plan Next Week'}
                  </button>
                )}
              </div>
            )}

            {/* Tonight's Recipe Hero Card */}
            {menuData?.days && currentMenuStatus === 'approved' && (() => {
              const now = new Date()
              const today = now.getDay()
              const hour = now.getHours()
              const todayMeals = (menuData.days as Record<string, any>)[String(today)]
              if (!todayMeals) return null
              // Pick next upcoming meal based on time of day
              let mealOrder: string[]
              if (hour < 12) mealOrder = ['breakfast', 'lunch', 'dinner']
              else if (hour < 17) mealOrder = ['lunch', 'dinner', 'breakfast']
              else mealOrder = ['dinner', 'lunch', 'breakfast']
              const nextMeal = mealOrder.find(m => todayMeals[m])
              if (!nextMeal) return null
              const tonightRecipeId = todayMeals[nextMeal]
              const tonightRecipe = tonightRecipeId ? recipes.find((r: any) => r.id === tonightRecipeId) : null
              if (!tonightRecipe) return null
              let mealLabel = 'Tonight'
              if (nextMeal === 'breakfast') mealLabel = 'This Morning'
              else if (nextMeal === 'lunch') mealLabel = 'Lunchtime'
              return (
                <div
                  onClick={() => setSelectedRecipe(tonightRecipe)}
                  style={{ background: 'white', borderRadius: '16px', border: '1px solid #DDCDBB', overflow: 'hidden', cursor: 'pointer', boxShadow: '0 2px 12px rgba(44,24,16,0.10)', marginBottom: '2rem' }}
                >
                  {tonightRecipe.image_url && (
                    <img
                      src={tonightRecipe.image_url}
                      alt={tonightRecipe.title}
                      style={{ width: '100%', height: '200px', objectFit: 'cover' }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  )}
                  <div style={{ padding: '1.25rem 1.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '0.2rem 0.75rem', borderRadius: '20px', background: brandColor, color: 'white', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{mealLabel}</span>
                      {tonightRecipe.cuisine_tags && (
                        <span style={{ fontSize: '0.75rem', color: '#687A70', fontWeight: '500' }}>{Array.isArray(tonightRecipe.cuisine_tags) ? tonightRecipe.cuisine_tags[0] : tonightRecipe.cuisine_tags}</span>
                      )}
                    </div>
                    <h3 style={{ fontFamily: 'var(--font-display)', margin: '0 0 0.5rem', color: '#1F3B30', fontSize: '1.3rem', lineHeight: 1.2 }}>{tonightRecipe.title}</h3>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      {tonightRecipe.cook_time_minutes && (
                        <span style={{ fontSize: '0.8rem', color: '#52645A' }}>🕐 {tonightRecipe.cook_time_minutes} min</span>
                      )}
                      {tonightRecipe.servings && (
                        <span style={{ fontSize: '0.8rem', color: '#52645A' }}>👥 {tonightRecipe.servings} servings</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* This Week's Recipes */}
            {menuData?.days && (() => {
              const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
              const DAY_COLORS = ['#7C3AED', '#2563EB', '#0891B2', '#16A34A', '#D97706', '#DC2626', '#DB2777']
              const MEAL_LABELS: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }
              const slots: { day: number; meal: string; recipeId: string }[] = []
              Object.entries(menuData.days as Record<string, any>).forEach(([dayKey, meals]: [string, any]) => {
                const day = parseInt(dayKey)
                ;['breakfast', 'lunch', 'dinner'].forEach(meal => {
                  if (meals[meal]) slots.push({ day, meal, recipeId: meals[meal] })
                })
              })
              if (slots.length === 0) return null
              return (
                <>
                  <h2 style={{ fontFamily: 'var(--font-display)', margin: '0 0 1rem', color: '#1F3B30', fontSize: '1.4rem' }}>This Week's Recipes</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
                    {slots.map(({ day, meal, recipeId }) => {
                      const recipe = recipes.find((r: any) => r.id === recipeId)
                      if (!recipe) return null
                      return (
                        <div key={`${day}-${meal}`} onClick={() => setSelectedRecipe(recipe)} style={{ background: 'white', borderRadius: '12px', border: '1px solid #DDCDBB', overflow: 'hidden', cursor: 'pointer', boxShadow: '0 1px 4px rgba(44,24,16,0.06)' }}>
                          {recipe.image_url && (
                            <img src={recipe.image_url} alt={recipe.title} style={{ width: '100%', height: '130px', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          )}
                          <div style={{ padding: '0.875rem 1rem' }}>
                            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '0.2rem 0.6rem', borderRadius: '20px', background: DAY_COLORS[day], color: 'white', letterSpacing: '0.04em' }}>{DAY_LABELS[day]}</span>
                              <span style={{ fontSize: '0.7rem', color: '#687A70', fontWeight: '500' }}>{MEAL_LABELS[meal]}</span>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: '600', color: '#1F3B30', lineHeight: 1.3 }}>{recipe.title}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )
            })()}

          </>
        )}
      </WorkspaceFrame>
      {selectedRecipe && <RecipeModal recipe={selectedRecipe} familyId={familyId} onSaved={() => fetchRecipes()} onClose={() => setSelectedRecipe(null)} />}

      <footer style={{ padding: '0.6rem 2rem', background: 'var(--color-primary-light)', borderTop: `1px solid ${tenant?.primary_color || '#C9471F'}22`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--color-primary)', fontWeight: '500' }}>Powered by <strong>Createry</strong></span>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <a href="/terms" style={{ fontSize: '0.75rem', color: 'var(--color-primary)', textDecoration: 'none', fontWeight: '500' }}>Terms</a>
          <a href="/privacy" style={{ fontSize: '0.75rem', color: 'var(--color-primary)', textDecoration: 'none', fontWeight: '500' }}>Privacy</a>
          <a href="/cookies" style={{ fontSize: '0.75rem', color: 'var(--color-primary)', textDecoration: 'none', fontWeight: '500' }}>Cookies</a>
          <button onClick={() => setShowSupport(true)} style={{ background: 'none', border: 'none', fontSize: '0.75rem', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: '500', padding: 0, fontFamily: 'var(--font-sans)' }}>Help &amp; Support</button>
        </div>
      </footer>

      {showSupport && <SupportModal primaryColor={tenant?.primary_color} onClose={() => setShowSupport(false)} />}
      {unlockModal && (
        <div onClick={() => setUnlockModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(44,24,16,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '20px', maxWidth: '420px', width: '100%', overflow: 'hidden', boxShadow: '0 20px 60px rgba(44,24,16,0.25)' }}>
            <div style={{ background: 'var(--color-primary)', padding: '1.5rem 2rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</div>
              <h2 style={{ fontFamily: 'var(--font-display)', color: 'white', margin: '0 0 0.25rem', fontSize: '1.35rem' }}>{unlockModal.pack.name}</h2>
              <p style={{ color: 'rgba(255,255,255,0.75)', margin: 0, fontSize: '0.875rem' }}>Unlock this recipe pack to access all premium recipes</p>
              <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0.5rem 0 0', fontSize: '0.75rem', fontStyle: 'italic' }}>Recipes provided by Creator. Createry AI may include these recipes in your generated meal plans based on your preferences.</p>
            </div>
            <div style={{ padding: '1.5rem 2rem' }}>
              <div style={{ background: '#FAF3E8', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
                <p style={{ margin: '0 0 0.25rem', fontSize: '0.8rem', color: '#687A70', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Includes</p>
                <ul style={{ margin: 0, padding: '0 0 0 1.1rem' }}>
                  {unlockModal.recipeTitles.map((t, i) => (
                    <li key={i} style={{ color: '#1F3B30', fontSize: '0.875rem', marginBottom: '0.3rem', lineHeight: 1.4 }}>{t}</li>
                  ))}
                </ul>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <span style={{ color: '#52645A', fontSize: '0.9rem' }}>One-time purchase</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: '#1F3B30', fontWeight: '700' }}>${(unlockModal.pack.price_cents / 100).toFixed(2)}</span>
              </div>
              <button
                onClick={() => handleCheckout(unlockModal.pack.id)}
                disabled={checkingOut}
                style={{ width: '100%', background: 'var(--color-primary)', color: 'white', border: 'none', padding: '0.875rem', borderRadius: '10px', fontSize: '1rem', fontWeight: '700', cursor: checkingOut ? 'not-allowed' : 'pointer', opacity: checkingOut ? 0.7 : 1 }}
              >
                {checkingOut ? 'Redirecting...' : `Unlock ${unlockModal.pack.name}`}
              </button>
              <button onClick={() => setUnlockModal(null)} style={{ width: '100%', background: 'none', border: 'none', color: '#687A70', padding: '0.75rem', fontSize: '0.875rem', cursor: 'pointer', marginTop: '0.5rem' }}>
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Tab Navigation */}
      <nav className="bottom-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'white',
        borderTop: '1px solid #DDCDBB',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        padding: '0.5rem 0',
        paddingBottom: 'env(safe-area-inset-bottom)',
        zIndex: 100,
        boxShadow: '0 -2px 12px rgba(44,24,16,0.08)',
      }}>
        {[
          { v: 'dashboard' as const, label: 'Home', icon: '🏠', enabled: true },
          { v: 'menu' as const, label: 'Menu', icon: '📅', enabled: !!currentMenuId },
          { v: 'recipes' as const, label: 'Recipes', icon: '📖', enabled: true },
          { v: 'shopping' as const, label: 'Shop', icon: '🛒', enabled: !!currentMenuId },
          { v: 'settings' as const, label: 'Profile', icon: '👤', enabled: true },
        ].map(({ v, label, icon, enabled }) => (
          <button
            key={v}
            onClick={() => { if (enabled) setView(v) }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: '0.2rem', background: 'none', border: 'none',
              padding: '0.4rem 0.75rem',
              cursor: enabled ? 'pointer' : 'not-allowed',
              opacity: enabled ? 1 : 0.35,
              minWidth: '60px',
            }}
          >
            <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{icon}</span>
            <span style={{
              fontSize: '0.65rem', fontWeight: view === v ? '700' : '500',
              color: view === v ? brandColor : '#687A70',
              fontFamily: 'var(--font-sans)',
              letterSpacing: '0.02em',
            }}>{label}</span>
            {view === v && (
              <span style={{
                position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom) + 0px)',
                width: '4px', height: '4px', borderRadius: '50%',
                background: brandColor,
              }} />
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}
