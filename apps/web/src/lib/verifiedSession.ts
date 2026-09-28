import { supabase } from './supabase'

const SIGN_IN_MESSAGE = 'Your sign-in expired. Please sign in again, then build your plan.'
const NOTICE_KEY = 'createry:auth-notice'

async function clearInvalidSession(): Promise<never> {
  sessionStorage.setItem(NOTICE_KEY, SIGN_IN_MESSAGE)
  await supabase.auth.signOut({ scope: 'local' })
  throw new Error(SIGN_IN_MESSAGE)
}

export async function getVerifiedAccessToken(): Promise<string> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session?.access_token) return clearInvalidSession()

  // getSession reads local storage. A revoked server session can still have an
  // unexpired token there, so verify it with Auth before starting a costly plan.
  const { data: { user }, error } = await supabase.auth.getUser(session.access_token)
  if (error) {
    if (error.status === 401 || error.status === 403 || error.code === 'session_not_found') {
      return clearInvalidSession()
    }
    throw new Error('Could not verify your sign-in. Please try again.')
  }
  if (!user) return clearInvalidSession()
  return session.access_token
}

export async function handleMenuAuthError(status: number): Promise<void> {
  if (status === 401) await clearInvalidSession()
}

export function takeAuthNotice(): string | null {
  const notice = sessionStorage.getItem(NOTICE_KEY)
  sessionStorage.removeItem(NOTICE_KEY)
  return notice
}
