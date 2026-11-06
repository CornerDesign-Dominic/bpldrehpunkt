export function mailboxCall(name, data) {
  return globalThis.__mailboxModesCall(name, data)
}
