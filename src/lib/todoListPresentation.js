export function responsibilityLabel(todo) {
  if (todo.audienceType === "person") return todo.audienceId === todo.creatorUserId ? "Persönlich" : todo.audienceLabel || "Person";
  if (todo.audienceType === "department") return todo.audienceId || todo.audienceLabel || "Abteilung";
  if (todo.audienceType === "all") return "Alle";
  if (todo.audienceType === "people") return (todo.audienceIds || []).length > 1 ? "Personengruppe" : (todo.audienceLabel || "Person").replace(/^Personen:\s*/, "");
  return todo.audienceLabel || "—";
}

export function transportOrderNumbers(todo) {
  const links = Array.isArray(todo.transportOrderLinks) && todo.transportOrderLinks.length
    ? todo.transportOrderLinks
    : todo.transportOrderId ? [{ id: todo.transportOrderId, number: todo.transportOrderNumber || todo.reference || todo.transportOrderId }] : [];
  return links.map((link) => String(link?.number || link?.id || "").trim()).filter(Boolean);
}
