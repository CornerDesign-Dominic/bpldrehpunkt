import { reportTechnicalFailure } from '../lib/diagnostics.js'
import { canReadTodoForUser } from '../../shared/todoCollaboration.js'
import { subscribeCalendarRefresh } from '../lib/calendarRefresh.js'
import { presentCasePartnerReferences } from '../lib/partnerReferenceNames.js'
import PartnerReferenceWarning from '../components/business-partners/PartnerReferenceWarning.jsx'
import { responsibilityLabel, transportOrderNumbers } from '../lib/todoListPresentation.js'
import { StaticText, TranslatedProps } from '../i18n/AutoTranslate.jsx'
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import TodoForm from "../components/todos/TodoForm.jsx";
import TodosGallery from "../components/todos/TodosGallery.jsx";
import TodosTable from "../components/todos/TodosTable.jsx";
import { GridViewIcon, TableViewIcon } from "../components/icons.jsx";
import ConfirmDialog from "../components/ui/ConfirmDialog.jsx";
import Toast from "../components/ui/Toast.jsx";
import { useAuth } from "../auth/useAuth.js";
import { usePermissions } from "../auth/usePermissions.js";
import { useLanguage } from "../i18n/useLanguage.js";
import { localeForLanguage } from "../i18n/translations.js";
import {
  getUserDisplayName,
  listVisibleUserDirectory,
} from "../lib/userProfiles.js";
import { listBusinessPartners } from "../lib/businessPartners.js";
import {
  audienceHasChanged,
  createTodo,
  isAudienceMember,
  isSelfTodo,
  listTodosForActor,
  sortTodosForGroup,
  updateTodoByCreator,
  withdrawTodo,
} from "../lib/todos.js";

function formatDate(value, language) {
  return value
    ? new Intl.DateTimeFormat(localeForLanguage(language)).format(new Date(`${value}T12:00:00`))
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





export default function TodosPage() {
  const { user } = useAuth();
  return <TodosContent key={user?.uid || ''} />;
}

function TodosContent() {
  const { language } = useLanguage();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { canEdit, canView } = usePermissions();
  const actor = useMemo(() => ({ user, profile }), [profile, user]);
  const [todos, setTodos] = useState([]);
  const [users, setUsers] = useState([]);
  const [partners, setPartners] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [actionSaving, setActionSaving] = useState(false);
  const actionPending = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [creatorFilter, setCreatorFilter] = useState("");
  const [responsibilityFilter, setResponsibilityFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [view, setView] = useState(() =>
    window.localStorage.getItem("todos-view") === "grid" ? "grid" : "table",
  );
  const editable = canEdit("todos");
  const canViewMasterData = canView("masterData");
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
  const readableTodos = useMemo(() => todos.filter((todo) => canReadTodoForUser(todo, user?.uid, profile)), [todos, user, profile]);
  const filterOptions = useMemo(() => ({
    creators: [...new Set(readableTodos.map((todo) => todo.creatorName || "—"))].sort((left, right) => left.localeCompare(right, "de")),
    responsibilities: [...new Set(readableTodos.map(responsibilityLabel))].sort((left, right) => left.localeCompare(right, "de")),
  }), [readableTodos]);

  useEffect(() => {
    window.localStorage.setItem("todos-view", view);
  }, [view]);

  async function loadTodos() {
    setTodos(await listTodosForActor(actor));
  }

  useEffect(() => {
    let current = true;
    Promise.all([
      listTodosForActor(actor),
      editable ? listVisibleUserDirectory() : Promise.resolve([]),
      canViewMasterData ? listBusinessPartners() : Promise.resolve([]),
    ])
      .then(([entries, profiles, businessPartners]) => {
        if (current) {
          setTodos(entries);
          setUsers(profiles);
          setPartners(businessPartners);
        }
      })
      .catch(() => {
        if (current)
          setError(
            "Die To-dos konnten nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.",
          );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [actor, canViewMasterData, editable]);

  useEffect(() => {
    if (editable) return undefined;
    let current = true;
    queueMicrotask(() => { if (current) { setShowForm(false); setEditing(null); setConfirmation(null); } });
    return () => { current = false; };
  }, [editable]);

  useEffect(() => {
    let current = true;
    const stop = subscribeCalendarRefresh({ window, document, onRefresh: () => {
      listTodosForActor(actor).then((entries) => { if (current) setTodos(entries); }).catch((loadError) => {
        if (current) { setTodos([]); setError('Die To-dos konnten nicht aktualisiert werden. Bitte erneut laden.'); }
        void reportTechnicalFailure({ module: 'todos', stage: 'load', error: loadError });
      });
    } });
    return () => { current = false; stop(); };
  }, [actor]);

  const displayedTodos = useMemo(() => presentCasePartnerReferences(readableTodos, 'todo', partners, canViewMasterData), [readableTodos, partners, canViewMasterData]);
  const todoGroups = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("de-DE");
    const visible = displayedTodos.filter((todo) => {
      const matchesStatus = filter === "all" || (filter === "active" ? ["open", "in_progress"].includes(todo.status) : todo.status === "completed");
      const matchesSearch = !needle || [todo.title, todo.partnerSearchText, ...transportOrderNumbers(todo)].some((value) => value.toLocaleLowerCase("de-DE").includes(needle));
      return matchesStatus && matchesSearch
        && (!creatorFilter || (todo.creatorName || "—") === creatorFilter)
        && (!responsibilityFilter || responsibilityLabel(todo) === responsibilityFilter)
        && (!priorityFilter || todo.priority === priorityFilter);
    });
    return {
      mine: sortTodosForGroup(
        visible.filter((todo) => ['person', 'people'].includes(todo.audienceType) && isAudienceMember(todo, actor)),
        "mine",
      ),
      created: sortTodosForGroup(
        visible.filter(
          (todo) =>
            todo.creatorUserId === user.uid && !isSelfTodo(todo, user.uid),
        ),
        "created",
      ),
      pool: sortTodosForGroup(
        visible.filter(
          (todo) =>
            ['all', 'department'].includes(todo.audienceType) && isAudienceMember(todo, actor),
        ),
        "pool",
      ),
    };
  }, [actor, creatorFilter, filter, priorityFilter, responsibilityFilter, search, displayedTodos, user.uid]);

  async function refreshAfterWrite() {
    try { await loadTodos(); }
    catch (loadError) {
      setError(language === 'en' ? 'Change saved. The current tasks could not be reloaded. Please reload the page.' : 'Änderung gespeichert. Die aktuellen To-dos konnten nicht neu geladen werden. Bitte die Seite neu laden.');
      void reportTechnicalFailure({ module: 'website', stage: 'other', error: loadError });
    }
  }

  async function addTodo(values) {
    await createTodo(values, actor, usersById);
    await refreshAfterWrite();
    setToast("To-do gespeichert.");
  }

  async function saveEdit(values) {
    const audienceChanged = audienceHasChanged(editing.todo, values, user.uid);
    if (audienceChanged) {
      setConfirmation({
        type: "save",
        values,
        title: "Beteiligte ändern?",
        message:
          "Entfernte Personen verlieren den Zugriff. Ihre Kalendereinträge und Erinnerungen entfallen. Empfängerauswahlen werden auf verbleibende Beteiligte begrenzt.",
      });
      return { pendingConfirmation: true };
    }
    await performSave(values);
  }

  async function performSave(values) {
    await updateTodoByCreator(
      editing.todo,
      values,
      usersById,
      false,
      actor,
    );
    await refreshAfterWrite();
    setEditing(null);
    setToast('To-do aktualisiert.');
  }

  async function confirmAction() {
    if (actionPending.current) return;
    actionPending.current = true;
    setActionSaving(true);
    try {
      if (confirmation.type === "save")
        await performSave(confirmation.values);
      if (confirmation.type === "withdraw") {
        await withdrawTodo(confirmation.todo.id, actor);
        await refreshAfterWrite();
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

  return (
    <>
      <div className="list-toolbar todo-toolbar">
        <TranslatedProps sources={{"aria-label":"Ansicht auswählen"}}><div className="todo-view-switcher" aria-label="Ansicht auswählen">
          <TranslatedProps sources={{"title":"Card-Ansicht","aria-label":"Card-Ansicht"}}><button
            className={
              view === "grid"
                ? "todo-view-switcher__button todo-view-switcher__button--active"
                : "todo-view-switcher__button"
            }
            type="button"
            title="Card-Ansicht"
            aria-label="Card-Ansicht"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
          >
            <GridViewIcon />
          </button></TranslatedProps>
          <TranslatedProps sources={{"title":"Tabellenansicht","aria-label":"Tabellenansicht"}}><button
            className={
              view === "table"
                ? "todo-view-switcher__button todo-view-switcher__button--active"
                : "todo-view-switcher__button"
            }
            type="button"
            title="Tabellenansicht"
            aria-label="Tabellenansicht"
            aria-pressed={view === "table"}
            onClick={() => setView("table")}
          >
            <TableViewIcon />
          </button></TranslatedProps>
        </div></TranslatedProps>
        <TranslatedProps sources={{"aria-label":"To-dos filtern"}}><div className="todo-tabs" role="tablist" aria-label="To-dos filtern">
          <button
            className={`todo-tabs__tab ${filter === "active" ? "todo-tabs__tab--active" : ""}`}
            type="button"
            role="tab"
            aria-selected={filter === "active"}
            onClick={() => setFilter("active")}
          >
            <StaticText source={"Aktiv"} />
          </button>
          <button
            className={`todo-tabs__tab ${filter === "completed" ? "todo-tabs__tab--active" : ""}`}
            type="button"
            role="tab"
            aria-selected={filter === "completed"}
            onClick={() => setFilter("completed")}
          >
            <StaticText source={"Erledigt"} />
          </button>
          <button
            className={`todo-tabs__tab ${filter === "all" ? "todo-tabs__tab--active" : ""}`}
            type="button"
            role="tab"
            aria-selected={filter === "all"}
            onClick={() => setFilter("all")}
          >
            <StaticText source={"Alle"} />
          </button>
        </div></TranslatedProps>
        {editable && (
          <button
            className="button"
            type="button"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            <StaticText source={"To-do anlegen"} />
          </button>
        )}
      </div>
      <div className="todos-page">
        <TranslatedProps sources={{"aria-label":"To-dos durchsuchen und filtern"}}><div className="todo-filter-bar" aria-label="To-dos durchsuchen und filtern">
          <label className="search-field todo-filter-bar__search"><span className="sr-only"><StaticText source={"To-dos durchsuchen"} /></span><TranslatedProps sources={{"placeholder":"Aufgabe oder TA-Nummer suchen"}}><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Aufgabe oder TA-Nummer suchen" /></TranslatedProps></label>
          <label className="filter-field"><span><StaticText source={"Erstellt von"} /></span><select value={creatorFilter} onChange={(event) => setCreatorFilter(event.target.value)}><option value=""><StaticText source={"Alle Ersteller"} /></option>{filterOptions.creators.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="filter-field"><span><StaticText source={"Beteiligte"} /></span><select value={responsibilityFilter} onChange={(event) => setResponsibilityFilter(event.target.value)}><option value=""><StaticText source={"Alle Beteiligten"} /></option>{filterOptions.responsibilities.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="filter-field"><span><StaticText source={"Wichtigkeit"} /></span><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value=""><StaticText source={"Alle Wichtigkeiten"} /></option><option value="high"><StaticText source={"Hoch"} /></option><option value="medium"><StaticText source={"Mittel"} /></option><option value="low"><StaticText source={"Gering"} /></option></select></label>
        </div></TranslatedProps>
        {toast && <Toast message={toast} onDismiss={() => setToast("")} />}
        <ConfirmDialog
          open={editable && Boolean(confirmation)}
          isSubmitting={actionSaving}
          title={confirmation?.title || ""}
          message={confirmation?.message || ""}
          confirmLabel="Bestätigen"
          onCancel={() => setConfirmation(null)}
          onConfirm={confirmAction}
        />
        {showForm && editable && (
          <div
            className="todo-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setShowForm(false);
            }}
          >
            <TranslatedProps sources={{"aria-label":"To-do anlegen"}}><section
              className="todo-form-modal"
              role="dialog"
              aria-modal="true"
              aria-label="To-do anlegen"
            >
              <TodoForm
                key="new"
                canViewTransportOrders={canViewTransportOrders}
                currentUserId={user.uid}
                partners={partners}
                users={activeUsers}
                onCancel={() => setShowForm(false)}
                onSubmit={addTodo}
              />
            </section></TranslatedProps>
          </div>
        )}
        {editing && editable && (
          <TodoForm
            key={editing.todo.id}
            canViewTransportOrders={canViewTransportOrders}
            currentUserId={user.uid}
            initialTodo={editing.todo}
            partners={partners}
            users={activeUsers}
            onCancel={() => setEditing(null)}
            onSubmit={saveEdit}
          />
        )}
        {error && <p className="form-error">{<StaticText source={error} />}</p>}
        <PartnerReferenceWarning records={displayedTodos} />
        {loading ? (
          <p className="todos-gallery__state"><StaticText source={"To-dos werden geladen …"} /></p>
        ) : (
          <div
            className={`todo-sections${view === "table" ? " todo-sections--table" : ""}`}
          >
            {[
              ["mine", "Meine Aufgaben"],
              ["created", "Von mir erstellt"],
              ["pool", "Gemeinsame Aufgaben"],
            ].map(([key, title]) => (
              <section
                className={`todo-section${view === "table" ? " todo-section--table" : ""}`}
                key={key}
              >
                <div className="todo-section__heading">
                  <h2><StaticText source={title} /></h2>
                  <span>{todoGroups[key].length}</span>
                </div>
                {view === "grid" ? (
                  <TodosGallery
                    todos={todoGroups[key]}
                    formatDate={(value) => formatDate(value, language)}
                    getDueClass={dueClass}
                    onOpen={(todo) => navigate(`/todos/${todo.id}`)}
                  />
                ) : (
                  <TodosTable
                    todos={todoGroups[key]}
                    formatDate={(value) => formatDate(value, language)}
                    onOpen={(todo) => navigate(`/todos/${todo.id}`)}
                  />
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
