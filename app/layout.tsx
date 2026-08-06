import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AUTIC by NeuroLumina',
  description: 'A calm support platform for neurodivergent individuals, families, therapists and schools.'
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
