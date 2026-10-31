import { Link, useLocation } from 'react-router-dom'
import { createReturnState } from '../../lib/recordNavigation.js'

// Carry the actual originating view through related records, without changing
// the destination or bypassing its route/Firestore permissions.
export default function ContextLink({ state, ...props }) {
  const location = useLocation()
  return <Link {...props} state={{ ...createReturnState(location), ...state }} />
}
