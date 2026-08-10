import { useEffect, useRef } from 'react';
import { track, useUniversal, useUsageTracker } from '@unisim/sdk';

/**
 * Mounts the SDK usage batcher and fires `session.opened` once per visit —
 * this feeds the hub's "last product used". Only fires for signed-in
 * visitors; the app requires no account, so most sessions send nothing.
 *
 * No event may ever carry ledger content: no amounts, no names, no group
 * ids. Usage is "the app was opened", never what it was opened on.
 */
export default function UsageTracker() {
  useUsageTracker();
  const { session, activeOrgId } = useUniversal();
  const fired = useRef(false);

  useEffect(() => {
    if (!fired.current && session && activeOrgId) {
      fired.current = true;
      track('session.opened');
    }
  }, [session, activeOrgId]);

  return null;
}
