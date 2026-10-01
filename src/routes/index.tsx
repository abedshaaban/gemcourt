import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Brand, QuickRules } from '~/components/lobby/common'
import { apiCreateRoom, apiRoomInfo } from '~/lib/client'

export const Route = createFileRoute('/')({
  component: HomePage,
})

// Room codes are 5 letters (CODE_LENGTH / CODE_ALPHABET in server/rooms.ts — no digits).
const CODE_LENGTH = 5

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
            placeholder="5-letter code"
            aria-label="Game code"
            value={code}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            onChange={(e) => {
              // Accept a pasted invite link too (…/room/ABCDE); no maxLength so the paste isn't cut first.
              const raw = e.target.value.match(/\/room\/([a-z]+)/i)?.[1] ?? e.target.value
              setCode(raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LENGTH))
              setError('')
            }}
          />
          <button className="btn" type="submit" disabled={busy !== null || code.length !== CODE_LENGTH}>
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
