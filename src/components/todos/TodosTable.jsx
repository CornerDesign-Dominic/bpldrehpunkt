import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useMemo, useState } from "react";
import {
  TODO_STATUS,
  todoDuePresentation,
  todoPriority,
  todoStatus,
} from "../../lib/todos.js";
import { TodoPriority } from "./TodoPriority.jsx";

const STATUS_ORDER = { open: 0, in_progress: 1, completed: 2, withdrawn: 3 };
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

function StatusChip({ status }) {
  return (
    <span className={`todo-status todo-status--${status}`}>
      {TODO_STATUS[status] || "—"}
    </span>
  );
}
function responsibilityLabel(todo) {
  if (todo.audienceType === "person")
    return todo.audienceId === todo.creatorUserId
      ? "Persönlich"
      : todo.audienceLabel || "Person";
  if (todo.audienceType === "department")
    return todo.audienceId || todo.audienceLabel || "Abteilung";
  if (todo.audienceType === "all") return "Alle";
  if (todo.audienceType === "people")
    return (todo.audienceIds || []).length > 1
      ? "Personengruppe"
      : (todo.audienceLabel || "Person").replace(/^Personen:\s*/, "");
  return todo.audienceLabel || "—";
}

function transportOrderNumbers(todo) {
  const links = Array.isArray(todo.transportOrderLinks) && todo.transportOrderLinks.length
    ? todo.transportOrderLinks
    : todo.transportOrderId ? [{ id: todo.transportOrderId, number: todo.transportOrderNumber || todo.reference || todo.transportOrderId }] : [];
  return links.map((link) => String(link?.number || link?.id || "").trim()).filter(Boolean);
}

function TransportOrderCell({ todo }) {
  const numbers = transportOrderNumbers(todo);
  if (!numbers.length) return "—";
  return <span className="todos-table__transport-orders" title={numbers.map((number) => `TA ${number}`).join(", ")}><span>TA {numbers[0]}</span>{numbers.length > 1 && <small>+{numbers.length - 1}</small>}</span>;
}

function compareValues(left, right) {
  if (typeof left === "number" && typeof right === "number")
    return left - right;
  return String(left || "").localeCompare(String(right || ""), "de", {
    sensitivity: "base",
  });
}

function sortValue(todo, key) {
  if (key === "status")
    return STATUS_ORDER[todoStatus(todo)] ?? Number.MAX_SAFE_INTEGER;
  if (key === "title") return todo.title;
  if (key === "transportOrder") return transportOrderNumbers(todo)[0] || "";
  if (key === "priority")
    return PRIORITY_ORDER[todoPriority(todo)] ?? Number.MAX_SAFE_INTEGER;
  if (key === "dueDate") return todo.dueDate || "9999-12-31";
  if (key === "assignee")
    return todo.assignedUserName || "Noch nicht übernommen";
  if (key === "creator") return todo.creatorName || "";
  if (key === "responsibility") return responsibilityLabel(todo);
  return "";
}

function SortableHeader({ activeSort, label, onSort, sortKey }) {
  const active = activeSort.key === sortKey;
  const direction = active ? activeSort.direction : "none";
  return (
    <th
      aria-sort={
        direction === "asc"
          ? "ascending"
          : direction === "desc"
            ? "descending"
            : "none"
      }
    >
      <button
        className="table-sort-button"
        type="button"
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        <span
          className="table-sort-button__indicator"
          data-direction={direction}
          aria-hidden="true"
        />
        <span className="sr-only">
          {<StaticText source={active
            ? `, aktuell ${direction === "asc" ? "aufsteigend" : "absteigend"} sortiert`
            : ", sortieren"} />}
        </span>
      </button>
    </th>
  );
}

export default function TodosTable({ formatDate, onOpen, todos }) {
  const [sort, setSort] = useState({ key: null, direction: "asc" });
  const visibleTodos = useMemo(() => {
    if (!sort.key) return todos;
    return [...todos].sort((left, right) => {
      const result = compareValues(
        sortValue(left, sort.key),
        sortValue(right, sort.key),
      );
      return result === 0
        ? String(left.id).localeCompare(String(right.id))
        : sort.direction === "asc"
          ? result
          : result * -1;
    });
  }, [sort, todos]);

  function toggleSort(key) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  }

  if (!todos.length)
    return <p className="todos-gallery__state"><StaticText source={"Keine To-dos vorhanden."} /></p>;
  return (
    <div className="todos-list-table-frame">
      <table className="data-table todos-table">
        <thead>
          <tr>
            <SortableHeader
              activeSort={sort}
              label="Status"
              onSort={toggleSort}
              sortKey="status"
            />
            <TranslatedProps sources={{"label":"Aufgabe"}}><SortableHeader
              activeSort={sort}
              label="Aufgabe"
              onSort={toggleSort}
              sortKey="title"
            /></TranslatedProps>
            <TranslatedProps sources={{"label":"TA-Nummer"}}><SortableHeader
              activeSort={sort}
              label="TA-Nummer"
              onSort={toggleSort}
              sortKey="transportOrder"
            /></TranslatedProps>
            <TranslatedProps sources={{"label":"Wichtigkeit"}}><SortableHeader
              activeSort={sort}
              label="Wichtigkeit"
              onSort={toggleSort}
              sortKey="priority"
            /></TranslatedProps>
            <TranslatedProps sources={{"label":"Fällig am"}}><SortableHeader
              activeSort={sort}
              label="Fällig am"
              onSort={toggleSort}
              sortKey="dueDate"
            /></TranslatedProps>
            <TranslatedProps sources={{"label":"Bearbeiter"}}><SortableHeader
              activeSort={sort}
              label="Bearbeiter"
              onSort={toggleSort}
              sortKey="assignee"
            /></TranslatedProps>
            <TranslatedProps sources={{"label":"Erstellt von"}}><SortableHeader
              activeSort={sort}
              label="Erstellt von"
              onSort={toggleSort}
              sortKey="creator"
            /></TranslatedProps>
            <TranslatedProps sources={{"label":"Zuständigkeit"}}><SortableHeader
              activeSort={sort}
              label="Zuständigkeit"
              onSort={toggleSort}
              sortKey="responsibility"
            /></TranslatedProps>
          </tr>
        </thead>
        <tbody>
          {visibleTodos.map((todo) => {
            const due = todoDuePresentation(todo);
            const appearance =
              due.days === null
                ? "none"
                : due.days <= 0
                  ? "critical"
                  : due.days <= 2
                    ? "urgent"
                    : due.days <= 5
                      ? "warning"
                      : "none";
            const dueText = !todo.dueDate
              ? "Keine Fälligkeit"
              : `${due.label} · ${formatDate(todo.dueDate)}`;
            return (
              <tr
                className={`todos-table__row todos-table__row--${appearance}`}
                key={todo.id}
                tabIndex="0"
                role="link"
                aria-label={`To-do öffnen: ${todo.title}`}
                onClick={() => onOpen(todo)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(todo);
                  }
                }}
              >
                <td>
                  <StatusChip status={todoStatus(todo)} />
                </td>
                <td className="todos-table__title" title={todo.title}>
                  {todo.title}
                </td>
                <td><TransportOrderCell todo={todo} /></td>
                <td>
                  <TodoPriority priority={todoPriority(todo)} />
                </td>
                <td
                  className={`todos-table__due todos-table__due--${appearance}`}
                >
                  {dueText}
                </td>
                <td>{todo.assignedUserName || <StaticText source={"Noch nicht übernommen"} />}</td>
                <td>{todo.creatorName || "—"}</td>
                <td>{responsibilityLabel(todo)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
