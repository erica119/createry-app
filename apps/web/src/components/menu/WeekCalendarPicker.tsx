import { useState } from 'react'

interface Props {
  currentWeekDate: string
  onSelectWeek: (weekDate: string) => void
  onClose: () => void
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa']

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d
}

function toDateStr(date: Date): string {
  return date.toISOString().split('T')[0]
}

export default function WeekCalendarPicker({ currentWeekDate, onSelectWeek, onClose }: Props) {
  const current = new Date(currentWeekDate)
  const [viewYear, setViewYear] = useState(current.getUTCFullYear())
  const [viewMonth, setViewMonth] = useState(current.getUTCMonth())

  const today = new Date()
  const todayWeekStart = toDateStr(getWeekStart(today))

  const firstDay = new Date(Date.UTC(viewYear, viewMonth, 1))
  const startOffset = firstDay.getUTCDay()
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate()

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const handleDayClick = (day: number) => {
    const clicked = new Date(Date.UTC(viewYear, viewMonth, day))
    const weekStart = getWeekStart(clicked)
    onSelectWeek(toDateStr(weekStart))
    onClose()
  }

  const getWeekStartForDay = (day: number): string => {
    const d = new Date(Date.UTC(viewYear, viewMonth, day))
    return toDateStr(getWeekStart(d))
  }

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ]

  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(44,24,16,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', width: '320px', boxShadow: '0 20px 60px rgba(44,24,16,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <button onClick={prevMonth} style={{ background: 'none', border: '1.5px solid #DDCDBB', borderRadius: '6px', padding: '0.25rem 0.6rem', cursor: 'pointer', fontSize: '1rem', color: '#52645A' }}>←</button>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: '700', color: '#1F3B30', fontSize: '1.1rem' }}>{MONTHS[viewMonth]} {viewYear}</span>
          <button onClick={nextMonth} style={{ background: 'none', border: '1.5px solid #DDCDBB', borderRadius: '6px', padding: '0.25rem 0.6rem', cursor: 'pointer', fontSize: '1rem', color: '#52645A' }}>→</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '0.5rem' }}>
          {DAY_LABELS.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: '700', color: '#687A70', padding: '0.25rem 0' }}>{d}</div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {weeks.map((week, wi) => {
            const firstValidDay = week.find(d => d !== null)
            const weekStartStr = firstValidDay ? getWeekStartForDay(firstValidDay) : null
            const isCurrentWeek = weekStartStr === currentWeekDate
            const isThisWeek = weekStartStr === todayWeekStart

            return (
              <div key={wi} onClick={() => firstValidDay && handleDayClick(firstValidDay)}
                style={{
                  display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px',
                  borderRadius: '8px', cursor: firstValidDay ? 'pointer' : 'default',
                  background: isCurrentWeek ? 'var(--color-primary)' : isThisWeek ? 'var(--color-primary-light)' : 'transparent',
                  padding: '2px',
                }}>
                {week.map((day, di) => (
                  <div key={di} style={{
                    textAlign: 'center', padding: '0.4rem 0', fontSize: '0.875rem',
                    color: isCurrentWeek ? 'white' : day ? '#1F3B30' : 'transparent',
                    fontWeight: isCurrentWeek ? '600' : '400',
                    borderRadius: '6px',
                  }}>
                    {day || ''}
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #F5E8D7', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#687A70' }}>
          <span>Click any week row to select it</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#687A70', cursor: 'pointer', fontSize: '0.8rem' }}>Close</button>
        </div>
      </div>
    </div>
  )
}
