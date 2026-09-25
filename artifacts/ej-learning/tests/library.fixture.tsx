import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getGetLibraryBooksQueryKey } from '@workspace/api-client-react'
import Library from '../src/pages/Library'

export function renderLibrary() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(getGetLibraryBooksQueryKey(), [
    { id: 1, title: 'Primary mathematics', subjectName: 'Математик', grades: [3], hasFile: true, hasCover: true, filePages: 120 },
    { id: 2, title: 'Senior physics', subjectName: 'Физик', grades: [12], hasFile: false, hasCover: false, filePages: null },
    { id: 3, title: 'Shared music', subjectName: 'Хөгжим', grades: [8, 9], hasFile: true, hasCover: true, filePages: null },
  ])
  const html = renderToStaticMarkup(<QueryClientProvider client={client}><Library /></QueryClientProvider>)
  client.clear()
  return html
}
