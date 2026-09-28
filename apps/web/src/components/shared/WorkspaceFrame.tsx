import type { ReactNode } from 'react'
import { useState } from 'react'
import BrandMark from './BrandMark'
import type { TenantConfig } from '../../lib/tenant'
import '../creator/CreatorDashboard.css'

interface NavItem { id: string; label: string; disabled?: boolean }
interface NavGroup { label: string; items: NavItem[] }

export default function WorkspaceFrame({ tenant, role, greeting, groups, active, onNavigate, onSignOut, foot, children }: {
  tenant?: TenantConfig | null
  role: string
  greeting: string
  groups: NavGroup[]
  active: string
  onNavigate: (id: string) => void
  onSignOut: () => void
  foot?: string
  children: ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = (item: NavItem) => {
    if (item.disabled) return
    onNavigate(item.id)
    setMenuOpen(false)
  }
  return <div className="creator-app workspace-frame" style={{ '--creator-accent': tenant?.primary_color || '#F0724A' } as React.CSSProperties}>
    <header className="creator-topbar">
      <div className="creator-nav-bar">
        <span className="creator-topbar-brand"><BrandMark tenant={tenant} onDark /> <small className="workspace-role">{role}</small></span>
        <div className="creator-topbar-right">
          <span className="nav-greeting">Hi, {greeting}!</span>
          <button className="creator-signout" onClick={onSignOut}>Sign out</button>
          <button className="creator-menu-toggle" onClick={() => setMenuOpen(open => !open)} aria-label="Open navigation" aria-expanded={menuOpen}>☰</button>
        </div>
      </div>
      {menuOpen && <nav className="creator-mobile-menu" aria-label={`${role} navigation`}>
        {groups.flatMap(group => group.items).map(item => <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => navigate(item)} disabled={item.disabled}>{item.label}</button>)}
      </nav>}
    </header>
    <div className="creator-layout">
      <nav className="creator-sidebar" aria-label={`${role} navigation`}>
        {groups.map(group => <div key={group.label} className="workspace-nav-group">
          <div className="creator-side-label">{group.label}</div>
          {group.items.map(item => <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => navigate(item)} disabled={item.disabled} aria-current={active === item.id ? 'page' : undefined}>{item.label}</button>)}
        </div>)}
        {foot && <div className="creator-side-foot"><span>{role.toUpperCase()} SPACE</span><strong>{foot}</strong></div>}
      </nav>
      <main className="creator-main">{children}</main>
    </div>
  </div>
}
