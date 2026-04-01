"use client"

import dynamic from "next/dynamic"

const CricCity = dynamic(() => import("@/components/CricCity"), {
  ssr: false,
})

export default function Home() {
  return <CricCity />
}