export default function AdminPlaceholderPanel({ title, description, items }) {
  return <section className="admin-placeholder"><h2>{title}</h2><p>{description}</p><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></section>
}
