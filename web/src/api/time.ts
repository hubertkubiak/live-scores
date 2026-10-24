import { useEffect, useState } from 'react';
import { formatInTimeZone } from 'date-fns-tz';

export const DEFAULT_TIME_ZONE = 'Europe/Warsaw';

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** Calendar day (yyyy-MM-dd) of an instant in a time zone. */
export const dayOf = (instant: string | number | Date, tz: string) =>
  formatInTimeZone(instant, tz, 'yyyy-MM-dd');

/** Today's date in `tz`, re-checked every minute so the list rolls over at midnight. */
export function useToday(tz: string): string {
  const [today, setToday] = useState(() => dayOf(Date.now(), tz));
  useEffect(() => {
    setToday(dayOf(Date.now(), tz));
    const id = setInterval(() => setToday(dayOf(Date.now(), tz)), 60_000);
    return () => clearInterval(id);
  }, [tz]);
  return today;
}

export const formatKickOff = (iso: string, tz: string) => formatInTimeZone(iso, tz, 'HH:mm');
