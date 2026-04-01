import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CricCity',
  description: 'Cricket Legends Visualized as a 3D City',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, height: '100%', overflow: 'hidden' }}>
        {children}
      </body>
    </html>
  )
}