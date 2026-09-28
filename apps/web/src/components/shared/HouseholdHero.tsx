import { useEffect, useState } from 'react'
import type { TenantConfig } from '../../lib/tenant'

export default function HouseholdHero({ tenant, recipeCount, hasMenu, instacartLive, onNavigate }: {
  tenant: TenantConfig | null
  recipeCount: number
  hasMenu: boolean
  instacartLive: boolean
  onNavigate: (view: 'menu' | 'shopping' | 'recipes') => void
}) {
  const [slide, setSlide] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setSlide(current => (current + 1) % 2), 7000)
    return () => window.clearInterval(timer)
  }, [paused])

  return <section className={`creator-welcome ${slide === 1 ? 'instacart-announcement' : ''}`} aria-label="Kitchen updates"
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocusCapture={() => setPaused(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false) }}>
    {slide === 0 ? <>
      <div><span className="eyebrow">YOUR WEEK, YOUR WAY</span><h1>Good food starts with a plan.</h1>
        <p>Turn recipes you love into a week that works for your household. Review your menu, make changes, and shop from one list.</p>
        <button onClick={() => onNavigate(hasMenu ? 'menu' : 'recipes')}>{hasMenu ? 'View your meal plan ↗' : 'Explore recipes ↗'}</button></div>
      <div className="preview-card" aria-hidden="true"><span>YOUR KITCHEN</span><strong>{tenant?.brand_name || 'Createry'}</strong><small>{recipeCount} recipes to explore</small></div>
    </> : <>
      <div className="instacart-copy"><span className="launch-label"><span className="launch-dot" /> NEW IN CREATERY</span>
        <h1>{instacartLive ? 'One-Click Instacart Ordering is LIVE!' : 'Your grocery list has a new destination.'}</h1>
        <p>{instacartLive ? 'Build your list from this week’s menu, then open it in Instacart to review products and checkout.' : 'Build a shopping list from your menu. Real Instacart ordering will appear when production access is ready.'}</p>
        <button onClick={() => onNavigate(hasMenu ? 'shopping' : 'recipes')}>{hasMenu ? 'Explore shopping ↗' : 'Explore recipes ↗'}</button></div>
      <div className="instacart-art" aria-hidden="true"><div className="partner-lockup"><img src="/brand/createry-wordmark.svg" alt="" /><span>×</span><div><img src="/instacart-logo.svg" alt="" /><strong>Instacart</strong></div></div>
        <div className="cart-illustration"><span className="cart-illustration-title">YOUR WEEKLY LIST</span><span>✓ Fresh ingredients</span><span>✓ Your favorite recipes</span><span>✓ Ready to review</span><div className="cart-illustration-footer"><span>Createry</span><span>→</span><span>Instacart</span></div></div></div>
    </>}
    <div className="creator-hero-controls" aria-label="Banner controls">{[0, 1].map(index => <button key={index} className={slide === index ? 'active' : ''} onClick={() => setSlide(index)} aria-label={`Show banner ${index + 1}: ${index === 0 ? 'Meal planning' : 'Instacart'}`} aria-current={slide === index ? 'true' : undefined} />)}</div>
  </section>
}
