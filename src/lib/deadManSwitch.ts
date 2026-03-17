import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Member } from './db';
import { logActivity } from './utils';

const DEFAULT_INTERVAL = 43200000; // 12 hours
const CHECK_PERIOD = 60000; // 60 seconds

const flaggedMembers = new Set<number>();
let flagsLoaded = false;

async function loadFlaggedSet() {
  if (flagsLoaded) return;
  const setting = await db.settings.get('dmsFlaggedMembers');
  if (setting?.value && typeof setting.value === 'string') {
    try {
      const ids = JSON.parse(setting.value) as number[];
      ids.forEach((id) => flaggedMembers.add(id));
    } catch { /* ignore */ }
  }
  flagsLoaded = true;
}

async function saveFlaggedSet() {
  await db.settings.put({ key: 'dmsFlaggedMembers', value: JSON.stringify([...flaggedMembers]) });
}

async function checkOverdue() {
  const members = await db.members.toArray();
  if (members.length === 0) return;

  await loadFlaggedSet();
  const now = Date.now();
  let changed = false;

  for (const member of members) {
    if (!member.id) continue;
    const interval = member.checkInInterval || DEFAULT_INTERVAL;

    const lastCheckin = await db.checkins
      .where('memberId')
      .equals(member.id)
      .reverse()
      .sortBy('timestamp')
      .then((arr) => arr[0]);

    const lastTime = lastCheckin?.timestamp ?? member.lastCheckIn ?? member.createdAt;
    const elapsed = now - lastTime;
    const isOverdue = elapsed > interval;

    if (isOverdue && !flaggedMembers.has(member.id)) {
      flaggedMembers.add(member.id);
      changed = true;
      const hours = Math.round(elapsed / 3600000);

      await logActivity(
        'dead_mans_switch',
        `⚠️ Safety timer alert — ${member.name} hasn't checked in for ${hours}h`,
        `⚠️ Alerte minuterie de sécurité — ${member.name} n'a pas signalé sa présence depuis ${hours}h`
      );

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('⚠️ SENTINEL', {
          body: `${member.name} hasn't checked in for ${hours} hours`,
          icon: '/icon-192.png',
          tag: `dms-${member.id}`,
        });
      }
    } else if (!isOverdue && flaggedMembers.has(member.id)) {
      flaggedMembers.delete(member.id);
      changed = true;
    }
  }

  if (changed) await saveFlaggedSet();
}

export function startDeadManSwitch(): () => void {
  // Run initial check after a short delay (let DB seed complete)
  const timeout = setTimeout(checkOverdue, 5000);
  const interval = setInterval(checkOverdue, CHECK_PERIOD);
  return () => {
    clearTimeout(timeout);
    clearInterval(interval);
    flaggedMembers.clear();
  };
}

export function useOverdueMembers(): Member[] {
  return useLiveQuery(async () => {
    const members = await db.members.toArray();
    const now = Date.now();
    const overdue: Member[] = [];

    for (const m of members) {
      if (!m.id) continue;
      const interval = m.checkInInterval || DEFAULT_INTERVAL;
      const lastCheckin = await db.checkins
        .where('memberId')
        .equals(m.id)
        .reverse()
        .sortBy('timestamp')
        .then((arr) => arr[0]);
      const lastTime = lastCheckin?.timestamp ?? m.lastCheckIn ?? m.createdAt;
      if (now - lastTime > interval) overdue.push(m);
    }
    return overdue;
  }, []) ?? [];
}

export function useCurrentUserOverdue(): boolean {
  return useLiveQuery(async () => {
    const userNameSetting = await db.settings.get('userName');
    const userName = userNameSetting?.value as string;
    if (!userName) return false;

    const member = await db.members.where('name').equals(userName).first();
    if (!member?.id) return false;

    const interval = member.checkInInterval || DEFAULT_INTERVAL;
    const lastCheckin = await db.checkins
      .where('memberId')
      .equals(member.id)
      .reverse()
      .sortBy('timestamp')
      .then((arr) => arr[0]);
    const lastTime = lastCheckin?.timestamp ?? member.lastCheckIn ?? member.createdAt;
    return Date.now() - lastTime > interval;
  }, []) ?? false;
}
