import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Brand, QuickRules } from '~/components/lobby/common'
import { apiCreateRoom, apiRoomInfo } from '~/lib/client'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [error, setError] = useState('')

  async function create() {
    setBusy('create')
    setError('')
    try {
      const newCode = await apiCreateRoom()
      await navigate({ to: '/room/$code', params: { code: newCode } })
    } catch {
      setError('Could not create a game. Is the server running?')
      setBusy(null)
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault()
    const clean = code.trim().toUpperCase()
    if (!clean) return setError('Enter a game code')
    setBusy('join')
    setError('')
    try {
      const info = await apiRoomInfo(clean)
      if (!info.exists) {
        setError(`No game found with code ${clean}`)
        setBusy(null)
        return
      }
      await navigate({ to: '/room/$code', params: { code: info.code } })
    } catch {
      setError('Could not reach the server')
      setBusy(null)
    }
  }

  return (
    <main className="lobby-shell">
      <Brand />
      <section className="panel">
        <h2>Create a game</h2>
        <p className="sub">Start a new table and share the code with your friends.</p>
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={create} disabled={busy !== null}>
          {busy === 'create' ? 'Creating…' : 'Create game'}
        </button>

        <div className="divider">or</div>

        <h2>Join a game</h2>
        <p className="sub">Enter the code the host gave you.</p>
        <form className="stack" onSubmit={join}>
          <input
            className="input input-code"
            placeholder="CODE"
            value={code}
            maxLength={8}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          />
          <button className="btn" type="submit" disabled={busy !== null}>
            {busy === 'join' ? 'Joining…' : 'Join game'}
          </button>
        </form>
        <p className="error-text" role="alert">
          {error}
        </p>
      </section>
      <QuickRules />
    </main>
  )
}
