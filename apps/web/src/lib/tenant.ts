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
  brand_name: 'Plate',
  primary_color: '#C4622D',
  tagline: 'Personalized meal plans for your family.',
  logo_url: null,
  subdomain: 'default',
}

export async function resolveTenant(): Promise<TenantConfig> {
  // Check for ?creator=subdomain in URL
  const params = new URLSearchParams(window.location.search)
  const creatorParam = params.get('creator')

  if (!creatorParam) return DEFAULT_TENANT

  const { data, error } = await supabase
    .from('tenants')
    .select('id, brand_name, primary_color, tagline, logo_url, subdomain')
    .eq('subdomain', creatorParam)
    .maybeSingle()

  if (error || !data) {
    console.warn(`Tenant not found for subdomain: ${creatorParam}`)
    return DEFAULT_TENANT
  }

  return {
    id: data.id,
    brand_name: data.brand_name || 'Plate',
    primary_color: data.primary_color || '#C4622D',
    tagline: data.tagline,
    logo_url: data.logo_url,
    subdomain: data.subdomain,
  }
}
