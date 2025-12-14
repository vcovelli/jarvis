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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editPriority, setEditPriority] = useState<TodoPriority>(1);
  const [editTimeblock, setEditTimeblock] = useState<Timeblock | undefined>();
  const [editStartTime, setEditStartTime] = useState("");
  const [panelMode, setPanelMode] = useState<"add" | "edit" | null>(null);
  const { showToast } = useToast();

  const daysWithTodos = useMemo(() => buildDayKeys(state.todos), [state.todos]);
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

  const submitTask = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    addTodo({
      text: trimmed,
      priority,
      timeblockMins: timeblock,
      startTime: startTime || undefined,
      day: selectedDay,
    });
    setText("");
    setTimeblock(30);
    setStartTime("08:00");
    showToast("Todo scheduled");
    setPanelMode(null);
  }, [text, priority, timeblock, startTime, selectedDay, addTodo, showToast]);

  const beginEdit = useCallback(
    (todo: TodoItem) => {
      setEditingId(todo.id);
      setEditText(todo.text);
      setEditPriority(todo.priority);
      setEditTimeblock(todo.timeblockMins);
      setEditStartTime(todo.startTime ?? "");
      setPanelMode("edit");
    },
    [],
  );

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText("");
    setEditStartTime("");
    setEditTimeblock(undefined);
  }, []);

  const closePanel = useCallback(() => {
    setPanelMode(null);
    cancelEdit();
  }, [cancelEdit]);

  const openAddPanel = useCallback(() => {
    cancelEdit();
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
    const frame = requestAnimationFrame(() => setSelectedDay(focusDay as DayKey));
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
      onSubmit: submitEdit,
      submitLabel: "Save changes",
    };
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Todos</p>
        <h1 className="mt-2 text-4xl font-semibold text-white">Mission planner</h1>
        <p className="mt-3 max-w-2xl text-base text-zinc-300">
          Plan today in detail, peek ahead on the mini calendar, and keep recurring tasks grouped.
        </p>
      </header>

      <section className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
        <div className="flex flex-wrap items-center gap-4">
          {daysWithTodos.map((day) => {
            const isActive = day === selectedDay;
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  isActive ? "bg-cyan-300 text-zinc-900" : "bg-white/10 text-zinc-200"
                }`}
              >
                {dayKeyToDate(day).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </button>
            );
          })}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/40 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Viewing</p>
            <p className="text-lg font-semibold text-white">{dayLabelFull}</p>
          </div>
          <button
            type="button"
            onClick={openAddPanel}
            className="flex items-center gap-2 rounded-full bg-emerald-400/90 px-4 py-2 text-sm font-semibold text-zinc-900 shadow-lg transition hover:bg-emerald-300"
          >
            <span className="text-lg">+</span>
            New task
          </button>
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-[2fr,1fr]">
          <TimeBlockingBoard
            todos={todosForDay}
            selectedDay={selectedDay}
            isToday={selectedDay === todayKey}
            highlightId={focusTodoId}
            onScheduleChange={(id, updates) =>
              updateTodoSchedule({ day: selectedDay, id, ...updates })
            }
          />
          <div className="space-y-6">
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
        </div>
      </section>

      {panelState && <TaskPanel {...panelState} onClose={closePanel} />}
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

type TimeBlockingBoardProps = {
  todos: TodoItem[];
  selectedDay: DayKey;
  isToday: boolean;
  highlightId?: string;
  onScheduleChange: (id: string, updates: { startTime?: string; timeblockMins?: Timeblock }) => void;
};

type DragState = {
  id: string;
  type: "move" | "resize";
  startMinutes: number;
  durationMinutes: number;
  pointerOffset?: number;
};

function TimeBlockingBoard({ todos, selectedDay, isToday, highlightId, onScheduleChange }: TimeBlockingBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const blocks = useMemo(() => buildScheduledBlocks(todos, dragState), [todos, dragState]);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const highlightRef = useRef<HTMLDivElement | null>(null);

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

  const handleDragStart = (event: React.PointerEvent, todo: TodoItem, type: "move" | "resize") => {
    if (!todo.startTime || !todo.timeblockMins) return;
    const startMinutes = parseTimeToMinutes(todo.startTime);
    if (startMinutes === null) return;
    event.preventDefault();
    event.stopPropagation();
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
    <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-white">Time blocking</h2>
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">
            {dayKeyToDate(selectedDay).toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
        <span className="text-xs uppercase tracking-[0.3em] text-zinc-400">12 &rarr; 12</span>
      </div>
      <div className="mt-6 rounded-2xl border border-white/5 bg-black/40">
        <div ref={boardRef} className="relative" style={{ height: BOARD_HEIGHT }}>
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
                  className="pointer-events-none absolute left-0 right-0 z-30"
                  style={{ top: (nowMinutes / SLOT_MINUTES) * SLOT_HEIGHT }}
                >
                  <div className="border-t border-red-500" />
                  <span className="absolute -top-3 right-3 rounded-full bg-red-500 px-2 py-[2px] text-[10px] font-semibold text-white shadow">
                    Now
                  </span>
                </div>
              )}
              {blocks.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-zinc-400">
                  Add a start time + block to place todos on the map.
                </div>
              ) : (
                blocks.map((block) => {
                  const highlight = highlightId === block.id;
                  return (
                  <div
                    key={block.id}
                    ref={highlight ? highlightRef : undefined}
                    onPointerDown={(event) => handleDragStart(event, block.originalTodo, "move")}
                    className={`group absolute left-4 right-4 z-10 cursor-grab rounded-2xl border px-3 py-2 text-xs shadow-lg ${
                        block.hasConflict
                          ? "border-amber-300 bg-amber-200/90 text-zinc-900"
                          : `${priorityClasses(block.priority)} border-white/10`
                      } ${highlight ? "ring-2 ring-cyan-300/70" : ""}`}
                      style={{
                        top: (block.startMinutes / SLOT_MINUTES) * SLOT_HEIGHT,
                        height: Math.max((block.durationMinutes / SLOT_MINUTES) * SLOT_HEIGHT - 2, 28),
                      }}
                    >
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
    <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-lg">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-white">Task stack</h3>
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
                className={`flex items-center justify-between rounded-2xl border border-white/5 bg-black/20 px-4 py-3 ${
                  highlight ? "ring-2 ring-cyan-300/70" : ""
                } ${draggingId === todo.id ? "opacity-60" : ""}`}
              >
                <label className="flex flex-1 items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 cursor-pointer accent-cyan-300"
                    checked={todo.done}
                    onChange={() => onToggle(todo.id)}
                  />
                  <div>
                    <p className={`text-sm font-medium ${todo.done ? "text-zinc-500 line-through" : "text-white"}`}>
                      {todo.text}
                    </p>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">
                      {buildTodoMeta(todo)}
                    </p>
                  </div>
                </label>
                <div className="flex gap-2">
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
    <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-lg">
      <div className="flex items-center justify-between">
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
              <p className="text-base font-semibold text-white">{slot.label}</p>
              <p className="text-sm text-zinc-400">{slot.meta}</p>
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
  onSubmit,
  submitLabel,
  onClose,
}: TaskPanelProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-[#0b1121] p-6 shadow-2xl sm:rounded-l-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
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
          <button
            type="submit"
            className="mt-2 rounded-2xl bg-gradient-to-r from-emerald-300 to-cyan-400 px-4 py-3 text-sm font-semibold text-zinc-900"
          >
            {submitLabel}
          </button>
        </form>
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
  onSubmit: () => void;
  submitLabel: string;
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

function buildDayKeys(record: Record<DayKey, TodoItem[]>): DayKey[] {
  const keys = Object.keys(record);
  if (!keys.includes(getDayKey())) {
    keys.push(getDayKey());
  }
  return keys.sort((a, b) => (a > b ? 1 : -1)).slice(-7);
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
