import TodoForm from './TodoForm.jsx'

export default function LinkedTodoCreateModal({ currentUserId, fixedLink, onCancel, onSubmit, partners, users }) {
  return <div className="todo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
    <section className="todo-form-modal" role="dialog" aria-modal="true" aria-label="To-do anlegen">
      <TodoForm key={`new-${fixedLink.field}-${fixedLink.id}`} currentUserId={currentUserId} fixedLink={fixedLink} partners={partners} users={users} onCancel={onCancel} onSubmit={(values) => onSubmit({ ...values, ...fixedLink.values, [fixedLink.field]: fixedLink.id })} />
    </section>
  </div>
}
