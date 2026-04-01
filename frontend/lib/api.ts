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

const BASE_URL = "http://127.0.0.1:8000/api"

// ✅ THIS is what your CricCity uses
export async function fetchPlayers(format: string = "TEST"): Promise<Player[]> {
  try {
    const res = await fetch(`${BASE_URL}/players?format=${format}`)

    if (!res.ok) {
      throw new Error("Failed to fetch players")
    }

    const data = await res.json()

    return data.data || []
  } catch (err) {
    console.error("API Error:", err)
    return []
  }
}