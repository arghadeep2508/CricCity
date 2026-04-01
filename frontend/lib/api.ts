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
 * ✅ Smart BASE URL
 * - Uses deployed backend in production
 * - Uses localhost in development
 */
const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

/**
 * ✅ Fetch players (CricCity standard)
 */
export async function fetchPlayers(format: string = "TEST"): Promise<Player[]> {
  try {
    const res = await fetch(
      `${BASE_URL}/api/players?format=${format}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store", // always fresh data
      }
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch players: ${res.status}`);
    }

    const data = await res.json();

    return data?.data || [];
  } catch (err) {
    console.error("❌ API Error:", err);
    return [];
  }
}
