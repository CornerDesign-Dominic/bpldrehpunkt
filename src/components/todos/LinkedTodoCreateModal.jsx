import { TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import TodoForm from './TodoForm.jsx'

export default function LinkedTodoCreateModal({ canViewTransportOrders = false, currentUserId, fixedLink, onCancel, onSubmit, partners, users }) {
  return <div className="todo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
    <TranslatedProps sources={{"aria-label":"To-do anlegen"}}><section className="todo-form-modal" role="dialog" aria-modal="true" aria-label="To-do anlegen">
      <TodoForm key={`new-${fixedLink.field}-${fixedLink.id}`} canViewTransportOrders={canViewTransportOrders} currentUserId={currentUserId} fixedLink={fixedLink} partners={partners} users={users} onCancel={onCancel} onSubmit={(values) => onSubmit({ ...values, ...fixedLink.values, [fixedLink.field]: fixedLink.id })} />
    </section></TranslatedProps>
  </div>
}
