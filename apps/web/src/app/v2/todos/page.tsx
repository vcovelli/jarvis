"use client";

import { useSearchParams } from "next/navigation";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DayKey,
  Timeblock,
  TodoItem,
  TodoPriority,
  dayKeyToDate,
  getDayKey,
  useJarvisState,
} from "@/lib/jarvisStore";
import { useToast } from "@/components/Toast";
import {
  formatMinutesLabel,
  formatTodoTimeWindow,
  minutesToTimeString,
  parseTimeToMinutes,
} from "@/lib/timeDisplay";

const SLOT_MINUTES = 15;
const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES; // 96
const SLOT_HEIGHT = 12;
const BOARD_HEIGHT = SLOTS_PER_DAY * SLOT_HEIGHT;
const HOUR_LABELS = Array.from({ length: 24 }, (_, index) => index);
const DAY_MINUTES = 24 * 60;
const timeblockOptions: Timeblock[] = Array.from({ length: 16 }, (_, index) => (index + 1) * 15);
const startTimeOptions = buildStartTimeOptions(SLOT_MINUTES);
const blockColors = ["#f472b6", "#facc15", "#34d399", "#60a5fa", "#a78bfa", "#f87171", "#fb923c"];
const defaultBlockColor = blockColors[0];
type IconOption = { id: string; label: string; symbol: string };
const taskIconOptions: IconOption[] = [
  { id: "alarm", label: "Alarm", symbol: "⏰" },
  { id: "sunrise", label: "Sunrise", symbol: "🌅" },
  { id: "coffee", label: "Coffee", symbol: "☕" },
  { id: "dumbbell", label: "Workout", symbol: "🏋️" },
  { id: "book", label: "Study", symbol: "📘" },
  { id: "moon", label: "Night", symbol: "🌙" },
  { id: "spark", label: "Focus", symbol: "⚡" },
];
const defaultTaskIcon = taskIconOptions[0].id;
type RollingDay = {
  key: DayKey;
  date: Date;
  label: string;
  weekday: string;
  hasTodos: boolean;
  isToday: boolean;
};

export default function TodosPage() {
  const {
    state,
    hydrated,
    addTodo,
    toggleTodo,
    updateTodoPriority,
    updateTodo,
    deleteTodo,
    reorderTodos,
    updateTodoSchedule,
  } = useJarvisState();
  const search = useSearchParams();
  const focusTodoId = search?.get("focus") ?? undefined;
  const focusDay = search?.get("day");
  const todayKey = getDayKey();
  const [selectedDay, setSelectedDay] = useState<DayKey>(todayKey);
  const [text, setText] = useState("");
  const [priority, setPriority] = useState<TodoPriority>(1);
  const [timeblock, setTimeblock] = useState<Timeblock | undefined>(30);
  const [startTime, setStartTime] = useState("08:00");
  const [color, setColor] = useState<string>(defaultBlockColor);
  const [icon, setIcon] = useState<string>(defaultTaskIcon);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editPriority, setEditPriority] = useState<TodoPriority>(1);
  const [editTimeblock, setEditTimeblock] = useState<Timeblock | undefined>();
  const [editStartTime, setEditStartTime] = useState("");
  const [editColor, setEditColor] = useState<string>(defaultBlockColor);
  const [editIcon, setEditIcon] = useState<string>(defaultTaskIcon);
  const [panelMode, setPanelMode] = useState<"add" | "edit" | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const { showToast } = useToast();

  const weekDays = useMemo(
    () => buildWeekRange(selectedDay, state.todos),
    [selectedDay, state.todos],
  );
  const dayColorMap = useMemo(() => buildDayColorMap(state.todos), [state.todos]);
  const todosForDay = useMemo(
    () => getOrderedTodos(state.todos[selectedDay] ?? []),
    [state.todos, selectedDay],
  );
  const upcoming = useMemo(() => buildUpcomingSchedule(state.todos), [state.todos]);
  const editingTodo = editingId ? todosForDay.find((todo) => todo.id === editingId) : null;
  const dayLabelFull = dayKeyToDate(selectedDay).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const handleShiftDay = useCallback(
    (delta: number) => {
      setSelectedDay((current) => shiftDayKey(current, delta));
    },
    [],
  );
  const handleDaySelect = useCallback((day: DayKey) => {
    setSelectedDay(day);
  }, []);
  const handleCalendarSelect = useCallback((day: DayKey) => {
    setSelectedDay(day);
    setCalendarOpen(false);
  }, []);
  const jumpToToday = useCallback(() => {
    setSelectedDay(todayKey);
  }, [todayKey]);

  const submitTask = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    addTodo({
      text: trimmed,
      priority,
      timeblockMins: timeblock,
      startTime: startTime || undefined,
      day: selectedDay,
      color,
      icon,
    });
    setText("");
    setTimeblock(30);
    setStartTime("08:00");
    setColor(defaultBlockColor);
    setIcon(defaultTaskIcon);
    showToast("Todo scheduled");
    setPanelMode(null);
  }, [text, priority, timeblock, startTime, selectedDay, addTodo, showToast, color, icon]);

  const beginEdit = useCallback(
    (todo: TodoItem) => {
      setEditingId(todo.id);
      setEditText(todo.text);
      setEditPriority(todo.priority);
      setEditTimeblock(todo.timeblockMins);
      setEditStartTime(todo.startTime ?? "");
      setEditColor(todo.color ?? defaultBlockColor);
      setEditIcon(todo.icon ?? defaultTaskIcon);
      setPanelMode("edit");
    },
    [],
  );

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText("");
    setEditStartTime("");
    setEditTimeblock(undefined);
    setEditColor(defaultBlockColor);
    setEditIcon(defaultTaskIcon);
  }, []);

  const closePanel = useCallback(() => {
    setPanelMode(null);
    cancelEdit();
  }, [cancelEdit]);

  const openAddPanel = useCallback(() => {
    cancelEdit();
    setColor(defaultBlockColor);
    setIcon(defaultTaskIcon);
    setPanelMode("add");
  }, [cancelEdit]);

  const submitEdit = useCallback(() => {
    if (!editingId) return;
    const trimmed = editText.trim();
    if (!trimmed) return;
    updateTodo({
      day: selectedDay,
      id: editingId,
      updates: {
        text: trimmed,
        priority: editPriority,
        timeblockMins: editTimeblock,
        startTime: editStartTime || undefined,
        color: editColor,
        icon: editIcon,
      },
    });
    showToast("Todo updated");
    closePanel();
  }, [
    editingId,
    editText,
    editPriority,
    editTimeblock,
    editStartTime,
    editColor,
    editIcon,
    selectedDay,
    updateTodo,
    showToast,
    closePanel,
  ]);

  const handleDelete = useCallback(
    (id: string) => {
      deleteTodo({ day: selectedDay, id });
      if (editingId === id) {
        closePanel();
      }
      showToast("Todo deleted");
    },
    [deleteTodo, selectedDay, editingId, closePanel, showToast],
  );

  const handleReorder = useCallback(
    (orderedIds: string[]) => {
      reorderTodos({ day: selectedDay, orderedIds });
    },
    [reorderTodos, selectedDay],
  );

  useEffect(() => {
    if (!focusDay) return undefined;
    const frame = requestAnimationFrame(() => setSelectedDay(normalizeDayKey(focusDay)));
    return () => cancelAnimationFrame(frame);
  }, [focusDay]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        (document.activeElement as HTMLElement)?.blur();
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  useEffect(() => {
    if (!panelMode) return;
    function handlePanelEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closePanel();
      }
    }
    window.addEventListener("keydown", handlePanelEscape);
    return () => window.removeEventListener("keydown", handlePanelEscape);
  }, [panelMode, closePanel]);

  if (!hydrated) {
    return <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">Loading planner…</p>;
  }

  let panelState: TaskPanelState | null = null;
  if (panelMode === "add") {
    panelState = {
      title: "Schedule task",
      subtitle: `Setup focus for ${dayLabelFull}`,
      text,
      onTextChange: setText,
      priority,
      onPriorityChange: setPriority,
      timeblock,
      onTimeblockChange: setTimeblock,
      startTime,
      onStartTimeChange: setStartTime,
      color,
      onColorChange: setColor,
      colorOptions: blockColors,
      icon,
      onIconChange: setIcon,
      iconOptions: taskIconOptions,
      onSubmit: submitTask,
      submitLabel: "Schedule",
    };
  } else if (panelMode === "edit" && editingId && editingTodo) {
    panelState = {
      title: "Edit task",
      subtitle: `Updating ${editingTodo.text}`,
      text: editText,
      onTextChange: setEditText,
      priority: editPriority,
      onPriorityChange: setEditPriority,
      timeblock: editTimeblock,
      onTimeblockChange: setEditTimeblock,
      startTime: editStartTime,
      onStartTimeChange: setEditStartTime,
      color: editColor,
      onColorChange: setEditColor,
      colorOptions: blockColors,
      icon: editIcon,
      onIconChange: setEditIcon,
      iconOptions: taskIconOptions,
      onSubmit: submitEdit,
      submitLabel: "Save changes",
      onDelete: () => handleDelete(editingId),
    };
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="hidden lg:block">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Todos</p>
      </header>

      <div className="flex flex-col gap-6">
        <DayTimeline
          todos={todosForDay}
          selectedDay={selectedDay}
          weekDays={weekDays}
          dayColorMap={dayColorMap}
          onSelectDay={handleDaySelect}
          onOpenCalendar={() => setCalendarOpen(true)}
          onAddTask={openAddPanel}
          onEdit={beginEdit}
          onJumpToday={jumpToToday}
        />
        <div className="hidden lg:block">
          <TimeBlockingBoard
            todos={todosForDay}
            selectedDay={selectedDay}
            isToday={selectedDay === todayKey}
            highlightId={focusTodoId}
            weekDays={weekDays}
            onScheduleChange={(id, updates) =>
              updateTodoSchedule({ day: selectedDay, id, ...updates })
            }
            onEditRequest={(todo) => beginEdit(todo)}
            onDeleteRequest={(id) => handleDelete(id)}
            onAddTask={openAddPanel}
            onShiftDay={handleShiftDay}
            onSelectDay={handleDaySelect}
            onOpenCalendar={() => setCalendarOpen(true)}
            onJumpToday={jumpToToday}
          />
        </div>
      </div>

      <div className="space-y-6 hidden lg:flex lg:flex-col">
        <TaskList
          todos={todosForDay}
          onEdit={(todo) => beginEdit(todo)}
          onDelete={(id) => handleDelete(id)}
          onReorder={handleReorder}
          highlightId={focusTodoId}
          onToggle={(id) => toggleTodo({ day: selectedDay, id })}
          onCyclePriority={(id, next) =>
            updateTodoPriority({ day: selectedDay, id, priority: next })
          }
        />
        <UpcomingBlocks slots={upcoming} />
      </div>

      {panelState && <TaskPanel {...panelState} onClose={closePanel} />}
      {calendarOpen && (
        <CalendarOverlay
          selectedDay={selectedDay}
          markers={dayColorMap}
          onSelect={handleCalendarSelect}
          onClose={() => setCalendarOpen(false)}
        />
      )}
      <button
        type="button"
        onClick={openAddPanel}
        className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400 text-2xl font-semibold text-zinc-900 shadow-2xl"
      >
        <span className="sr-only">Add task</span>
        +
      </button>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-zinc-400">
      <span className="pl-1">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none rounded-2xl border border-white/15 bg-[#111629] px-4 py-3 text-sm font-medium text-white focus:border-cyan-400/60 focus:outline-none"
        >
          {children}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-white/60">
          <svg className="h-3 w-3" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </div>
  );
}

function ColorPicker({
  colors,
  value,
  onChange,
}: {
  colors: string[];
  value?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-zinc-400">
      <span className="pl-1">Block color</span>
      <div className="flex flex-wrap gap-2">
        {colors.map((hex) => {
          const active = value === hex;
          return (
            <button
              key={hex}
              type="button"
              onClick={() => onChange(hex)}
              className={`h-9 w-9 rounded-full border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${active ? "border-white shadow-lg" : "border-white/20"}`}
              style={{ backgroundColor: hex }}
              aria-label={`Select color ${hex}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function IconPicker({
  icons,
  value,
  onChange,
}: {
  icons: IconOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-zinc-400">
      <span className="pl-1">Icon</span>
      <div className="flex flex-wrap gap-2">
        {icons.map((icon) => {
          const active = icon.id === value;
          return (
            <button
              key={icon.id}
              type="button"
              onClick={() => onChange(icon.id)}
              className={`flex h-10 w-10 items-center justify-center rounded-full border text-base transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                active ? "border-white bg-white/10 text-white" : "border-white/20 text-white/70"
              }`}
              aria-label={`Select ${icon.label}`}
            >
              {icon.symbol}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type DayTimelineProps = {
  todos: TodoItem[];
  selectedDay: DayKey;
  weekDays: RollingDay[];
  dayColorMap: Record<DayKey, string[]>;
  onSelectDay: (day: DayKey) => void;
  onOpenCalendar: () => void;
  onAddTask: () => void;
  onEdit: (todo: TodoItem) => void;
  onJumpToday: () => void;
};

function DayTimeline({
  todos,
  selectedDay,
  weekDays,
  dayColorMap,
  onSelectDay,
  onOpenCalendar,
  onAddTask,
  onEdit,
  onJumpToday,
}: DayTimelineProps) {
  const events = useMemo(() => buildTimelineEvents(todos), [todos]);
  const selectedDate = dayKeyToDate(selectedDay);
  const monthLabel = selectedDate.toLocaleDateString(undefined, { month: "long" });
  const weekdayLabel = selectedDate.toLocaleDateString(undefined, { weekday: "long" });
  const dayNumber = selectedDate.getDate();
  const yearLabel = selectedDate.getFullYear();
  const hasEvents = events.length > 0;
  return (
    <div className="-mx-4 rounded-none border border-transparent bg-[#0b1224] px-4 py-5 text-white shadow-none sm:mx-0 sm:rounded-3xl lg:hidden">
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.5em] text-white/60">{weekdayLabel}</p>
            <button
              type="button"
              onClick={onOpenCalendar}
              className="mt-1 inline-flex items-baseline gap-1 text-left text-2xl font-semibold leading-tight text-white underline-offset-4 hover:underline"
            >
              <span>{monthLabel}</span>
              <span>{dayNumber},</span>
              <span className="text-rose-300">{yearLabel}</span>
            </button>
            <p className="mt-1 text-[11px] text-white/50">Tap the date to open the calendar.</p>
          </div>
          <button
            type="button"
            onClick={onJumpToday}
            className="rounded-full border border-white/20 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/80 transition hover:border-white/50"
          >
            Today
          </button>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-black/30 px-2 py-3 shadow-inner">
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((day) => {
              const active = day.key === selectedDay;
              const colors = dayColorMap[day.key] ?? [];
              return (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => onSelectDay(day.key)}
                  className={`flex min-w-0 flex-col items-center rounded-2xl px-0.5 py-1 text-center transition ${
                    active ? "text-white" : "text-white/60 hover:text-white"
                  }`}
                >
                  <span className="text-[9px] uppercase tracking-[0.45em] text-white/40">{day.weekday}</span>
                  <span
                    className={`mt-1 flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold ${
                      active ? "bg-rose-500 text-white shadow-lg shadow-rose-500/30" : "border border-white/10 bg-white/5 text-white/80"
                    }`}
                  >
                    {day.date.getDate()}
                  </span>
                  <div className="mt-1 flex min-h-[8px] gap-0.5">
                    {colors.slice(0, 3).map((color) => (
                      <span key={`${day.key}-${color}`} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                    ))}
                  </div>
                  {day.isToday && (
                    <span className="mt-1 text-[8px] font-semibold uppercase tracking-[0.3em] text-emerald-300">Today</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-2">
          {hasEvents ? (
            <div className="space-y-6">
              {events.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => onEdit(event.todo)}
                  className="grid w-full grid-cols-[64px_minmax(0,1fr)] gap-3 text-left"
                >
                  <div className="pr-2 text-right text-[9px] uppercase tracking-[0.1em] text-white/60">
                    <span className="block text-[11px] font-semibold text-white leading-tight">{event.startLabel}</span>
                    <span className="block text-white/70 leading-tight">{event.endLabel}</span>
                  </div>
                  <div className="relative pl-10">
                    <span className="pointer-events-none absolute left-4 top-0 bottom-0 w-0.5 bg-white/20" />
                    <span
                      className="pointer-events-none absolute left-4 top-1/2 z-10 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-[#0b1224] text-sm font-semibold text-zinc-900"
                      style={{ backgroundColor: event.color }}
                    >
                      {event.iconSymbol}
                    </span>
                    <div
                      className="ml-6 rounded-3xl border px-4 py-3 text-white shadow-lg shadow-black/30"
                      style={getTimelineCardStyle(event.color)}
                    >
                      <p className="text-sm font-semibold leading-tight text-white">{event.title}</p>
                      <p className="text-[10px] uppercase tracking-[0.25em] text-white/70">
                        {event.window}
                        {event.durationLabel ? ` • ${event.durationLabel}` : ""}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-[32px] border border-dashed border-white/20 bg-white/5 px-5 py-8 text-center text-sm text-white/60 shadow-inner">
              No scheduled blocks yet. Tap the + button to add one.
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onAddTask}
          className="mt-1 flex w-full items-center justify-center gap-3 rounded-full bg-emerald-400 px-5 py-3 text-base font-semibold text-emerald-950 shadow-lg shadow-emerald-500/40"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-base text-emerald-700">+</span>
          New block
        </button>
      </div>
    </div>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M16 3V7" />
      <path d="M8 3V7" />
      <path d="M3 11H21" />
      <path d="M8 15H8.01" />
      <path d="M12 15H12.01" />
      <path d="M16 15H16.01" />
      <path d="M8 19H8.01" />
      <path d="M12 19H12.01" />
      <path d="M16 19H16.01" />
    </svg>
  );
}

type TimeBlockingBoardProps = {
  todos: TodoItem[];
  selectedDay: DayKey;
  isToday: boolean;
  highlightId?: string;
  weekDays: RollingDay[];
  onScheduleChange: (id: string, updates: { startTime?: string; timeblockMins?: Timeblock }) => void;
  onEditRequest?: (todo: TodoItem) => void;
  onDeleteRequest?: (id: string) => void;
  onAddTask: () => void;
  onShiftDay: (delta: number) => void;
  onSelectDay: (day: DayKey) => void;
  onOpenCalendar: () => void;
  onJumpToday: () => void;
};

type DragState = {
  id: string;
  type: "move" | "resize";
  startMinutes: number;
  durationMinutes: number;
  pointerOffset?: number;
};

function TimeBlockingBoard({
  todos,
  selectedDay,
  isToday,
  highlightId,
  weekDays,
  onScheduleChange,
  onEditRequest,
  onDeleteRequest,
  onAddTask,
  onShiftDay,
  onSelectDay,
  onOpenCalendar,
  onJumpToday,
}: TimeBlockingBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const blocks = useMemo(() => buildScheduledBlocks(todos, dragState), [todos, dragState]);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowLabel = formatMinutesLabel(nowMinutes);
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const selectedDate = dayKeyToDate(selectedDay);
  const selectedDayLabel = selectedDate.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  useEffect(() => {
    function handleMove(event: PointerEvent) {
      if (!dragState) return;
      const minutes = pointerToMinutes(event, boardRef.current);
      if (minutes === null) return;
      if (dragState.type === "move" && dragState.pointerOffset !== undefined) {
        const proposed = minutes - dragState.pointerOffset;
        const start = clampMinutes(proposed, dragState.durationMinutes);
        setDragState((current) => (current ? { ...current, startMinutes: start } : current));
      }
      if (dragState.type === "resize") {
        const duration = Math.max(SLOT_MINUTES, minutes - dragState.startMinutes);
        const snapped = snapToSlot(duration);
        const clamped = Math.min(snapped, DAY_MINUTES - dragState.startMinutes);
        setDragState((current) => (current ? { ...current, durationMinutes: clamped } : current));
      }
    }

    function handleUp() {
      if (!dragState) return;
      onScheduleChange(dragState.id, {
        startTime: minutesToTimeString(snapToSlot(dragState.startMinutes)),
        timeblockMins: snapToSlot(dragState.durationMinutes),
      });
      setDragState(null);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragState, onScheduleChange]);

  useEffect(() => {
    if (!highlightId || !highlightRef.current) return;
    highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  useEffect(() => {
    if (!dragState) return undefined;
    document.body.classList.add("scroll-locked");
    return () => {
      document.body.classList.remove("scroll-locked");
    };
  }, [dragState]);

  const handleDragStart = (event: React.PointerEvent, todo: TodoItem, type: "move" | "resize") => {
    if (!todo.startTime || !todo.timeblockMins) return;
    const startMinutes = parseTimeToMinutes(todo.startTime);
    if (startMinutes === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const pointer = pointerToMinutes(event.nativeEvent, boardRef.current);
    const pointerOffset = pointer ? pointer - startMinutes : 0;
    setDragState({
      id: todo.id,
      type,
      startMinutes,
      durationMinutes: todo.timeblockMins,
      pointerOffset,
    });
  };

  return (
    <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg min-w-0">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">Day planner</p>
            <h2 className="text-2xl font-semibold text-white">{selectedDayLabel}</h2>
            <p className="text-sm text-zinc-400">
              Drag focus blocks, swipe across days, or open the calendar to plan weeks ahead.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.3em] text-zinc-200">
            <button
              type="button"
              onClick={() => onShiftDay(-1)}
              className="rounded-full border border-white/20 px-3 py-1 text-sm text-white/80 transition hover:border-white/50"
              aria-label="Previous day"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => onShiftDay(1)}
              className="rounded-full border border-white/20 px-3 py-1 text-sm text-white/80 transition hover:border-white/50"
              aria-label="Next day"
            >
              ›
            </button>
            <button
              type="button"
              onClick={onOpenCalendar}
              className="rounded-full border border-white/20 p-2 text-white/80 transition hover:border-white/50"
              aria-label="Open calendar"
            >
              <CalendarIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onJumpToday}
              className="rounded-full border border-cyan-300/60 px-4 py-1 text-xs font-semibold text-cyan-200 transition hover:border-cyan-300"
            >
              Today
            </button>
            <button
              type="button"
              onClick={onAddTask}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-400/60 px-4 py-2 text-[11px] font-semibold text-white transition hover:bg-emerald-400/20"
            >
              <span className="text-base leading-none text-emerald-300">+</span>
              New block
            </button>
          </div>
        </div>
        <div className="rounded-2xl border border-white/5 bg-black/30 px-3 py-3">
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((day) => {
              const active = day.key === selectedDay;
              return (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => onSelectDay(day.key)}
                  className={`flex flex-col rounded-2xl px-3 py-3 text-left transition ${
                    active ? "bg-cyan-300 text-zinc-900" : "bg-black/0 text-white/80 hover:bg-white/10"
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-[0.4em]">
                    {day.weekday}
                  </span>
                  <span className="text-base font-semibold">{day.label}</span>
                  <div className="mt-1 flex items-center gap-1 text-[10px] uppercase tracking-[0.3em]">
                    {day.isToday && <span className="text-amber-200">Today</span>}
                    {!day.isToday && day.hasTodos && (
                      <span className="text-emerald-300">Focus</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-white/5 bg-black/40">
        <div ref={boardRef} className="relative min-w-[360px]" style={{ height: BOARD_HEIGHT }}>
          <div className="absolute inset-y-0 left-0 w-16 border-r border-white/5 bg-black/30 text-[11px] uppercase tracking-[0.3em] text-zinc-500">
            {HOUR_LABELS.map((hour) => (
              <div key={hour} className="flex items-start justify-end pr-3" style={{ height: SLOT_HEIGHT * 4 }}>
                {formatHourMarker(hour)}
              </div>
            ))}
          </div>
          <div className="absolute inset-y-0" style={{ left: 64, right: 0 }}>
            <div className="relative h-full rounded-r-2xl bg-black/30">
              {Array.from({ length: SLOTS_PER_DAY + 1 }).map((_, index) => (
                <div
                  key={`grid-${index}`}
                  className={`absolute left-0 right-0 border-t ${index % 4 === 0 ? "border-white/20" : "border-white/5"}`}
                  style={{ top: index * SLOT_HEIGHT }}
                />
              ))}
              {isToday && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-40"
                  style={{ top: (nowMinutes / SLOT_MINUTES) * SLOT_HEIGHT }}
                >
                  <div className="relative">
                    <div className="border-t border-red-500/80" />
                    <span className="absolute -top-4 left-4 rounded-full bg-red-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white shadow-lg">
                      Now • {nowLabel}
                    </span>
                  </div>
                </div>
              )}
              {blocks.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-zinc-400">
                  Add a start time + block to place todos on the map.
                </div>
              ) : (
                blocks.map((block) => {
                  const highlight = highlightId === block.id;
                  const customStyle = block.color
                    ? {
                        backgroundColor: block.color,
                        borderColor: block.color,
                        color: "#030712",
                      }
                    : undefined;
                  const blockClass = block.hasConflict
                    ? "border-amber-300 bg-amber-200/90 text-zinc-900"
                    : block.color
                      ? "border-transparent text-zinc-900"
                      : `${priorityClasses(block.priority)} border-white/10`;
                  return (
                    <div
                      key={block.id}
                      ref={highlight ? highlightRef : undefined}
                      onPointerDown={(event) => handleDragStart(event, block.originalTodo, "move")}
                      className={`group absolute left-4 right-4 z-10 cursor-grab rounded-2xl border px-3 py-2 text-xs shadow-lg ${blockClass} ${highlight ? "ring-2 ring-cyan-300/70" : ""}`}
                      style={{
                        top: (block.startMinutes / SLOT_MINUTES) * SLOT_HEIGHT,
                        height: Math.max((block.durationMinutes / SLOT_MINUTES) * SLOT_HEIGHT - 2, 28),
                        ...customStyle,
                      }}
                    >
                      <div className="absolute right-3 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                        <button
                          type="button"
                          className="rounded-full bg-black/30 px-2 py-1 text-[10px] font-semibold text-white/80 hover:bg-black/70"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (onEditRequest) {
                              onEditRequest(block.originalTodo);
                            }
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="rounded-full bg-black/30 px-2 py-1 text-[10px] font-semibold text-white/80 hover:bg-black/70"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteRequest?.(block.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                      <div className="pointer-events-none flex h-full flex-col justify-center gap-1 text-left">
                        <p className="text-xs font-semibold uppercase tracking-[0.15em]">
                          {block.label}
                        </p>
                        <p className="text-[10px] uppercase tracking-[0.25em] opacity-80">
                          {block.window}
                        </p>
                      </div>
                      <div
                        className="absolute bottom-1 left-1/2 h-2 w-10 -translate-x-1/2 cursor-ns-resize rounded-full bg-white/60"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          handleDragStart(event, block.originalTodo, "resize");
                        }}
                      />
                      <div className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded-full bg-black/80 px-2 py-1 text-[10px] uppercase tracking-[0.25em] text-white group-hover:block">
                        {block.window}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type TaskListProps = {
  todos: TodoItem[];
  onEdit: (todo: TodoItem) => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  highlightId?: string;
  onToggle: (id: string) => void;
  onCyclePriority: (id: string, next: TodoPriority) => void;
};

function TaskList({ todos, onEdit, onDelete, onReorder, highlightId, onToggle, onCyclePriority }: TaskListProps) {
  const completedCount = todos.filter((todo) => todo.done).length;
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    if (!highlightId || !highlightRef.current) return;
    highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  const handleItemDragStart = (id: string) => {
    setDraggingId(id);
  };

  const handleItemDrop = (targetId: string) => {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      return;
    }
    const orderedIds = reorderIds(todos, draggingId, targetId);
    setDraggingId(null);
    onReorder(orderedIds);
  };

  return (
    <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-lg min-w-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-medium text-white">Task stack</h3>
          <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">
            Drag to reorder • Auto-sorted by time
          </p>
        </div>
        <span className="text-xs uppercase tracking-[0.3em] text-zinc-400">
          {todos.length ? `${completedCount}/${todos.length} done` : "Empty"}
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {todos.length === 0 ? (
          <p className="text-sm text-zinc-400">Nothing scheduled for this day.</p>
        ) : (
          todos.map((todo) => {
            const highlight = todo.id === highlightId;
            return (
              <div
                key={todo.id}
                ref={highlight ? highlightRef : undefined}
                draggable
                onDragStart={() => handleItemDragStart(todo.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  handleItemDrop(todo.id);
                }}
                className={`flex flex-col gap-3 rounded-2xl border border-white/5 bg-black/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                  highlight ? "ring-2 ring-cyan-300/70" : ""
                } ${draggingId === todo.id ? "opacity-60" : ""}`}
              >
                <span
                  className="hidden cursor-grab select-none text-lg font-semibold leading-none text-zinc-500 sm:block"
                  aria-hidden="true"
                >
                  ⋮⋮
                </span>
                <label className="flex min-w-0 flex-1 items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 cursor-pointer accent-cyan-300"
                    checked={todo.done}
                    onChange={() => onToggle(todo.id)}
                  />
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      {todo.color && (
                        <span
                          className="h-3 w-3 flex-shrink-0 rounded-full border border-white/30"
                          style={{ backgroundColor: todo.color }}
                        />
                      )}
                      <p className={`text-sm font-medium break-words ${todo.done ? "text-zinc-500 line-through" : "text-white"}`}>
                        {todo.text}
                      </p>
                    </div>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">
                      {buildTodoMeta(todo)}
                    </p>
                  </div>
                </label>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                  <button
                    type="button"
                    onClick={() => onCyclePriority(todo.id, nextPriority(todo.priority))}
                    className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-zinc-200"
                  >
                    P{todo.priority}
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(todo)}
                    className="rounded-full border border-cyan-300/40 px-3 py-1 text-xs font-semibold text-cyan-200 hover:border-cyan-300"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(todo.id)}
                    className="rounded-full bg-red-500/80 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

type UpcomingBlocksProps = {
  slots: ReturnType<typeof buildUpcomingSchedule>;
};

function UpcomingBlocks({ slots }: UpcomingBlocksProps) {
  return (
    <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-lg min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-lg font-medium text-white">Upcoming blocks</h3>
        <span className="text-xs uppercase tracking-[0.3em] text-zinc-400">
          {slots.length ? `${slots.length} queued` : "Empty"}
        </span>
      </div>
      <div className="mt-4 space-y-4">
        {slots.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Add start times to future todos to preview your calendar.
          </p>
        ) : (
          slots.map((slot) => (
            <div
              key={`${slot.day}-${slot.label}`}
              className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{slot.dayLabel}</p>
              <p className="text-base font-semibold text-white break-words">{slot.label}</p>
              <p className="text-sm text-zinc-400 break-words">{slot.meta}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

type TaskPanelProps = TaskPanelState & {
  onClose: () => void;
};

function TaskPanel({
  title,
  subtitle,
  text,
  onTextChange,
  priority,
  onPriorityChange,
  timeblock,
  onTimeblockChange,
  startTime,
  onStartTimeChange,
  color,
  onColorChange,
  colorOptions,
  icon,
  onIconChange,
  iconOptions,
  onSubmit,
  submitLabel,
  onDelete,
  onClose,
}: TaskPanelProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-[#0b1121] p-6 shadow-2xl sm:rounded-l-3xl"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 1.5rem)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">{subtitle}</p>
            <h3 className="mt-1 text-2xl font-semibold text-white">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/20 px-2 py-1 text-sm text-white/70 hover:text-white"
          >
            Close
          </button>
        </div>
        <form
          className="mt-6 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-zinc-400">
            <span className="pl-1">Task</span>
            <input
              value={text}
              onChange={(event) => onTextChange(event.target.value)}
              className="rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
              placeholder="Add todo"
            />
          </div>
          <SelectField
            label="Priority"
            value={priority.toString()}
            onChange={(value) => onPriorityChange(Number(value) as TodoPriority)}
          >
            {[1, 2, 3].map((value) => (
              <option key={value} value={value}>
                Priority {value}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Block length"
            value={timeblock ? timeblock.toString() : ""}
            onChange={(value) => onTimeblockChange(value === "" ? undefined : Number(value))}
          >
            <option value="">No block</option>
            {timeblockOptions.map((block) => (
              <option key={block} value={block}>
                {block}m focus
              </option>
            ))}
          </SelectField>
          <SelectField label="Start time" value={startTime} onChange={(value) => onStartTimeChange(value)}>
            <option value="">-- select --</option>
            {startTimeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <ColorPicker colors={colorOptions} value={color ?? colorOptions[0]} onChange={onColorChange} />
          <IconPicker icons={iconOptions} value={icon} onChange={onIconChange} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="submit"
              className="rounded-2xl bg-gradient-to-r from-emerald-300 to-cyan-400 px-4 py-3 text-sm font-semibold text-zinc-900"
            >
              {submitLabel}
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="rounded-2xl border border-red-500/60 px-4 py-3 text-sm font-semibold text-red-300 hover:border-red-400"
              >
                Delete task
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

type CalendarOverlayProps = {
  selectedDay: DayKey;
  markers: Record<DayKey, string[]>;
  onSelect: (day: DayKey) => void;
  onClose: () => void;
};

function CalendarOverlay({ selectedDay, markers, onSelect, onClose }: CalendarOverlayProps) {
  const [viewDate, setViewDate] = useState(() => {
    const date = dayKeyToDate(selectedDay);
    date.setDate(1);
    return date;
  });
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const cells = useMemo(() => buildCalendarMatrix(viewDate), [viewDate]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-3xl border border-white/10 bg-[#050912] p-6 text-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              const next = new Date(viewDate);
              next.setMonth(viewDate.getMonth() - 1);
              setViewDate(next);
            }}
            className="rounded-full border border-white/20 px-3 py-1 text-sm text-white/70 hover:text-white"
          >
            Prev
          </button>
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">Jump to date</p>
            <p className="text-lg font-semibold">{monthLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = new Date(viewDate);
              next.setMonth(viewDate.getMonth() + 1);
              setViewDate(next);
            }}
            className="rounded-full border border-white/20 px-3 py-1 text-sm text-white/70 hover:text-white"
          >
            Next
          </button>
        </div>
        <div className="mt-6 grid grid-cols-7 gap-2 text-center text-xs uppercase tracking-[0.3em] text-zinc-400">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-2">
          {cells.map((cell, index) =>
            cell ? (
              <button
                key={cell.toISOString()}
                type="button"
                onClick={() => onSelect(getDayKey(cell))}
                className={`flex h-14 flex-col items-center justify-center rounded-2xl border text-sm font-semibold transition ${
                  getDayKey(cell) === selectedDay
                    ? "border-cyan-300/70 bg-cyan-300/20 text-white"
                    : "border-white/10 text-zinc-200 hover:border-white/40"
                }`}
              >
                <span>{cell.getDate()}</span>
                <span className="mt-1 flex gap-1">
                  {(markers[getDayKey(cell)] ?? []).slice(0, 3).map((color) => (
                    <span key={`${cell.toISOString()}-${color}`} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                  ))}
                </span>
              </button>
            ) : (
              <div key={`empty-${index}`} />
            ),
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-400">
          <p>Select any day to jump directly into planning mode.</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

type ScheduledBlock = {
  id: string;
  startMinutes: number;
  durationMinutes: number;
  label: string;
  priority: TodoPriority;
  window: string;
  originalTodo: TodoItem;
  hasConflict: boolean;
  color?: string;
};

type StartTimeOption = {
  value: string;
  label: string;
};

type TaskPanelState = {
  title: string;
  subtitle: string;
  text: string;
  onTextChange: (value: string) => void;
  priority: TodoPriority;
  onPriorityChange: (value: TodoPriority) => void;
  timeblock?: Timeblock;
  onTimeblockChange: (value: Timeblock | undefined) => void;
  startTime: string;
  onStartTimeChange: (value: string) => void;
  color?: string;
  onColorChange: (value: string) => void;
  colorOptions: string[];
  icon: string;
  onIconChange: (value: string) => void;
  iconOptions: IconOption[];
  onSubmit: () => void;
  submitLabel: string;
  onDelete?: () => void;
};

function buildStartTimeOptions(stepMinutes = 15): StartTimeOption[] {
  const totalSteps = (24 * 60) / stepMinutes;
  return Array.from({ length: totalSteps }, (_, index) => {
    const minutes = index * stepMinutes;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const value = `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
    return {
      value,
      label: formatMinutesLabel(minutes),
    };
  });
}

function buildWeekRange(anchor: DayKey, todos: Record<DayKey, TodoItem[]>): RollingDay[] {
  const anchorDate = dayKeyToDate(anchor);
  const start = new Date(anchorDate);
  start.setDate(anchorDate.getDate() - anchorDate.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    const key = getDayKey(current);
    return {
      key,
      date: current,
      label: current.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      weekday: current.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase(),
      hasTodos: (todos[key]?.length ?? 0) > 0,
      isToday: key === getDayKey(),
    };
  });
}

function getTaskIconSymbol(iconId?: string, fallbackText = "") {
  const icon = taskIconOptions.find((option) => option.id === iconId);
  if (icon) return icon.symbol;
  const trimmed = fallbackText.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "•";
}

function getTimelineCardStyle(color?: string) {
  const fill = withAlpha(color, 0.22);
  const border = withAlpha(color, 0.4);
  return {
    backgroundColor: fill,
    borderColor: border,
  };
}

function withAlpha(hex = "#1e293b", alpha = 0.2) {
  if (!hex.startsWith("#") || (hex.length !== 7 && hex.length !== 4)) {
    return `rgba(30, 41, 59, ${alpha})`;
  }
  let r: number;
  let g: number;
  let b: number;
  if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  } else {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildDayColorMap(record: Record<DayKey, TodoItem[]>): Record<DayKey, string[]> {
  return Object.entries(record).reduce((acc, [day, todos]) => {
    const colors = todos
      .map((todo) => todo.color)
      .filter((color): color is string => Boolean(color));
    if (colors.length) {
      acc[day as DayKey] = colors;
    }
    return acc;
  }, {} as Record<DayKey, string[]>);
}

function buildUpcomingSchedule(record: Record<DayKey, TodoItem[]>) {
  const entries: { day: DayKey; dayLabel: string; label: string; meta: string; sortKey: number }[] = [];
  Object.entries(record).forEach(([day, todos]) => {
    todos.forEach((todo) => {
      if (!todo.startTime) return;
      const startMinutes = parseTimeToMinutes(todo.startTime) ?? DAY_MINUTES;
      entries.push({
        day,
        dayLabel: dayKeyToDate(day).toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
        label: todo.text,
        meta: `${formatTodoTimeWindow(todo) || "No block"} • P${todo.priority}`,
        sortKey: startMinutes,
      });
    });
  });
  return entries
    .sort((a, b) => {
      if (a.day === b.day) {
        return a.sortKey - b.sortKey;
      }
      return a.day > b.day ? 1 : -1;
    })
    .slice(0, 6)
    .map((entry) => ({ day: entry.day, dayLabel: entry.dayLabel, label: entry.label, meta: entry.meta }));
}

function buildScheduledBlocks(todos: TodoItem[], drag?: DragState | null): ScheduledBlock[] {
  const blocks: ScheduledBlock[] = [];
  todos.forEach((todo) => {
    if (!todo.startTime || !todo.timeblockMins) return;
    const startMinutes = parseTimeToMinutes(todo.startTime);
    if (startMinutes === null) return;
    const durationMinutes = Math.max(todo.timeblockMins, SLOT_MINUTES);
    blocks.push({
      id: todo.id,
      startMinutes,
      durationMinutes,
      label: todo.text,
      priority: todo.priority,
      window: formatTodoTimeWindow(todo),
      originalTodo: todo,
      hasConflict: false,
      color: todo.color,
    });
  });

  if (drag) {
    const index = blocks.findIndex((block) => block.id === drag.id);
    if (index >= 0) {
      blocks[index] = {
        ...blocks[index],
        startMinutes: drag.startMinutes,
        durationMinutes: drag.durationMinutes,
        window: `${formatMinutesLabel(drag.startMinutes)} – ${formatMinutesLabel(
          drag.startMinutes + drag.durationMinutes,
        )}`,
      };
    }
  }

  blocks.sort((a, b) => a.startMinutes - b.startMinutes);

  const conflictIds = new Set<string>();
  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      const a = blocks[i];
      const b = blocks[j];
      if (a.startMinutes + a.durationMinutes <= b.startMinutes) break;
      conflictIds.add(a.id);
      conflictIds.add(b.id);
    }
  }

  return blocks.map((block) => ({ ...block, hasConflict: conflictIds.has(block.id) }));
}

function buildTodoMeta(todo: TodoItem) {
  const detailParts = [`P${todo.priority}`];
  const window = formatTodoTimeWindow(todo);
  if (window) {
    detailParts.push(window);
  } else if (todo.timeblockMins) {
    detailParts.push(`${todo.timeblockMins}m block`);
  }
  return detailParts.join(" • ");
}

function priorityClasses(priority: TodoPriority) {
  switch (priority) {
    case 1:
      return "bg-gradient-to-r from-amber-200/90 to-orange-300/80 text-zinc-900";
    case 2:
      return "bg-gradient-to-r from-cyan-300/80 to-blue-500/70 text-white";
    case 3:
    default:
      return "bg-gradient-to-r from-fuchsia-400/70 to-purple-500/70 text-white";
  }
}

function formatHourMarker(hour: number) {
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${suffix}`;
}

function nextPriority(value: TodoPriority): TodoPriority {
  if (value === 3) return 1;
  return ((value + 1) as TodoPriority);
}

function shiftDayKey(day: DayKey, delta: number): DayKey {
  const date = dayKeyToDate(day);
  date.setDate(date.getDate() + delta);
  return getDayKey(date);
}

function buildCalendarMatrix(viewDate: Date): (Date | null)[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const blanks = firstDay.getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let index = 0; index < blanks; index += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(new Date(year, month, day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

type TimelineEvent = {
  id: string;
  title: string;
  startLabel: string;
  endLabel: string;
  window: string;
  durationLabel?: string;
  color: string;
  iconSymbol: string;
  todo: TodoItem;
};

function buildTimelineEvents(todos: TodoItem[]): TimelineEvent[] {
  const enriched = todos
    .filter((todo) => todo.startTime)
    .map((todo) => {
      const startMinutes = parseTimeToMinutes(todo.startTime || "");
      if (startMinutes === null) return null;
      const duration = todo.timeblockMins ?? 0;
      const endMinutes = startMinutes + duration;
      const iconSymbol = getTaskIconSymbol(todo.icon, todo.text);
      const event: TimelineEvent = {
        id: todo.id,
        title: todo.text,
        startLabel: formatMinutesLabel(startMinutes),
        endLabel: formatMinutesLabel(endMinutes),
        window: duration ? `${formatMinutesLabel(startMinutes)} – ${formatMinutesLabel(endMinutes)}` : "Scheduled",
        durationLabel: duration ? `${duration}m` : undefined,
        color: todo.color ?? "#94a3b8",
        iconSymbol,
        todo,
      };
      return { event, order: startMinutes };
    })
    .filter((value): value is { event: TimelineEvent; order: number } => Boolean(value));
  return enriched.sort((a, b) => a.order - b.order).map((item) => item.event);
}

function pointerToMinutes(event: PointerEvent, element: HTMLDivElement | null) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const y = Math.min(Math.max(event.clientY - rect.top, 0), BOARD_HEIGHT);
  const slot = Math.round(y / SLOT_HEIGHT);
  return slotToMinutes(slot);
}

function snapToSlot(minutes: number) {
  return Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

function slotToMinutes(slot: number) {
  return slot * SLOT_MINUTES;
}

function clampMinutes(start: number, duration: number) {
  const maxStart = DAY_MINUTES - duration;
  return Math.min(Math.max(start, 0), Math.max(maxStart, 0));
}

function reorderIds(todos: TodoItem[], sourceId: string, targetId: string) {
  const ids = todos.map((todo) => todo.id);
  const sourceIndex = ids.indexOf(sourceId);
  const targetIndex = ids.indexOf(targetId);
  if (sourceIndex === -1 || targetIndex === -1) return ids;
  const [removed] = ids.splice(sourceIndex, 1);
  ids.splice(targetIndex, 0, removed);
  return ids;
}

function getOrderedTodos(todos: TodoItem[]) {
  const hasManualOrder = todos.some((todo) => typeof todo.order === "number");
  const copy = [...todos];
  return copy.sort((a, b) => {
    if (hasManualOrder) {
      return (a.order ?? 0) - (b.order ?? 0);
    }
    return getTodoTimeSortValue(a) - getTodoTimeSortValue(b);
  });
}

function getTodoTimeSortValue(todo: TodoItem) {
  const startMinutes = todo.startTime ? parseTimeToMinutes(todo.startTime) : null;
  if (startMinutes !== null) return startMinutes;
  if (todo.timeblockMins) return todo.timeblockMins + 24 * 60;
  return (todo.createdTs ?? 0) + 24 * 60 * 2;
}
