import type { TenantConfig } from '../../lib/tenant'

/** Creator identity takes precedence; Createry's supplied artwork is the base identity. */
export default function BrandMark({ tenant, onDark = false, creator = false }: { tenant?: TenantConfig | null; onDark?: boolean; creator?: boolean }) {
  const custom = tenant && tenant.id !== 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  if (custom) {
    return <span className="brand-mark creator-mark">
      {tenant.logo_url && <img src={tenant.logo_url} alt="" className="creator-logo" />}
      <span>{tenant.brand_name || 'Createry'}{creator && <small>Creator</small>}</span>
    </span>
  }
  return <img className="createry-wordmark" src={onDark ? '/brand/createry-wordmark-on-basil.svg' : '/brand/createry-wordmark.svg'} alt="Createry" />
}
