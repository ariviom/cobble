import crypto from 'crypto'

const BL_STORE_BASE = 'https://api.bricklink.com/api/store/v1'

function requireEnv(name: string): string {
  const val = process.env[name] ?? ''
  if (!val) throw new Error(`Missing env ${name}`)
  return val
}

function rfc3986encode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    c => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  )
}

function buildOAuthHeader(
  method: string,
  url: string,
  extraParams: Record<string, string | number>,
): string {
  const consumerKey = requireEnv('BRICKLINK_CONSUMER_KEY')
  const consumerSecret = requireEnv('BRICKLINK_CONSUMER_SECRET')
  const token = requireEnv('BRICKLINK_TOKEN_VALUE')
  const tokenSecret =
    process.env.BRICKLINK_TOKEN_SECRET ??
    process.env.BRICLINK_TOKEN_SECRET ??
    ''
  if (!tokenSecret) {
    throw new Error(
      'Missing BRICKLINK_TOKEN_SECRET (or BRICLINK_TOKEN_SECRET fallback)',
    )
  }

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: '1.0',
  }

  const sigParams: Record<string, string> = {}
  for (const [k, v] of Object.entries(oauthParams)) sigParams[k] = String(v)
  for (const [k, v] of Object.entries(extraParams || {})) {
    if (v === undefined || v === null) continue
    sigParams[k] = String(v)
  }

  const norm = Object.keys(sigParams)
    .sort()
    .map(k => `${rfc3986encode(k)}=${rfc3986encode(sigParams[k])}`)
    .join('&')

  const baseString = [
    method.toUpperCase(),
    rfc3986encode(url),
    rfc3986encode(norm),
  ].join('&')

  const signingKey = `${rfc3986encode(consumerSecret)}&${rfc3986encode(
    tokenSecret,
  )}`
  const signature = crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64')

  const headerParams: Record<string, string> = {
    ...oauthParams,
    oauth_signature: signature,
  }

  const header =
    'OAuth ' +
    Object.keys(headerParams)
      .sort()
      .map(k => `${rfc3986encode(k)}="${rfc3986encode(headerParams[k]!)}"`)
      .join(', ')

  return header
}

async function blGet<T>(
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const url = new URL(`${BL_STORE_BASE}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue
      url.searchParams.set(k, String(v))
    }
  }

  const authHeader = buildOAuthHeader(
    'GET',
    url.origin + url.pathname,
    Object.fromEntries(url.searchParams.entries()),
  )

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`BrickLink ${res.status}: ${text.slice(0, 200)}`)
  }

  type BLResponse = { meta?: { code?: number; message?: string }; data: T }
  const json = (await res.json()) as BLResponse
  if (json?.meta && json.meta.code && json.meta.code !== 200) {
    throw new Error(
      `BrickLink meta ${json.meta.code}: ${json.meta.message ?? 'error'}`,
    )
  }
  return json.data
}

export type ScriptBLSubsetItem = {
  inv_item_id?: number
  color_id?: number
  color_name?: string
  item: { no: string; type: string; name?: string; image_url?: string }
  quantity: number
  appear_as?: string
}

export async function getSetSubsets(
  setNum: string,
): Promise<ScriptBLSubsetItem[]> {
  const data = await blGet<unknown[] | { entries?: unknown[] }>(
    `/items/SET/${encodeURIComponent(setNum)}/subsets`,
    {},
  )

  const raw: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { entries?: unknown[] }).entries)
      ? ((data as { entries?: unknown[] }).entries ?? [])
      : []

  const list: ScriptBLSubsetItem[] = raw
    .flatMap(group => {
      if (
        group &&
        typeof group === 'object' &&
        Array.isArray((group as { entries?: unknown[] }).entries)
      ) {
        return (group as { entries: ScriptBLSubsetItem[] }).entries
      }
      return [group as ScriptBLSubsetItem]
    })
    .filter(Boolean) as ScriptBLSubsetItem[]

  // eslint-disable-next-line no-console
  console.log('[bricklink-script] set subsets', {
    setNum,
    count: Array.isArray(list) ? list.length : 0,
  })

  return list
}



