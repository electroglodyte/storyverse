// web/src/app/page.tsx
import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-4">Welcome to StoryVerse</h1>
        <p className="mb-4">Your personal writing style management system</p>
        <div className="mt-8">
          <Link 
            href="/samples" 
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            View Writing Samples
          </Link>
        </div>
      </div>
    </main>
  )
}