import { Link } from 'react-router-dom'

export default function BackLink({ className = '', to }) {
  return <Link className={`button button--secondary back-link${className ? ` ${className}` : ''}`} to={to}>Zurück</Link>
}
