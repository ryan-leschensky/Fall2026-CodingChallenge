import { createBrowserRouter } from 'react-router'
import { RequireAuth } from './auth/RequireAuth'
import { Layout } from './components/Layout'
import { CollectionPage } from './pages/CollectionPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SharedCollectionPage } from './pages/SharedCollectionPage'

/**
 * Every page has its own URL, mirroring the API:
 *   /                           the user's collections      (GET /api/collections)
 *   /collections/:collectionId  one collection              (GET /api/collections/:collectionId)
 *   /shared/:shareId            a collection's share link   (GET /api/shared/:shareId)
 */
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/login', element: <LoginPage mode="login" /> },
      { path: '/signup', element: <LoginPage mode="signup" /> },
      // Public: anyone with the link can view, logged in or not
      { path: '/shared/:shareId', element: <SharedCollectionPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/collections/:collectionId', element: <CollectionPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
