"use client"

import dynamic from "next/dynamic"

// ✅ Dynamic import (important for 3D / browser-only libs)
const CricCity = dynamic(() => import("@/components/CricCity"), {
  ssr: false,
  loading: () => <p>Loading CricCity...</p>,
})

export default function Home() {
  return <CricCity />
}
