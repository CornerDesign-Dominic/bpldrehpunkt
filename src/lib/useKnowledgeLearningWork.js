import { useRef, useState } from 'react'
import { learnKnowledgeCases } from './knowledge.js'

export function knowledgeLearningError(error, en) {
  if (error?.code === 'functions/aborted') return en ? 'Cases or article changed. Open the collection again and select the mails.' : 'Mails oder Artikel wurden geändert. Sammlung erneut öffnen und Mails auswählen.'
  if (error?.code === 'functions/failed-precondition') return en ? 'Check the selected mails and article before trying again.' : 'Ausgewählte Mails und Artikel vor dem nächsten Versuch prüfen.'
  return en ? 'Learning failed. Please try again.' : 'Lernen fehlgeschlagen. Bitte erneut versuchen.'
}

export function useKnowledgeLearningWork() {
  const attempts = useRef(new Map())
  const [work, setWork] = useState({})
  async function start(values) {
    const signature = JSON.stringify(values)
    let attempt = attempts.current.get(values.gapId)
    if (attempt?.pending) return attempt.promise
    if (attempt?.signature !== signature) attempt = { signature, runId: crypto.randomUUID() }
    const request = { ...values, runId: attempt.runId }
    setWork((previous) => ({ ...previous, [values.gapId]: { ...request, id: request.runId, status: 'running', startedAt: Date.now() } }))
    attempt.pending = true
    attempt.promise = learnKnowledgeCases(request).then((result) => {
      setWork((previous) => ({ ...previous, [values.gapId]: { ...previous[values.gapId], ...result } }))
      attempts.current.delete(values.gapId)
      return result
    }).catch((error) => {
      if (error.details?.retryWithNewRunId) attempts.current.delete(values.gapId)
      setWork((previous) => ({ ...previous, [values.gapId]: { ...previous[values.gapId], status: 'failed', error } }))
      throw error
    }).finally(() => { attempt.pending = false })
    attempts.current.set(values.gapId, attempt)
    return attempt.promise
  }
  return { work, start }
}
