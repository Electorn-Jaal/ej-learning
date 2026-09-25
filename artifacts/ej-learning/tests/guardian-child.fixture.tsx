import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query'
import { getGetChildDayQueryKey, getGetMyChildrenQueryKey } from '@workspace/api-client-react'
import GuardianChild from '../src/pages/guardian/Child'
import { schoolToday } from '../src/lib/schedule-window'

type Case = 'children-failed' | 'day-failed' | 'no-children'

// A query that has already failed, as the cache holds it after the request.
function fail(client: QueryClient, queryKey: QueryKey) {
  client.getQueryCache().build(client, { queryKey }).setState({
    status: 'error', fetchStatus: 'idle', data: undefined, error: new Error('network'),
    errorUpdateCount: 1, errorUpdatedAt: Date.now(),
  })
}

export function renderGuardianChild(which: Case) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } } })
  if (which === 'children-failed') fail(client, getGetMyChildrenQueryKey())
  else client.setQueryData(getGetMyChildrenQueryKey(), which === 'no-children' ? [] : [
    { studentId: 7, displayName: 'Test child', className: '5А' },
  ])
  if (which === 'day-failed') fail(client, getGetChildDayQueryKey({ studentId: 7, on: schoolToday() }))
  const html = renderToStaticMarkup(<QueryClientProvider client={client}><GuardianChild /></QueryClientProvider>)
  client.clear()
  return html
}
