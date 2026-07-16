import { redirect } from 'next/navigation';

/**
 * Legacy route — /teachers/
 * All teacher management has been consolidated into the unified
 * Staff Management module at /staff/.
 */
export default function TeachersLegacyRedirect() {
  redirect('/staff');
}
