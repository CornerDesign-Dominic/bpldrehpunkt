import { TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useEffect, useRef, useState } from 'react'
import { linkedTodoSubmission } from '../../lib/linkedTodoCreation.js'
import TodoForm from './TodoForm.jsx'

export default function LinkedTodoCreateModal({ canViewTransportOrders = false, currentUserId, fixedLink, onCancel, onSubmit, partners, users }) {
  const busy = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape' && !busy.current) onCancel() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onCancel])
  return <div className="todo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy.current) onCancel() }}>
    <TranslatedProps sources={{"aria-label":"To-do anlegen"}}><section className="todo-form-modal" role="dialog" aria-modal="true" aria-busy={submitting} aria-label="To-do anlegen">
      <TodoForm key={`new-${fixedLink.field}-${fixedLink.id}`} canViewTransportOrders={canViewTransportOrders} currentUserId={currentUserId} fixedLink={fixedLink} partners={partners} users={users} onCancel={onCancel} onSubmittingChange={(value) => { busy.current = value; setSubmitting(value) }} onSubmit={(values) => onSubmit(linkedTodoSubmission(values, fixedLink))} />
    </section></TranslatedProps>
  </div>
}
