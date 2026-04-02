import type { User } from '@supabase/supabase-js'

interface Props {
  user: User
  onSelectUser: () => void
  onSelectCreator: () => void
}

export default function RoleSelect({ user, onSelectUser, onSelectCreator }: Props) {
  return (
    <div style={{ minHeight: '100vh', background: '#FDF6EE', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: 'var(--font-sans)' }}>
      <div style={{ width: '100%', maxWidth: '560px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🍽️</div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', color: '#2C1810', margin: '0 0 0.5rem' }}>
            Welcome, {user.email?.split('@')[0]}!
          </h1>
          <p style={{ color: '#6B5C52', margin: 0, fontSize: '0.95rem' }}>
            How will you be using Plate?
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {/* User card */}
          <button
            onClick={onSelectUser}
            style={{
              background: 'white', border: '2px solid #E8D5B7', borderRadius: '16px',
              padding: '2rem 1.5rem', cursor: 'pointer', textAlign: 'left',
              fontFamily: 'var(--font-sans)', transition: 'all 0.2s ease',
              boxShadow: '0 1px 4px rgba(44,24,16,0.06)',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#C4622D')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#E8D5B7')}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>👨‍👩‍👧</div>
            <h3 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 0.5rem', fontSize: '1.1rem' }}>
              I'm cooking for my family
            </h3>
            <p style={{ color: '#6B5C52', margin: 0, fontSize: '0.85rem', lineHeight: 1.5 }}>
              Get personalized weekly meal plans and shopping lists for your household.
            </p>
          </button>

          {/* Creator card */}
          <button
            onClick={onSelectCreator}
            style={{
              background: '#2C1810', border: '2px solid #2C1810', borderRadius: '16px',
              padding: '2rem 1.5rem', cursor: 'pointer', textAlign: 'left',
              fontFamily: 'var(--font-sans)', transition: 'all 0.2s ease',
              boxShadow: '0 4px 16px rgba(44,24,16,0.2)',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🧑‍🍳</div>
            <h3 style={{ fontFamily: 'var(--font-serif)', color: 'white', margin: '0 0 0.5rem', fontSize: '1.1rem' }}>
              I'm a food creator
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 1rem', fontSize: '0.85rem', lineHeight: 1.5 }}>
              Launch your own branded meal planning app for your audience.
            </p>
            <span style={{ background: '#C4622D', color: 'white', fontSize: '0.7rem', fontWeight: '700', padding: '0.25rem 0.6rem', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Creator Platform
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
