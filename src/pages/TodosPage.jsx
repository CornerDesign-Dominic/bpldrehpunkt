import { StaticText, TranslatedProps } from '../i18n/AutoTranslate.jsx'
import { useEffect, useMemo, useState } from "react";
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

function responsibilityLabel(todo) {
  if (todo.audienceType === "person") return todo.audienceId === todo.creatorUserId ? "Persönlich" : todo.audienceLabel || "Person";
  if (todo.audienceType === "department") return todo.audienceId || todo.audienceLabel || "Abteilung";
  if (todo.audienceType === "all") return "Alle";
  if (todo.audienceType === "people") return (todo.audienceIds || []).length > 1 ? "Personengruppe" : (todo.audienceLabel || "Person").replace(/^Personen:\s*/, "");
  return todo.audienceLabel || "—";
}

function transportOrderNumbers(todo) {
  const links = Array.isArray(todo.transportOrderLinks) && todo.transportOrderLinks.length
    ? todo.transportOrderLinks
    : todo.transportOrderId ? [{ id: todo.transportOrderId, number: todo.transportOrderNumber || todo.reference || todo.transportOrderId }] : [];
  return links.map((link) => String(link?.number || link?.id || "").trim()).filter(Boolean);
}

export default function TodosPage() {
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
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
  const filterOptions = useMemo(() => ({
    assignees: [...new Set(todos.map((todo) => todo.assignedUserName || "Noch nicht übernommen"))].sort((left, right) => left.localeCompare(right, "de")),
    creators: [...new Set(todos.map((todo) => todo.creatorName || "—"))].sort((left, right) => left.localeCompare(right, "de")),
    responsibilities: [...new Set(todos.map(responsibilityLabel))].sort((left, right) => left.localeCompare(right, "de")),
  }), [todos]);

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

  const todoGroups = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("de-DE");
    const visible = todos.filter((todo) => {
      const matchesStatus = filter === "all" || (filter === "active" ? ["open", "in_progress"].includes(todo.status) : todo.status === "completed");
      const matchesSearch = !needle || [todo.title, ...transportOrderNumbers(todo)].some((value) => value.toLocaleLowerCase("de-DE").includes(needle));
      return matchesStatus && matchesSearch
        && (!assigneeFilter || (todo.assignedUserName || "Noch nicht übernommen") === assigneeFilter)
        && (!creatorFilter || (todo.creatorName || "—") === creatorFilter)
        && (!responsibilityFilter || responsibilityLabel(todo) === responsibilityFilter)
        && (!priorityFilter || todo.priority === priorityFilter);
    });
    return {
      mine: sortTodosForGroup(
        visible.filter((todo) => todo.assignedUserId === user.uid),
        "mine",
      ),
      created: sortTodosForGroup(
        visible.filter(
          (todo) =>
            todo.creatorUserId === user.uid && !isSelfTodo(todo, user.uid),
        ),
        "created",
      ),
      // Übernommene Aufgaben bleiben für die berechtigte Zielgruppe sichtbar;
      // nur die Übernahmeaktion selbst verschwindet dann.
      pool: sortTodosForGroup(
        visible.filter(
          (todo) =>
            isAudienceMember(todo, actor) && !isSelfTodo(todo, user.uid),
        ),
        "pool",
      ),
    };
  }, [actor, assigneeFilter, creatorFilter, filter, priorityFilter, responsibilityFilter, search, todos, user.uid]);

  async function addTodo(values) {
    await createTodo(values, actor, usersById);
    await loadTodos();
    setToast("To-do gespeichert.");
  }

  async function saveEdit(values) {
    const audienceChanged = audienceHasChanged(editing.todo, values, user.uid);
    const resetAssignment = editing.reassign || audienceChanged;
    if (editing.todo.assignedUserId && resetAssignment) {
      setConfirmation({
        type: "save",
        values,
        title: "Übernahme zurücksetzen?",
        message:
          "Das To-do wurde bereits übernommen. Durch diese Änderung wird die Bearbeitung beendet und das To-do wieder geöffnet.",
      });
      return;
    }
    await performSave(values, resetAssignment);
  }

  async function performSave(values, resetAssignment) {
    await updateTodoByCreator(
      editing.todo,
      values,
      usersById,
      resetAssignment,
      actor,
    );
    await loadTodos();
    setEditing(null);
    setToast(
      resetAssignment
        ? "To-do neu zugewiesen und wieder geöffnet."
        : "To-do aktualisiert.",
    );
  }

  async function confirmAction() {
    try {
      if (confirmation.type === "save")
        await performSave(confirmation.values, true);
      if (confirmation.type === "withdraw") {
        await withdrawTodo(confirmation.todo.id, actor);
        await loadTodos();
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
          <label className="filter-field"><span><StaticText source={"Bearbeiter"} /></span><select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}><option value=""><StaticText source={"Alle Bearbeiter"} /></option>{filterOptions.assignees.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="filter-field"><span><StaticText source={"Erstellt von"} /></span><select value={creatorFilter} onChange={(event) => setCreatorFilter(event.target.value)}><option value=""><StaticText source={"Alle Ersteller"} /></option>{filterOptions.creators.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="filter-field"><span><StaticText source={"Zuständigkeit"} /></span><select value={responsibilityFilter} onChange={(event) => setResponsibilityFilter(event.target.value)}><option value=""><StaticText source={"Alle Zuständigkeiten"} /></option>{filterOptions.responsibilities.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="filter-field"><span><StaticText source={"Wichtigkeit"} /></span><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value=""><StaticText source={"Alle Wichtigkeiten"} /></option><option value="high"><StaticText source={"Hoch"} /></option><option value="medium"><StaticText source={"Mittel"} /></option><option value="low"><StaticText source={"Gering"} /></option></select></label>
        </div></TranslatedProps>
        {toast && <Toast message={toast} onDismiss={() => setToast("")} />}
        <ConfirmDialog
          open={Boolean(confirmation)}
          title={confirmation?.title || ""}
          message={confirmation?.message || ""}
          confirmLabel="Bestätigen"
          onCancel={() => setConfirmation(null)}
          onConfirm={confirmAction}
        />
        {showForm && (
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
        {editing && (
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
        {loading ? (
          <p className="todos-gallery__state"><StaticText source={"To-dos werden geladen …"} /></p>
        ) : (
          <div
            className={`todo-sections${view === "table" ? " todo-sections--table" : ""}`}
          >
            {[
              ["mine", "Meine Aufgaben"],
              ["created", "Von mir erstellt"],
              ["pool", "Aufgabenpool"],
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
