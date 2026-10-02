/**
 * A number of minutes as a short reading time: "45 min", "2 h", "2 h 5 min".
 * Rounded to the nearest minute and never less than "1 min", since it is only
 * shown for something that takes some time.
 */
export function formatDuration(minutes: number): string {
  const total = Math.max(1, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
