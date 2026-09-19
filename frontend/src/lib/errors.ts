/** A message to show the user for anything thrown by an API call */
export const errorMessage = (err: unknown): string => {
  if (err instanceof TypeError) {
    // fetch rejects with a TypeError when the server cannot be reached at all
    return 'Could not reach the server. Is the backend running?'
  }
  return err instanceof Error ? err.message : 'Something went wrong'
}
