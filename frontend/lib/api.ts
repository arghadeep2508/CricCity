// frontend/lib/api.ts

export interface Player {
  id: string
  name: string
  country: string
  role: string
  batting_style: string
  bowling_style: string | null

  stats: {
    batting: Record<string, any>
    bowling: Record<string, any>
    fielding: Record<string, any>
  }

  career: {
    formats: string[]
  }
}

/**
 * ✅ Smart BASE URL (bulletproof)
 *
 * Priority:
 * 1. Env variable (production)
 * 2. Local backend (development)
 */
const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || // remove trailing slash
  "http://127.0.0.1:8000"

/**
 * ✅ Helper to build full endpoint safely
 */
function buildUrl(path: string) {
  return `${BASE_URL}${path}`
}

/**
 * ✅ Fetch players (CricCity standard)
 */
export async function fetchPlayers(format: string = "test"): Promise<Player[]> {
  try {
    const url = buildUrl(`/api/players?format=${format.toLowerCase()}`)

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} → ${res.statusText}`)
    }

    const json = await res.json()

    // ✅ Strict validation (prevents silent frontend break)
    if (!json || !Array.isArray(json.data)) {
      console.error("❌ Invalid API structure:", json)
      return []
    }

    return json.data
  } catch (err) {
    console.error("❌ API Error:", err)
    return []
  }
}
