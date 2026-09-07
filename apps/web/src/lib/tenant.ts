import { supabase } from './supabase'

export interface TenantConfig {
  id: string
  brand_name: string
  primary_color: string
  tagline: string | null
  logo_url: string | null
  subdomain: string
}

const TEST_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

const DEFAULT_TENANT: TenantConfig = {
  id: TEST_TENANT_ID,
  brand_name: 'Createry',
  primary_color: '#C4622D',
  tagline: 'Personalized meal plans for your family.',
  logo_url: null,
  subdomain: 'default',
}

export async function resolveTenant(): Promise<TenantConfig> {
  const params = new URLSearchParams(window.location.search)
  const creatorParam = params.get('creator')

  if (creatorParam) {
    localStorage.setItem('creator_subdomain', creatorParam)
  }

  const subdomain = creatorParam || localStorage.getItem('creator_subdomain')
  console.log('resolveTenant called, subdomain:', subdomain, 'creatorParam:', creatorParam, 'localStorage:', localStorage.getItem('creator_subdomain'))

  if (!subdomain) return DEFAULT_TENANT

  const { data, error } = await supabase
    .from('tenants')
    .select('id, brand_name, primary_color, tagline, logo_url, subdomain')
    .eq('subdomain', subdomain)
    .maybeSingle()

  console.log('tenant query result:', data, 'error:', error)
  if (error || !data) {
    console.warn(`Tenant not found for subdomain: ${subdomain}`, error)
    return DEFAULT_TENANT
  }

  return {
    id: data.id,
    brand_name: data.brand_name || 'Createry',
    primary_color: data.primary_color || '#C4622D',
    tagline: data.tagline,
    logo_url: data.logo_url,
    subdomain: data.subdomain,
  }
}

export function clearCreatorSession() {
  localStorage.removeItem('creator_subdomain')
  localStorage.removeItem('pending_tenant_id')
}
