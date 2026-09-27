import { useState } from 'react'

interface Props {
  onClose: () => void
  primaryColor?: string
}

export default function SupportModal({ onClose, primaryColor = '#C9471F' }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-support-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ name, email, subject, message }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send message')
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.7rem 0.9rem', fontSize: '0.9rem',
    borderRadius: '10px', border: '2px solid #DDCDBB',
    background: '#FAF3E8', color: '#1F3B30',
    fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(44,24,16,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'white', borderRadius: '20px', maxWidth: '480px', width: '100%', overflow: 'hidden', boxShadow: '0 20px 60px rgba(44,24,16,0.2)' }}
      >
        {/* Header */}
        <div style={{ background: primaryColor, padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', color: 'white', margin: 0, fontSize: '1.25rem' }}>Help &amp; Support</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1, padding: '0.1rem', opacity: 0.8 }}
            aria-label="Close"
          >✕</button>
        </div>

        {submitted ? (
          <div style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✅</div>
            <h3 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.5rem', fontSize: '1.15rem' }}>Message sent!</h3>
            <p style={{ color: '#52645A', fontSize: '0.875rem', margin: '0 0 1.5rem' }}>We'll get back to you as soon as possible.</p>
            <button
              onClick={onClose}
              style={{ background: primaryColor, color: 'white', border: 'none', padding: '0.65rem 1.5rem', borderRadius: '10px', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
            >Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ margin: 0, color: '#52645A', fontSize: '0.875rem' }}>We'll get back to you as soon as possible.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: '600', color: '#1F3B30', marginBottom: '0.35rem', fontSize: '0.825rem' }}>Name</label>
                <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Your name" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: '600', color: '#1F3B30', marginBottom: '0.35rem', fontSize: '0.825rem' }}>Email</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" style={inputStyle} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: '600', color: '#1F3B30', marginBottom: '0.35rem', fontSize: '0.825rem' }}>Subject</label>
              <input type="text" required value={subject} onChange={e => setSubject(e.target.value)} placeholder="How can we help?" style={inputStyle} />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: '600', color: '#1F3B30', marginBottom: '0.35rem', fontSize: '0.825rem' }}>Message</label>
              <textarea
                required
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Describe your issue or question..."
                rows={4}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
              />
            </div>

            {error && <p style={{ margin: 0, color: '#dc2626', fontSize: '0.85rem' }}>{error}</p>}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
              <button
                type="button"
                onClick={onClose}
                style={{ background: 'none', border: '1.5px solid #DDCDBB', color: '#52645A', padding: '0.65rem 1.25rem', borderRadius: '10px', fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: '500' }}
              >Cancel</button>
              <button
                type="submit"
                disabled={submitting}
                style={{ background: primaryColor, color: 'white', border: 'none', padding: '0.65rem 1.5rem', borderRadius: '10px', fontSize: '0.9rem', fontWeight: '600', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)', opacity: submitting ? 0.7 : 1 }}
              >{submitting ? 'Sending...' : 'Send Message'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
