import { canCollaborateTodo, canManageTodoAudience, canReadTodoForUser } from '../../shared/todoCollaboration.js'
import { subscribeCalendarRefresh } from '../lib/calendarRefresh.js'
import ReminderStatus from '../components/reminders/ReminderStatus.jsx'
import { reminderTimestampKey } from '../lib/reminderForm.js'
import { reportTechnicalFailure } from '../lib/diagnostics.js'
import { StaticText, TranslatedProps } from '../i18n/AutoTranslate.jsx'
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import Link from "../components/ui/ContextLink.jsx";
import { recordDetailPath } from "../lib/recordNavigation.js";
import TodoQuickEditModal from "../components/todos/TodoQuickEditModal.jsx";
import TodoDeadlinesCard from "../components/todos/TodoDeadlinesCard.jsx";
import { TodoPriority } from "../components/todos/TodoPriority.jsx";
import ConfirmDialog from "../components/ui/ConfirmDialog.jsx";
import BackLink from "../components/ui/BackLink.jsx";
import ContextLink from "../components/ui/ContextLink.jsx";
import Toast from "../components/ui/Toast.jsx";
import { EditIcon } from "../components/icons.jsx";
import { useAuth } from "../auth/useAuth.js";
import { usePermissions } from "../auth/usePermissions.js";
import {
  getUserDisplayName,
  listVisibleUserDirectory,
} from "../lib/userProfiles.js";
import { listBusinessPartners } from "../lib/businessPartners.js";
import {
  businessPartnerDetailPath,
  insolvencyCasePath,
} from "../lib/businessPartnerLinks.js";
import { transportOrderPath } from "../lib/transportOrderPresentation.js";
import { resolvePartnerInIndex } from "../lib/partnerCluster.js";
import { listDamageCases } from "../lib/damages.js";
import { listInsolvencies } from "../lib/insolvencies.js";
import {
  addTodoNote,
  audienceHasChanged,
  completeTodoForCurrentUser,
  createTodoDeadline,
  deleteTodoDeadline,
  subscribeTodo,
  subscribeTodoUpdates,
  subscribeTodoDeadlines,
  reactivateTodoForCurrentUser,
  TODO_STATUS,
  todoStatus,
  todoPriority,
  updateTodoDeadline,
  updateTodoByCreator,
  withdrawTodo,
} from "../lib/todos.js";

function formatDate(value) {
  return value
    ? new Intl.DateTimeFormat("de-DE").format(new Date(`${value}T12:00:00`))
    : "—";
}

function formatTimestamp(value) {
  const date = value?.toDate?.();
  return date
    ? new Intl.DateTimeFormat("de-DE", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
    : "—";
}

function dueClass(todo) {
  if (!todo.dueDate || ["completed", "withdrawn"].includes(todo.status))
    return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${todo.dueDate}T12:00:00`);
  const diff = Math.round((due - today) / 86400000);
  return diff < 0
    ? "due-date due-date--overdue"
    : diff <= 7
      ? "due-date due-date--soon"
      : "due-date";
}

function Detail({ label, children }) {
  return (
    <div>
      <dt><StaticText source={label} /></dt>
      <dd>{children || "—"}</dd>
    </div>
  );
}

function DetailSectionHeading({ children, onEdit }) {
  const label = typeof children === 'string' ? children : children?.props?.source || 'Abschnitt';
  return (
    <div className="todo-detail-section-heading">
      <h3>{children}</h3>
      {onEdit && (
        <button
          className="todo-detail-section-edit"
          type="button"
          onClick={onEdit}
          title={`${label} bearbeiten`}
          aria-label={`${label} bearbeiten`}
        >
          <EditIcon size={14} />
        </button>
      )}
    </div>
  );
}

function TodoActions({ actor, onAction, todo, pending }) {
  const status = todoStatus(todo);
  if (!canCollaborateTodo(todo, actor)) return null;
  return <div className="todo-detail-actions">
    {['open', 'in_progress'].includes(status) && <button className="button" type="button" disabled={pending} onClick={() => onAction('complete', todo)}><StaticText source="Erledigen" /></button>}
    {status === 'completed' && <button className="button" type="button" disabled={pending} onClick={() => onAction('reactivate', todo)}><StaticText source="Wieder öffnen" /></button>}
    {canManageTodoAudience(todo, actor) && ['open', 'in_progress'].includes(status) && <button className="button button--secondary" type="button" disabled={pending} onClick={() => onAction('withdraw', todo)}><StaticText source="Zurückziehen" /></button>}
  </div>;
}

export default function TodoDetailPage() {
  const { todoId } = useParams();
  const { user } = useAuth();
  return <TodoDetailContent key={`${user?.uid || ''}:${todoId}`} todoId={todoId} />;
}

function TodoDetailContent({ todoId }) {
  const { user, profile } = useAuth();
  const { canEdit, canView } = usePermissions();
  const actor = useMemo(() => ({ user, profile }), [profile, user]);
  const [result, setResult] = useState(null);
  const [subscriptionVersion, setSubscriptionVersion] = useState(0);
  const [users, setUsers] = useState([]);
  const [directoryReady, setDirectoryReady] = useState(false);
  const [directoryError, setDirectoryError] = useState('');
  const [partners, setPartners] = useState([]);
  const [damageCases, setDamageCases] = useState([]);
  const [insolvencies, setInsolvencies] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [deadlines, setDeadlines] = useState([]);
  const [deadlinesLoading, setDeadlinesLoading] = useState(true);
  const [updatesLoading, setUpdatesLoading] = useState(true);
  const [note, setNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const notePending = useRef(false);
  const [quickEditing, setQuickEditing] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [actionSaving, setActionSaving] = useState(false);
  const actionPending = useRef(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const editable = canEdit("todos");
  const canViewMasterData = canView("masterData");
  const canViewDamageCases = canView("damages");
  const canViewInsolvencies = canView("insolvencies");
  const canViewTransportOrders = canView("transportOrders");
  const activeUsers = useMemo(
    () =>
      users
        .filter((item) => item.active !== false)
        .sort((left, right) =>
          getUserDisplayName(left, left).localeCompare(
            getUserDisplayName(right, right),
            "de",
          ),
        ),
    [users],
  );
  const usersById = useMemo(
    () => new Map(activeUsers.map((item) => [item.id, item])),
    [activeUsers],
  );

  useEffect(() => {
    let current = true;
    const fail = (loadError) => {
      if (!current) return;
      current = false;
      setResult({ todo: null, error: loadError.code === 'permission-denied' ? 'Kein Zugriff auf diese Aufgabe.' : 'Die Aufgabe konnte nicht geladen werden. Bitte die Seite neu laden.' });
      setUpdates([]);
      setDeadlines([]);
      setQuickEditing(null);
      setConfirmation(null);
      setUpdatesLoading(false);
      setDeadlinesLoading(false);
      void reportTechnicalFailure({ module: 'todos', stage: 'load', error: loadError });
    };
    const stop = [
      subscribeTodo(todoId, (todo) => {
        if (current) {
          setResult({ todo, error: todo ? '' : 'Aufgabe nicht gefunden.' });
          if (!canCollaborateTodo(todo, actor) || !['open', 'in_progress'].includes(todo.status)) {
            setQuickEditing(null);
            setConfirmation(null);
          }
        }
      }, fail),
      subscribeTodoUpdates(todoId, (entries) => { if (current) { setUpdates(entries); setUpdatesLoading(false); } }, fail),
      subscribeTodoDeadlines(todoId, (entries) => { if (current) { setDeadlines(entries); setDeadlinesLoading(false); } }, fail),
    ];
    return () => { current = false; stop.forEach((unsubscribe) => unsubscribe()); };
  }, [actor, todoId, subscriptionVersion]);

  useEffect(() => {
    if (result?.todo && !result.error) return undefined;
    // A denied Firestore listener ends permanently. Retry a fresh authorized
    // subscription when returning, so re-added participants can recover.
    return subscribeCalendarRefresh({ window, document, onRefresh: () => setSubscriptionVersion((version) => version + 1) });
  }, [result]);

  useEffect(() => {
    let current = true;
    Promise.all([
      editable ? listVisibleUserDirectory() : Promise.resolve([]),
      canViewMasterData ? listBusinessPartners() : Promise.resolve([]),
      canViewDamageCases ? listDamageCases() : Promise.resolve([]),
      canViewInsolvencies ? listInsolvencies() : Promise.resolve([]),
    ])
      .then(
        ([
          profiles,
          businessPartners,
          cases,
          insolvencyEntries,
        ]) => {
          if (current) {
            setUsers(profiles);
            setDirectoryReady(editable);
            setDirectoryError('');
            setPartners(businessPartners);
            setDamageCases(cases);
            setInsolvencies(insolvencyEntries);
          }
        },
      )
      .catch((loadError) => {
        if (current) {
          setUsers([]);
          setDirectoryReady(false);
          setDirectoryError('Die Auswahllisten konnten nicht geladen werden. Bitte die Seite neu laden.');
          void reportTechnicalFailure({ module: 'todos', stage: 'load', error: loadError });
        }
      });
    return () => {
      current = false;
    };
  }, [
    canViewDamageCases,
    canViewInsolvencies,
    canViewMasterData,
    editable,
    todoId,
    actor,
  ]);

  useEffect(() => {
    if (!editable) return undefined;
    let current = true;
    const stop = subscribeCalendarRefresh({ window, document, onRefresh: () => {
      listVisibleUserDirectory().then((entries) => { if (current) { setUsers(entries); setDirectoryReady(true); setDirectoryError(''); } }).catch((loadError) => {
        if (current) { setUsers([]); setDirectoryReady(false); setDirectoryError('Die Mitarbeiterliste konnte nicht geladen werden. Kalender und Empfänger können erst nach erneutem Laden geändert werden.'); }
        void reportTechnicalFailure({ module: 'todos', stage: 'load', error: loadError });
      });
    } });
    return () => { current = false; stop(); };
  }, [actor, editable]);

  function openQuickEdit(section) { setQuickEditing({ section, todo: result.todo }); }

  async function saveQuickEdit(values) {
    if (audienceHasChanged(quickEditing.todo, values, user.uid)) {
      setConfirmation({ type: 'quick-save', todo: quickEditing.todo, values, title: 'Beteiligte ändern?', message: 'Entfernte Personen verlieren den Zugriff auf dieses To-do. Ihre zugehörigen Kalendereinträge und Erinnerungen entfallen. Bestehende Empfängerauswahlen werden auf die verbleibenden Beteiligten begrenzt.' });
      return;
    }
    await persistQuickEdit(values);
  }

  async function persistQuickEdit(values, original = quickEditing.todo) {
    await updateTodoByCreator(original, values, usersById, false, actor);
    setQuickEditing(null);
    setToast('To-do aktualisiert.');
  }

  async function handleAction(action, todo) {
    setError("");
    if (action === "complete") {
      setConfirmation({
        type: "complete",
        todo,
        title: "To-do erledigen?",
        message:
          "Die Aufgabe wird für alle Beteiligten als erledigt markiert. Berechtigte Beteiligte können sie später wieder öffnen.",
      });
      return;
    }
    if (action === "withdraw") {
      setConfirmation({
        type: "withdraw",
        todo,
        title: "To-do zurückziehen?",
        message:
          "Das To-do wird zurückgezogen. Seine Kalendereinträge und Erinnerungen entfallen. Es bleibt zur Nachvollziehbarkeit gespeichert.",
      });
      return;
    }
    if (actionPending.current) return;
    actionPending.current = true;
    setActionSaving(true);
    try {
      if (action === "reactivate")
        await reactivateTodoForCurrentUser(todo.id, actor);
      if (action === "withdraw") await withdrawTodo(todo.id, actor);
      setToast(
        {
          reactivate: "To-do wieder geöffnet.",
          complete: "To-do erledigt.",
          withdraw: "To-do zurückgezogen.",
        }[action],
      );
    } catch (actionError) {
      setError(
        actionError.message || "Die Änderung konnte nicht gespeichert werden.",
      );
    } finally {
      actionPending.current = false;
      setActionSaving(false);
    }
  }

  async function confirmAction() {
    if (actionPending.current) return;
    actionPending.current = true;
    setActionSaving(true);
    try {
      if (confirmation.type === "quick-save")
        await persistQuickEdit(confirmation.values, confirmation.todo);
      if (confirmation.type === "complete") {
        await completeTodoForCurrentUser(confirmation.todo.id, actor);
        setToast("To-do erledigt.");
      }
      if (confirmation.type === "withdraw") {
        await withdrawTodo(confirmation.todo.id, actor);
        setToast("To-do zurückgezogen.");
      }
      setConfirmation(null);
    } catch (actionError) {
      setConfirmation(null);
      setError(
        actionError.message || "Die Änderung konnte nicht gespeichert werden.",
      );
    } finally {
      actionPending.current = false;
      setActionSaving(false);
    }
  }

  async function saveNote(event) {
    event.preventDefault();
    if (notePending.current) return;
    notePending.current = true;
    setError("");
    setNoteSaving(true);
    try {
      await addTodoNote(todoId, note, actor);
      setNote("");
      setToast("Hinweis hinzugefügt.");
    } catch (noteError) {
      setError(
        noteError.message || "Der Hinweis konnte nicht gespeichert werden.",
      );
    } finally {
      notePending.current = false;
      setNoteSaving(false);
    }
  }

  async function saveDeadline(existingDeadline, values, originalTodo = result.todo) {
    setError("");
    try {
      if (existingDeadline)
        await updateTodoDeadline(originalTodo, existingDeadline, values, actor);
      else await createTodoDeadline(originalTodo, values, actor);
      setToast(
        existingDeadline ? "Termin oder Frist aktualisiert." : "Termin oder Frist hinzugefügt.",
      );
    } catch (saveError) {
      setError(
        saveError.message || "Der Termin konnte nicht gespeichert werden.",
      );
      throw saveError;
    }
  }

  async function deleteDeadline(deadline, originalTodo = result.todo) {
    setError("");
    try {
      await deleteTodoDeadline(originalTodo, deadline, actor);
      setToast("Termin oder Frist gelöscht.");
    } catch (deleteError) {
      setError(
        deleteError.message || "Der Termin konnte nicht gelöscht werden.",
      );
      throw deleteError;
    }
  }

  if (!result || (result.todo && result.todo.id !== todoId)) return <p className="page-state"><StaticText source={"Aufgabe wird geladen …"} /></p>;
  if (result.error || !canReadTodoForUser(result.todo, user?.uid, profile))
    return (
      <section className="todo-detail-empty">
        <h2>{result.error || 'Kein Zugriff auf diese Aufgabe.'}</h2>
        <BackLink to="/todos" />
      </section>
    );

  const { todo } = result;
  const caseUpdates = updates.filter((update) => update.type === "note");
  const history = updates.filter((update) => update.type === "system");
  const canManageSections = canCollaborateTodo(todo, actor) && ['open', 'in_progress'].includes(todo.status);
  const canManageAudience = canManageTodoAudience(todo, actor) && ['open', 'in_progress'].includes(todo.status);
  const linkedDamageCase =
    canViewDamageCases && todo.damageCaseId
      ? damageCases.find((damageCase) => damageCase.id === todo.damageCaseId)
      : null;
  const linkedDamageCaseLabel = linkedDamageCase
    ? [linkedDamageCase.caseNumber, linkedDamageCase.title]
        .filter(Boolean)
        .join(" · ")
    : "";
  const associatedInsolvency =
    canViewInsolvencies && todo.insolvencyId
      ? insolvencies.find((insolvency) => insolvency.id === todo.insolvencyId)
      : null;
  const associatedInsolvencyLabel = associatedInsolvency
    ? [associatedInsolvency.partnerName, associatedInsolvency.courtReference]
        .filter(Boolean)
        .join(" · ")
    : "";
  const partnersById = new Map(
    partners.map((partner) => [partner.id, partner]),
  );
  const linkedTransportOrders =
    Array.isArray(todo.transportOrderLinks) && todo.transportOrderLinks.length
      ? todo.transportOrderLinks
      : todo.transportOrderId
        ? [
            {
              id: todo.transportOrderId,
              number:
                todo.transportOrderNumber ||
                todo.reference ||
                todo.transportOrderId,
            },
          ]
        : [];
  const effectivePartner = (id) => {
    try {
      return resolvePartnerInIndex(partnersById, id);
    } catch {
      return null;
    }
  };
  return (
    <>
      {toast && <Toast message={toast} onDismiss={() => setToast("")} />}
      <ConfirmDialog
        open={Boolean(confirmation) && canCollaborateTodo(todo, actor) && ['open', 'in_progress'].includes(todo.status)}
        isSubmitting={actionSaving}
        title={confirmation?.title || ""}
        message={confirmation?.message || ""}
        cancelLabel={confirmation?.type === "complete" ? "Nein" : "Abbrechen"}
        confirmLabel={
          confirmation?.type === "complete" ? "Ja, erledigen" : "Bestätigen"
        }
        variant={confirmation?.type === "withdraw" ? "danger" : "primary"}
        onCancel={() => setConfirmation(null)}
        onConfirm={confirmAction}
      />
      <div className="todo-detail-navigation">
        <BackLink to="/todos" />
        <TodoActions
          actor={actor}
          pending={actionSaving}
          editable={editable}
          onAction={handleAction}
          todo={todo}
        />
      </div>
      <div className="todo-detail-page">
        <header className="todo-detail-header">
          <div className="todo-detail-header__title">
            <h2>{todo.title}</h2>
            {canManageSections && (
              <TranslatedProps sources={{"title":"Titel bearbeiten","aria-label":"Titel bearbeiten"}}><button
                className="todo-detail-section-edit"
                type="button"
                onClick={() => openQuickEdit("content")}
                title="Titel bearbeiten"
                aria-label="Titel bearbeiten"
              >
                <EditIcon size={14} />
              </button></TranslatedProps>
            )}
            <span className={`todo-status todo-status--${todoStatus(todo)}`}>
              <StaticText source={TODO_STATUS[todoStatus(todo)] || "—"} />
            </span>
          </div>
        </header>
        {error && <p className="form-error">{<StaticText source={error} />}</p>}
        {directoryError && <p className="form-error" role="status">{directoryError}</p>}
        {quickEditing && canManageSections && (quickEditing.section !== 'responsibility' || canManageAudience) && (
          <TodoQuickEditModal
            key={quickEditing.section}
            canViewDamageCases={canViewDamageCases}
            canViewInsolvencies={canViewInsolvencies}
            canViewTransportOrders={canViewTransportOrders}
            currentUserId={user.uid}
            damageCases={damageCases}
            insolvencies={insolvencies}
            partners={partners}
            section={quickEditing.section}
            suspended={Boolean(confirmation)}
            recipientsAvailable={directoryReady}
            todo={quickEditing.todo}
            users={activeUsers}
            onCancel={() => setQuickEditing(null)}
            onSubmit={saveQuickEdit}
          />
        )}
        <div className="todo-detail-layout">
          <main className="todo-detail-main">
            <section className="todo-detail-content">
              <DetailSectionHeading
                onEdit={
                  canManageSections ? () => openQuickEdit("content") : null
                }
              >
                <StaticText source={"Beschreibung"} />
              </DetailSectionHeading>
              <p className="todo-detail-description">
                {todo.description || <StaticText source={"Keine Beschreibung hinterlegt."} />}
              </p>
            </section>
            <TodoDeadlinesCard todo={todo} users={activeUsers} todoId={todo.id} refreshKey={reminderTimestampKey(todo.updatedAt)} canEdit={canManageSections && directoryReady} deadlines={deadlines} loading={deadlinesLoading} onDelete={deleteDeadline} onSave={saveDeadline} />
            <section
              className="todo-updates"
              aria-labelledby="todo-updates-title"
            >
              <div className="todo-updates__heading">
                <h3 id="todo-updates-title"><StaticText source={"Updates zum To-do"} /></h3>
                <span>{caseUpdates.length}</span>
              </div>
              {canManageSections && (
                <form className="todo-updates__form" onSubmit={saveNote}>
                  <TranslatedProps sources={{"aria-label":"Update zum To-do","placeholder":"Update hinzufügen …"}}><textarea
                    aria-label="Update zum To-do"
                    rows="2"
                    value={note}
                    maxLength="1000"
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Update hinzufügen …"
                  /></TranslatedProps>
                  <button
                    className="button"
                    type="submit"
                    disabled={noteSaving || !note.trim()}
                  >
                    {<StaticText source={noteSaving ? "Wird gespeichert …" : "Hinzufügen"} />}
                  </button>
                </form>
              )}
              {updatesLoading ? (
                <p className="todo-updates__empty"><StaticText source={"Updates werden geladen …"} /></p>
              ) : caseUpdates.length ? (
                <ol className="todo-updates__list">
                  {caseUpdates.map((update) => (
                    <li
                      key={update.id}
                      className="todo-updates__item todo-updates__item--note"
                    >
                      <div>
                        <strong>{update.createdByName}</strong>
                        <span>
                          Update · {formatTimestamp(update.createdAt)}
                        </span>
                      </div>
                      <p>{update.text}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="todo-updates__empty">
                  <StaticText source={"Noch keine Updates zum To-do."} />
                </p>
              )}
            </section>
            <section
              className="todo-updates todo-history"
              aria-labelledby="todo-history-title"
            >
              <div className="todo-updates__heading">
                <h3 id="todo-history-title"><StaticText source={"Historie"} /></h3>
                <span>{history.length}</span>
              </div>
              {updatesLoading ? (
                <p className="todo-updates__empty"><StaticText source={"Historie wird geladen …"} /></p>
              ) : history.length ? (
                <ol className="todo-updates__list">
                  {history.map((update) => (
                    <li
                      key={update.id}
                      className={`todo-updates__item todo-updates__item--${update.type}`}
                    >
                      <div>
                        <strong>{update.createdByName}</strong>
                        <span>
                          {update.type === "note" ? "Update" : "System"} ·{" "}
                          {formatTimestamp(update.createdAt)}
                        </span>
                      </div>
                      <p>{update.text}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="todo-updates__empty">
                  <StaticText source={"Noch keine Historieneinträge."} />
                </p>
              )}
            </section>
          </main>
          <aside className="todo-detail-sidebar">
            <section>
              <DetailSectionHeading
                onEdit={
                  canManageSections ? () => openQuickEdit("schedule") : null
                }
              >
                <StaticText source={"Terminierung"} />
              </DetailSectionHeading>
              <dl>
                <Detail label="Wichtigkeit"><TodoPriority priority={todoPriority(todo)} /></Detail>
                <TranslatedProps sources={{"label":"Fällig am"}}><Detail label="Fällig am">
                  <span className={dueClass(todo)}>
                    {formatDate(todo.dueDate)}
                  </span>
                </Detail></TranslatedProps>
                <Detail label="Mail-Erinnerung">
                  {formatDate(todo.reminderDate)}{todo.reminderTime ? ` · ${todo.reminderTime} (Berlin)` : ""}
                </Detail>
              </dl>
              <ReminderStatus sourcePath={`todos/${todo.id}`} enabled={Boolean(todo.reminderDate)} configured={Boolean(todo.reminderDate || todo.reminderTime)} recipientRule="todo" refreshKey={reminderTimestampKey(todo.updatedAt)} />
            </section>
            <section>
              <DetailSectionHeading
                onEdit={
                  canManageAudience
                    ? () => openQuickEdit("responsibility")
                    : null
                }
              >
                <StaticText source={"Beteiligte"} />
              </DetailSectionHeading>
              <p className="todo-detail-participants">{todo.audienceLabel || '—'}</p>
            </section>
            <section>
              <DetailSectionHeading
                onEdit={
                  canManageSections ? () => openQuickEdit("links") : null
                }
              >
                <StaticText source={"Verknüpfungen"} />
              </DetailSectionHeading>
              <dl>
                <TranslatedProps sources={{"label":"Kunde"}}><Detail label="Kunde">
                  {todo.customerId && canViewMasterData ? (
                    <Link
                      to={businessPartnerDetailPath(
                        todo.customerId,
                      )}
                    >
                      {effectivePartner(todo.customerId)?.companyName ||
                        todo.customerName ||
                        <StaticText source={"Kunde öffnen"} />}
                    </Link>
                  ) : (
                    todo.customerName
                  )}
                </Detail></TranslatedProps>
                <TranslatedProps sources={{"label":"Unternehmer"}}><Detail label="Unternehmer">
                  {todo.carrierId && canViewMasterData ? (
                    <Link
                      to={businessPartnerDetailPath(
                        todo.carrierId,
                      )}
                    >
                      {effectivePartner(todo.carrierId)?.companyName ||
                        todo.carrierName ||
                        <StaticText source={"Unternehmer öffnen"} />}
                    </Link>
                  ) : (
                    todo.carrierName
                  )}
                </Detail></TranslatedProps>
                <TranslatedProps sources={{"label":"Schadenfall"}}><Detail label="Schadenfall">
                  {linkedDamageCase ? (
                    <Link to={recordDetailPath('damage', linkedDamageCase.id)}>
                      {linkedDamageCaseLabel}
                    </Link>
                  ) : todo.damageCaseId ? (
                    <StaticText source="Schadenfall nicht verfügbar" />
                  ) : null}
                </Detail></TranslatedProps>
                <Detail label="Insolvenz">
                  {associatedInsolvency ? (
                    <Link to={insolvencyCasePath(associatedInsolvency.id)}>
                      {associatedInsolvencyLabel}
                    </Link>
                  ) : todo.insolvencyId ? (
                    <StaticText source="Insolvenz nicht verfügbar" />
                  ) : null}
                </Detail>
                {todo.legalDisputeId && <Detail label="Gericht / Streit">{canView('legalDisputes') ? <Link to={recordDetailPath('legalDispute', todo.legalDisputeId)}><StaticText source="Gericht-/Streitfall öffnen" /></Link> : <StaticText source="Kein Zugriff auf den verknüpften Fall" />}</Detail>}
                {todo.inkassoCaseId && <Detail label="Inkasso">{canView('inkasso') ? <Link to={recordDetailPath('inkasso', todo.inkassoCaseId)}><StaticText source="Inkassofall öffnen" /></Link> : <StaticText source="Kein Zugriff auf den verknüpften Fall" />}</Detail>}
                <TranslatedProps sources={{"label":"TA-Nummern"}}><Detail label="TA-Nummern">
                  {canViewTransportOrders && linkedTransportOrders.length
                    ? linkedTransportOrders.map((link, index) => (
                        <span key={link.id}>
                          {<StaticText source={index > 0 && ", "} />}
                          <ContextLink to={transportOrderPath(link.id)}>
                            TA {link.number || link.id}
                          </ContextLink>
                        </span>
                      ))
                    : null}
                </Detail></TranslatedProps>
              </dl>
            </section>
            <section className="todo-detail-system">
              <h3><StaticText source={"Systemdaten"} /></h3>
              <dl>
                <TranslatedProps sources={{"label":"Erstellt von"}}><Detail label="Erstellt von">{todo.creatorName}</Detail></TranslatedProps>
                <TranslatedProps sources={{"label":"Erstellt am"}}><Detail label="Erstellt am">
                  {formatTimestamp(todo.createdAt)}
                </Detail></TranslatedProps>
                <TranslatedProps sources={{"label":"Zuletzt aktualisiert"}}><Detail label="Zuletzt aktualisiert">
                  {formatTimestamp(todo.updatedAt)}
                </Detail></TranslatedProps>

                {todo.completedAt && (
                  <>
                    <Detail label="Erledigt am">
                      {formatTimestamp(todo.completedAt)}
                    </Detail>
                    <Detail label="Erledigt von">{todo.completedByName}</Detail>
                  </>
                )}
                {todo.withdrawnAt && (
                  <>
                    <Detail label="Zurückgezogen am">
                      {formatTimestamp(todo.withdrawnAt)}
                    </Detail>
                  </>
                )}
                {todo.withdrawnAt && (
                  <Detail label="Zurückgezogen von">
                    {todo.withdrawnByUserId}
                  </Detail>
                )}
              </dl>
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
