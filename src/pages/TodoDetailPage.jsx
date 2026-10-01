import { StaticText, TranslatedProps } from '../i18n/AutoTranslate.jsx'
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TodoQuickEditModal from "../components/todos/TodoQuickEditModal.jsx";
import TodoDeadlinesCard from "../components/todos/TodoDeadlinesCard.jsx";
import { TodoPriority } from "../components/todos/TodoPriority.jsx";
import ConfirmDialog from "../components/ui/ConfirmDialog.jsx";
import BackLink from "../components/ui/BackLink.jsx";
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
  assignTodoToCurrentUser,
  addTodoNote,
  audienceHasChanged,
  completeTodoForCurrentUser,
  createTodoDeadline,
  deleteTodoDeadline,
  getTodoById,
  isAudienceMember,
  listTodoUpdates,
  listTodoDeadlines,
  reactivateTodoForCurrentUser,
  releaseTodoFromCurrentUser,
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
  const labels = {
    Zielgruppe: "Zugewiesen an",
    "Aktueller Bearbeiter": "In Bearbeitung durch",
  };
  return (
    <div>
      <dt>{labels[label] || label}</dt>
      <dd>{children || "—"}</dd>
    </div>
  );
}

function DetailSectionHeading({ children, onEdit }) {
  return (
    <div className="todo-detail-section-heading">
      <h3>{children}</h3>
      {onEdit && (
        <button
          className="todo-detail-section-edit"
          type="button"
          onClick={onEdit}
          title={`${children} bearbeiten`}
          aria-label={`${children} bearbeiten`}
        >
          <EditIcon size={14} />
        </button>
      )}
    </div>
  );
}

function TodoActions({ actor, editable, onAction, todo }) {
  const status = todoStatus(todo);
  const isAssignee = todo.assignedUserId === actor.user.uid;
  const canTake =
    editable &&
    status === "open" &&
    !todo.assignedUserId &&
    isAudienceMember(todo, actor);
  const canReactivate = editable && status === "completed" && isAssignee;
  if (!editable) return null;
  return (
    <div className="todo-detail-actions">
      {canTake && (
        <button
          className="button"
          type="button"
          onClick={() => onAction("assign", todo)}
        >
          <StaticText source={"Aufgabe annehmen"} />
        </button>
      )}
      {isAssignee && status === "in_progress" && (
        <button
          className="button"
          type="button"
          onClick={() => onAction("complete", todo)}
        >
          <StaticText source={"Erledigen"} />
        </button>
      )}
      {canReactivate && (
        <button
          className="button"
          type="button"
          onClick={() => onAction("reactivate", todo)}
        >
          <StaticText source={"Reaktivieren"} />
        </button>
      )}
    </div>
  );
}

export default function TodoDetailPage() {
  const { todoId } = useParams();
  const { user, profile } = useAuth();
  const { canEdit, canView } = usePermissions();
  const actor = useMemo(() => ({ user, profile }), [profile, user]);
  const [result, setResult] = useState(null);
  const [users, setUsers] = useState([]);
  const [partners, setPartners] = useState([]);
  const [damageCases, setDamageCases] = useState([]);
  const [insolvencies, setInsolvencies] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [deadlines, setDeadlines] = useState([]);
  const [deadlinesLoading, setDeadlinesLoading] = useState(true);
  const [updatesLoading, setUpdatesLoading] = useState(true);
  const [note, setNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [quickEditing, setQuickEditing] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
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

  async function loadTodo() {
    const [todo, todoUpdates, todoDeadlines] = await Promise.all([
      getTodoById(todoId),
      listTodoUpdates(todoId),
      listTodoDeadlines(todoId),
    ]);
    setResult({ todo, error: todo ? "" : "Aufgabe nicht gefunden." });
    setUpdates(todoUpdates);
    setDeadlines(todoDeadlines);
    setUpdatesLoading(false);
    setDeadlinesLoading(false);
  }

  useEffect(() => {
    let current = true;
    Promise.all([
      getTodoById(todoId),
      listTodoUpdates(todoId),
      listTodoDeadlines(todoId),
      editable ? listVisibleUserDirectory() : Promise.resolve([]),
      canViewMasterData ? listBusinessPartners() : Promise.resolve([]),
      canViewDamageCases ? listDamageCases() : Promise.resolve([]),
      canViewInsolvencies ? listInsolvencies() : Promise.resolve([]),
    ])
      .then(
        ([
          todo,
          todoUpdates,
          todoDeadlines,
          profiles,
          businessPartners,
          cases,
          insolvencyEntries,
        ]) => {
          if (current) {
            setResult({ todo, error: todo ? "" : "Aufgabe nicht gefunden." });
            setUpdates(todoUpdates);
            setDeadlines(todoDeadlines);
            setUpdatesLoading(false);
            setDeadlinesLoading(false);
            setUsers(profiles);
            setPartners(businessPartners);
            setDamageCases(cases);
            setInsolvencies(insolvencyEntries);
          }
        },
      )
      .catch((loadError) => {
        if (current) {
          setResult({
            todo: null,
            error:
              loadError.code === "permission-denied"
                ? "Kein Zugriff auf diese Aufgabe."
                : "Aufgabe nicht gefunden.",
          });
          setUpdatesLoading(false);
          setDeadlinesLoading(false);
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
  ]);

  async function saveQuickEdit(values, options = {}) {
    const todo = result.todo;
    const audienceChanged = audienceHasChanged(todo, values, user.uid);
    const resetAssignment = audienceChanged || options.releaseAssignment;
    if (todo.assignedUserId && resetAssignment) {
      setConfirmation({
        type: "quick-save",
        values,
        title: "Übernahme zurücksetzen?",
        message:
          "Das To-do wurde bereits übernommen. Durch diese Änderung wird die Bearbeitung beendet und das To-do wieder geöffnet.",
      });
      return;
    }
    await persistQuickEdit(values, resetAssignment);
  }

  async function persistQuickEdit(values, resetAssignment) {
    await updateTodoByCreator(
      result.todo,
      values,
      usersById,
      resetAssignment,
      actor,
    );
    await loadTodo();
    setQuickEditing(null);
    setToast(
      resetAssignment
        ? "To-do neu zugewiesen und wieder geöffnet."
        : "To-do aktualisiert.",
    );
  }

  async function handleAction(action, todo) {
    setError("");
    if (action === "complete") {
      setConfirmation({
        type: "complete",
        todo,
        title: "To-do als erledigt ablegen?",
        message:
          "Die Aufgabe wird als erledigt markiert und kann anschließend nicht mehr bearbeitet werden.",
      });
      return;
    }
    if (action === "withdraw" && todo.assignedUserId) {
      setConfirmation({
        type: "withdraw",
        todo,
        title: "To-do zurückziehen?",
        message:
          "Die laufende Bearbeitung wird beendet. Das To-do bleibt zur Nachvollziehbarkeit gespeichert.",
      });
      return;
    }
    try {
      if (action === "assign") await assignTodoToCurrentUser(todo.id, actor);
      if (action === "release")
        await releaseTodoFromCurrentUser(todo.id, actor);
      if (action === "reactivate")
        await reactivateTodoForCurrentUser(todo.id, actor);
      if (action === "withdraw") await withdrawTodo(todo.id, actor);
      await loadTodo();
      setToast(
        {
          assign: "Aufgabe angenommen.",
          release: "Bearbeitung freigegeben.",
          reactivate: "To-do reaktiviert.",
          complete: "To-do erledigt.",
          withdraw: "To-do zurückgezogen.",
        }[action],
      );
    } catch (actionError) {
      setError(
        actionError.message || "Die Änderung konnte nicht gespeichert werden.",
      );
    }
  }

  async function confirmAction() {
    try {
      if (confirmation.type === "quick-save")
        await persistQuickEdit(confirmation.values, true);
      if (confirmation.type === "complete") {
        await completeTodoForCurrentUser(confirmation.todo.id, actor);
        await loadTodo();
        setToast("To-do erledigt.");
      }
      if (confirmation.type === "withdraw") {
        await withdrawTodo(confirmation.todo.id, actor);
        await loadTodo();
        setToast("To-do zurückgezogen.");
      }
      setConfirmation(null);
    } catch (actionError) {
      setConfirmation(null);
      setError(
        actionError.message || "Die Änderung konnte nicht gespeichert werden.",
      );
    }
  }

  async function saveNote(event) {
    event.preventDefault();
    setError("");
    setNoteSaving(true);
    try {
      await addTodoNote(todoId, note, actor);
      setNote("");
      await loadTodo();
      setToast("Hinweis hinzugefügt.");
    } catch (noteError) {
      setError(
        noteError.message || "Der Hinweis konnte nicht gespeichert werden.",
      );
    } finally {
      setNoteSaving(false);
    }
  }

  async function saveDeadline(existingDeadline, values) {
    setError("");
    try {
      if (existingDeadline)
        await updateTodoDeadline(result.todo, existingDeadline, values, actor);
      else await createTodoDeadline(result.todo, values, actor);
      await loadTodo();
      setToast(
        existingDeadline ? "Termin aktualisiert." : "Termin hinzugefügt.",
      );
    } catch (saveError) {
      setError(
        saveError.message || "Der Termin konnte nicht gespeichert werden.",
      );
      throw saveError;
    }
  }

  async function deleteDeadline(deadline) {
    setError("");
    try {
      await deleteTodoDeadline(result.todo, deadline, actor);
      await loadTodo();
      setToast("Termin gelöscht.");
    } catch (deleteError) {
      setError(
        deleteError.message || "Der Termin konnte nicht gelöscht werden.",
      );
      throw deleteError;
    }
  }

  if (!result) return <p className="page-state"><StaticText source={"Aufgabe wird geladen …"} /></p>;
  if (result.error)
    return (
      <section className="todo-detail-empty">
        <h2>{result.error}</h2>
        <BackLink to="/todos" />
      </section>
    );

  const { todo } = result;
  const caseUpdates = updates.filter((update) => update.type === "note");
  const history = updates.filter((update) => update.type === "system");
  const canManageSections =
    editable &&
    (profile?.role === "superadmin" || todo.creatorUserId === user.uid) &&
    ["open", "in_progress"].includes(todo.status);
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
        open={Boolean(confirmation)}
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
                onClick={() => setQuickEditing("content")}
                title="Titel bearbeiten"
                aria-label="Titel bearbeiten"
              >
                <EditIcon size={14} />
              </button></TranslatedProps>
            )}
            <span className={`todo-status todo-status--${todoStatus(todo)}`}>
              {TODO_STATUS[todoStatus(todo)] || "—"}
            </span>
          </div>
        </header>
        {error && <p className="form-error">{<StaticText source={error} />}</p>}
        {quickEditing && (
          <TodoQuickEditModal
            key={quickEditing}
            canViewDamageCases={canViewDamageCases}
            canViewInsolvencies={canViewInsolvencies}
            canViewTransportOrders={canViewTransportOrders}
            currentUserId={user.uid}
            damageCases={damageCases}
            insolvencies={insolvencies}
            partners={partners}
            section={quickEditing}
            todo={todo}
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
                  canManageSections ? () => setQuickEditing("content") : null
                }
              >
                <StaticText source={"Beschreibung"} />
              </DetailSectionHeading>
              <p className="todo-detail-description">
                {todo.description || <StaticText source={"Keine Beschreibung hinterlegt."} />}
              </p>
            </section>
            <TodoDeadlinesCard canEdit={canManageSections} deadlines={deadlines} loading={deadlinesLoading} onDelete={deleteDeadline} onSave={saveDeadline} />
            <section
              className="todo-updates"
              aria-labelledby="todo-updates-title"
            >
              <div className="todo-updates__heading">
                <h3 id="todo-updates-title"><StaticText source={"Updates zum Fall"} /></h3>
                <span>{caseUpdates.length}</span>
              </div>
              {canView("todos") && (
                <form className="todo-updates__form" onSubmit={saveNote}>
                  <TranslatedProps sources={{"aria-label":"Update zum Fall","placeholder":"Update zum Fall hinzufügen …"}}><textarea
                    aria-label="Update zum Fall"
                    rows="2"
                    value={note}
                    maxLength="1000"
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Update zum Fall hinzufügen …"
                  /></TranslatedProps>
                  <button
                    className="button"
                    type="submit"
                    disabled={noteSaving || !note.trim()}
                  >
                    {<StaticText source={noteSaving ? "Wird gespeichert …" : "Update hinzufügen"} />}
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
                  <StaticText source={"Noch keine Updates zum Fall."} />
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
                  canManageSections ? () => setQuickEditing("schedule") : null
                }
              >
                <StaticText source={"Priorität"} />
              </DetailSectionHeading>
              <TodoPriority priority={todoPriority(todo)} />
              <dl>
                <TranslatedProps sources={{"label":"Fällig am"}}><Detail label="Fällig am">
                  <span className={dueClass(todo)}>
                    {formatDate(todo.dueDate)}
                  </span>
                </Detail></TranslatedProps>
                <TranslatedProps sources={{"label":"Erinnerung am"}}><Detail label="Erinnerung am">
                  {formatDate(todo.reminderDate)}
                </Detail></TranslatedProps>
              </dl>
            </section>
            <section>
              <DetailSectionHeading
                onEdit={
                  canManageSections
                    ? () => setQuickEditing("responsibility")
                    : null
                }
              >
                <StaticText source={"Zuständigkeit"} />
              </DetailSectionHeading>
              <dl>
                <Detail label="Zielgruppe">{todo.audienceLabel}</Detail>
                <Detail label="Aktueller Bearbeiter">
                  {todo.assignedUserName || <StaticText source={"Noch nicht übernommen"} />}
                </Detail>
              </dl>
            </section>
            <section>
              <DetailSectionHeading
                onEdit={
                  canManageSections ? () => setQuickEditing("links") : null
                }
              >
                <StaticText source={"Verknüpfungen"} />
              </DetailSectionHeading>
              <dl>
                <TranslatedProps sources={{"label":"Kunde"}}><Detail label="Kunde">
                  {todo.customerId && canViewMasterData ? (
                    <Link
                      to={businessPartnerDetailPath(
                        effectivePartner(todo.customerId)?.id ||
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
                        effectivePartner(todo.carrierId)?.id || todo.carrierId,
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
                    <Link to={`/schaeden/${linkedDamageCase.id}`}>
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
                <TranslatedProps sources={{"label":"TA-Nummern"}}><Detail label="TA-Nummern">
                  {linkedTransportOrders.length
                    ? linkedTransportOrders.map((link, index) => (
                        <span key={link.id}>
                          {<StaticText source={index > 0 && ", "} />}
                          <Link to={transportOrderPath(link.id)}>
                            TA {link.number || link.id}
                          </Link>
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
                <Detail label="Übernommen am">
                  {formatTimestamp(todo.assignedAt)}
                </Detail>
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
