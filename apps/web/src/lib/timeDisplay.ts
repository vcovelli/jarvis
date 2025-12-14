import { TodoItem } from "./jarvisStore";

export function parseTimeToMinutes(value: string): number | null {
  if (!value) return null;
  const [hourPart, minutePart] = value.split(":");
  if (hourPart === undefined || minutePart === undefined) return null;
  const hour = Number(hourPart);
  const minute = Number(minutePart);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return hour * 60 + minute;
}

export function formatMinutesLabel(totalMinutes: number) {
  const wrapped = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute.toString().padStart(2, "0")} ${period}`;
}

export function minutesToTimeString(totalMinutes: number) {
  const wrapped = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

export function formatTodoTimeWindow(todo: TodoItem) {
  if (!todo.startTime) return "";
  const startMinutes = parseTimeToMinutes(todo.startTime);
  if (startMinutes === null) return "";
  const hasDuration = Boolean(todo.timeblockMins);
  const endMinutes = hasDuration ? startMinutes + (todo.timeblockMins ?? 0) : undefined;
  const startLabel = formatMinutesLabel(startMinutes);
  if (!endMinutes) {
    return `@ ${startLabel}`;
  }
  return `${startLabel} – ${formatMinutesLabel(endMinutes)}`;
}
