import { useEffect, useRef, useCallback } from 'react';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/utils';

/**
 * Dead Man's Switch hook.
 *
 * When enabled, starts a countdown timer based on the configured interval (in hours).
 * If the user doesn't check in (call `resetTimer`) before the interval expires,
 * an alert is triggered: a SOS message is posted to the group and a browser
 * notification is fired (if permissions allow).
 *
 * The last check-in timestamp is persisted in the `dmsLastCheckIn` setting
 * so the timer survives page reloads.
 */
export function useDeadMansSwitch(
  enabled: boolean,
  intervalHours: number,
  userName: string
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertCountRef = useRef<number>(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleNextAlert = useCallback((intervalMs: number) => {
    timerRef.current = setTimeout(async () => {
      alertCountRef.current += 1;
      const name = userName || 'Unknown';
      const ordinal = alertCountRef.current > 1 ? ` (alert #${alertCountRef.current})` : '';

      await db.messages.add({
        senderName: 'SYSTEM',
        text: `⚠️ Dead Man's Switch: ${name} has not checked in for ${intervalHours} hours!${ordinal}`,
        priority: 'SOS',
        timestamp: Date.now(),
      });

      await logActivity(
        'dms_alert',
        `Dead Man's Switch triggered for ${name}${ordinal}`,
        `Alerte homme mort déclenchée pour ${name}${ordinal}`
      );

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('SENTINEL — Dead Man\'s Switch', {
          body: `${name} has not checked in for ${intervalHours} hours!${ordinal}`,
          icon: '/favicon.ico',
        });
      }

      // Reschedule for another interval until user checks in
      scheduleNextAlert(intervalMs);
    }, intervalMs);
  }, [userName, intervalHours]);

  const triggerAlert = useCallback(async () => {
    alertCountRef.current += 1;
    const name = userName || 'Unknown';
    const ordinal = alertCountRef.current > 1 ? ` (alert #${alertCountRef.current})` : '';

    await db.messages.add({
      senderName: 'SYSTEM',
      text: `⚠️ Dead Man's Switch: ${name} has not checked in for ${intervalHours} hours!${ordinal}`,
      priority: 'SOS',
      timestamp: Date.now(),
    });

    await logActivity(
      'dms_alert',
      `Dead Man's Switch triggered for ${name}${ordinal}`,
      `Alerte homme mort déclenchée pour ${name}${ordinal}`
    );

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('SENTINEL — Dead Man\'s Switch', {
        body: `${name} has not checked in for ${intervalHours} hours!${ordinal}`,
        icon: '/favicon.ico',
      });
    }
  }, [userName, intervalHours]);

  const startTimer = useCallback(async () => {
    clearTimer();
    alertCountRef.current = 0;

    // Calculate how much time remains since the last check-in
    const lastCheckInSetting = await db.settings.get('dmsLastCheckIn');
    const lastCheckIn = (lastCheckInSetting?.value as number) || Date.now();
    const intervalMs = intervalHours * 3600000;
    const elapsed = Date.now() - lastCheckIn;
    const remaining = Math.max(0, intervalMs - elapsed);

    if (remaining <= 0) {
      // Already expired — trigger immediately, then reschedule
      await triggerAlert();
      scheduleNextAlert(intervalMs);
      return;
    }

    timerRef.current = setTimeout(async () => {
      alertCountRef.current += 1;
      const name = userName || 'Unknown';

      await db.messages.add({
        senderName: 'SYSTEM',
        text: `⚠️ Dead Man's Switch: ${name} has not checked in for ${intervalHours} hours!`,
        priority: 'SOS',
        timestamp: Date.now(),
      });

      await logActivity(
        'dms_alert',
        `Dead Man's Switch triggered for ${name}`,
        `Alerte homme mort déclenchée pour ${name}`
      );

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('SENTINEL — Dead Man\'s Switch', {
          body: `${name} has not checked in for ${intervalHours} hours!`,
          icon: '/favicon.ico',
        });
      }

      // Reschedule for another full interval
      scheduleNextAlert(intervalMs);
    }, remaining);
  }, [clearTimer, intervalHours, triggerAlert, scheduleNextAlert, userName]);

  // Reset the timer (called on check-in)
  const resetTimer = useCallback(async () => {
    alertCountRef.current = 0;
    await db.settings.put({ key: 'dmsLastCheckIn', value: Date.now() });
    if (enabled) {
      await startTimer();
    }
  }, [enabled, startTimer]);

  // Start/stop timer when enabled or interval changes
  useEffect(() => {
    if (enabled) {
      startTimer();
    } else {
      clearTimer();
    }
    return () => clearTimer();
  }, [enabled, intervalHours, startTimer, clearTimer]);

  // Request notification permission when DMS is enabled
  useEffect(() => {
    if (enabled && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [enabled]);

  return { resetTimer };
}
