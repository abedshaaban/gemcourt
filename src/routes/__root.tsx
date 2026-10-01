import type { ReactNode } from 'react'
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import appCss from '~/styles/app.css?url'
import gameCss from '~/styles/game.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Splendor' },
      { name: 'theme-color', content: '#0f1420' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'stylesheet', href: gameCss },
      {
        rel: 'icon',
        href: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><polygon points='16,2 30,12 24,30 8,30 2,12' fill='%23d9a93b'/></svg>",
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: () => (
    <div className="center-note">
      <div style={{ textAlign: 'center' }}>
        <p>Nothing to see here.</p>
        <a href="/" className="btn btn-primary">
          Back home
        </a>
      </div>
    </div>
  ),
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
