import { useState } from 'react'
import './CreatorEnablementHub.css'

type Destination = 'branding' | 'recipes' | 'mealplan' | 'analytics'

interface Props {
  creatorId: string
  brandName: string
  subdomain: string
  hasLogo: boolean
  recipeCount: number
  hasMealPlan: boolean
  onNavigate: (destination: Destination) => void
  onSupport: () => void
}

const TRAINING = [
  {
    title: 'Set up a home that looks like you',
    duration: '2 min read',
    content: 'Your brand name, logo, color, and tagline shape the first impression. Preview the app as a new visitor, then check how your branding looks on a phone. Keep the promise clear: your recipes become a usable weekly plan.',
    action: 'Open branding', destination: 'branding' as const,
  },
  {
    title: 'Build a recipe library people can plan from',
    duration: '3 min read',
    content: 'Start with meals your audience already asks for. Give each recipe a clear title, photo, meal type, servings, and usable ingredient quantities. Try planning with your own recipes; unclear ingredient lines can make a shopping list harder to use.',
    action: 'Review recipes', destination: 'recipes' as const,
  },
  {
    title: 'Walk through the household experience',
    duration: '3 min read',
    content: 'Set household preferences, generate a week, swap a meal, finish the plan, and review the shopping list. Households can adapt your recipes privately; your updates to the original recipes flow to your audience. Instacart ordering is coming October 2026.',
    action: 'Try meal planning', destination: 'mealplan' as const,
  },
  {
    title: 'Understand what you can measure',
    duration: '2 min read',
    content: 'Use Analytics to learn which recipes and app activity resonate. Look for questions and friction in replies, not just link clicks. Audience subscription commissions are part of the creator offer, but those commissions are not yet displayed in the Earnings dashboard.',
    action: 'Open analytics', destination: 'analytics' as const,
  },
]

export default function CreatorEnablementHub({ creatorId, brandName, subdomain, hasLogo, recipeCount, hasMealPlan, onNavigate, onSupport }: Props) {
  const storageKey = `createry:launch-steps:${creatorId}`
  const [completed, setCompleted] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]') }
    catch { return [] }
  })
  const [openLesson, setOpenLesson] = useState<number | null>(0)
  const [copied, setCopied] = useState<string | null>(null)
  const appUrl = subdomain ? `https://createry.app/?creator=${encodeURIComponent(subdomain)}` : ''
  const steps = [
    { id: 'brand', title: 'Make the app yours', detail: 'Add your logo and check your branding.', done: hasLogo, action: 'Open branding', destination: 'branding' as const },
    { id: 'recipes', title: 'Give people meals to start with', detail: `${recipeCount} recipe${recipeCount === 1 ? '' : 's'} in your library. Start with familiar favorites and check their ingredients.`, done: recipeCount >= 5, action: 'Open recipes', destination: 'recipes' as const },
    { id: 'plan', title: 'Try the full weekly flow', detail: 'Generate a plan, swap a meal, and review its shopping list.', done: hasMealPlan, action: 'Try the flow', destination: 'mealplan' as const },
    { id: 'preview', title: 'Review your signup experience', detail: 'Open your link on a phone and check the first impression.', done: completed.includes('preview'), action: 'Open your link', destination: null },
    { id: 'share', title: 'Make your first invitation', detail: 'Explain why you built this and invite feedback from your audience.', done: completed.includes('share'), action: 'Use sharing tools', destination: null },
  ]
  const doneCount = steps.filter(step => step.done).length
  const captions = [
    { key: 'instagram', platform: 'Instagram', text: `Your saved recipes deserve a place in your real week. With ${brandName}, you can plan meals around your household, swap meals, and take a shopping list with you.\n\nExplore my meal planning app: ${appUrl}\n\nAudience subscription: $9/month.\n\n#mealplanning #familymeals #weeknightdinners` },
    { key: 'tiktok', platform: 'TikTok', text: `What if dinner ideas became an actual plan? My recipes are now in ${brandName}: weekly meal plans, easy swaps, and a shopping list for the week. Explore it at ${appUrl}. Audience subscription: $9/month.` },
    { key: 'facebook', platform: 'Facebook', text: `I wanted my recipes to be useful beyond a saved post. ${brandName} helps you turn them into a weekly meal plan that fits your household, then builds the shopping list.\n\nTake a look: ${appUrl}\n\nAudience subscription: $9/month. I'd love to hear what you'd cook first.` },
  ]

  const markDone = (id: string) => {
    const next = completed.includes(id) ? completed.filter(value => value !== id) : [...completed, id]
    setCompleted(next)
    localStorage.setItem(storageKey, JSON.stringify(next))
  }
  const copy = async (key: string, value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(key); window.setTimeout(() => setCopied(null), 2000) }
    catch { setCopied('error') }
  }

  return <div className="creator-enable">
    <header className="creator-enable-hero">
      <span className="creator-enable-eyebrow">CREATOR LAUNCH HUB</span>
      <h2>Build your app. Help people use it. Grow from there.</h2>
      <p>Follow a practical path from setup to your first invitation. Come back for the walkthroughs and sharing tools whenever you need them.</p>
      <div className="creator-enable-progress" aria-label={`${doneCount} of ${steps.length} launch steps complete`}>
        <span>{doneCount} of {steps.length} steps complete</span>
        <div><span style={{ width: `${doneCount / steps.length * 100}%` }} /></div>
      </div>
    </header>

    <section className="creator-enable-section" aria-labelledby="launch-heading">
      <div className="creator-enable-section-head"><span>01 / GET READY</span><h3 id="launch-heading">Your launch checklist</h3><p>The first three steps reflect your app. Mark the last two when you’ve done them.</p></div>
      <div className="creator-enable-checklist">
        {steps.map((step, index) => <article key={step.id} className={`creator-enable-step ${step.done ? 'is-done' : ''}`}>
          <span className="creator-enable-step-number">{step.done ? '✓' : String(index + 1).padStart(2, '0')}</span>
          <div><h4>{step.title}</h4><p>{step.detail}</p></div>
          {step.destination ? <button className="btn-secondary" onClick={() => onNavigate(step.destination!)}>{step.action} →</button>
            : step.id === 'preview' ? <div className="creator-enable-step-actions">{appUrl && <a className="btn-secondary" href={appUrl} target="_blank" rel="noopener noreferrer">Open link ↗</a>}<button className="btn-secondary" onClick={() => markDone(step.id)}>{step.done ? 'Mark incomplete' : 'Mark done'}</button></div>
            : <button className="btn-secondary" onClick={() => markDone(step.id)}>{step.done ? 'Mark incomplete' : 'Mark done'}</button>}
        </article>)}
      </div>
    </section>

    <section className="creator-enable-section" aria-labelledby="learn-heading">
      <div className="creator-enable-section-head"><span>02 / LEARN THE PRODUCT</span><h3 id="learn-heading">Short creator walkthroughs</h3><p>Know what your audience will experience before you ask them to join.</p></div>
      <div className="creator-enable-lessons">{TRAINING.map((lesson, index) => <article key={lesson.title}>
        <button className="creator-enable-lesson-toggle" aria-expanded={openLesson === index} onClick={() => setOpenLesson(openLesson === index ? null : index)}>
          <span className="creator-enable-lesson-index">0{index + 1}</span><strong>{lesson.title}</strong><small>{lesson.duration}</small><span aria-hidden="true">{openLesson === index ? '−' : '+'}</span>
        </button>
        {openLesson === index && <div className="creator-enable-lesson-body"><p>{lesson.content}</p><button className="btn-secondary" onClick={() => onNavigate(lesson.destination)}>{lesson.action} →</button></div>}
      </article>)}</div>
    </section>

    <section className="creator-enable-section" aria-labelledby="share-heading">
      <div className="creator-enable-section-head"><span>03 / INVITE YOUR AUDIENCE</span><h3 id="share-heading">Your link and launch tools</h3><p>Show the app in use. Let people see a recipe become a plan and a shopping list before you ask them to subscribe.</p></div>
      <div className="creator-enable-link"><div><span>YOUR SIGNUP LINK</span><code>{appUrl || 'Set up your creator link to start sharing'}</code></div><button className="btn-primary" disabled={!appUrl} onClick={() => copy('link', appUrl)}>{copied === 'link' ? 'Copied!' : 'Copy link'}</button></div>
      <div className="creator-enable-playbook">
        <h4>A simple first-week plan</h4>
        <ol><li><strong>Show the problem:</strong> saved recipes still leave people deciding what to cook.</li><li><strong>Demo the solution:</strong> plan two days, swap a meal, and show the shopping list.</li><li><strong>Invite a small group:</strong> ask what felt helpful or confusing, then use that feedback in your next post.</li></ol>
      </div>
      <h4 className="creator-enable-subhead">Caption starters</h4><p className="creator-enable-caption-note">Edit these in your own voice. They are drafts, not scheduled posts.</p>
      <div className="creator-enable-captions">{captions.map(caption => <article key={caption.key}><div><h5>{caption.platform}</h5><button className="btn-secondary" onClick={() => copy(caption.key, caption.text)}>{copied === caption.key ? 'Copied!' : 'Copy caption'}</button></div><p>{caption.text}</p></article>)}</div>
      {copied === 'error' && <p role="alert">Could not copy automatically. Select and copy the text instead.</p>}
    </section>

    <div className="creator-enable-help"><div><strong>Need help getting ready?</strong><p>Tell us where you’re stuck or what your audience is asking for.</p></div><button className="btn-secondary" onClick={onSupport}>Help &amp; support →</button></div>
  </div>
}
