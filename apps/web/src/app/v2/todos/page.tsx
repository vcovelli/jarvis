"use client";

import { useSearchParams } from "next/navigation";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Day,
  DayKey,
  MustWinEntry,
  Timeblock,
  TodoItem,
  TodoPriority,
  dayKeyToDate,
  getDayKey,
  normalizeDayKey,
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
const SLOT_HEIGHT = 22;
const BOARD_HEIGHT = SLOTS_PER_DAY * SLOT_HEIGHT;
const HOUR_LABELS = Array.from({ length: 24 }, (_, index) => index);
const DAY_MINUTES = 24 * 60;
const NOW_UPDATE_MS = 15_000;
const PLANNER_TIMELINE_MODE_KEY = "jarvis-daily-planner-timeline-mode-v1";
const MOBILE_TASK_MIN_HEIGHT = 44;
const MOBILE_TASK_MINUTE_HEIGHT = 0.85;
const MOBILE_GAP_MIN_HEIGHT = 36;
const MOBILE_GAP_MAX_HEIGHT = 96;
const MOBILE_GAP_MINUTE_HEIGHT = 0.18;
const DEFAULT_START_TIME = "08:00";
const DEFAULT_TIMEBLOCK: Timeblock = 30;
const startTimeOptions = buildStartTimeOptions(SLOT_MINUTES);
const durationPresets: Timeblock[] = [15, 30, 45, 60, 90, 120];
const blockColors = [
  "#f472b6",
  "#f97316",
  "#facc15",
  "#34d399",
  "#2dd4bf",
  "#60a5fa",
  "#818cf8",
  "#a78bfa",
  "#f87171",
  "#fb7185",
  "#38bdf8",
  "#4ade80",
];
const defaultBlockColor = blockColors[0];
const repeatDayLabels: Array<{ day: Day; label: string }> = [
  { day: 0, label: "Sun" },
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
  { day: 6, label: "Sat" },
];
const repeatHorizonDays = 60;
type IconOption = { id: string; label: string; symbol: string };
const taskIconOptions: IconOption[] = [
  { id: "alarm", label: "Alarm", symbol: "⏰" },
  { id: "sunrise", label: "Sunrise", symbol: "🌅" },
  { id: "coffee", label: "Coffee", symbol: "☕" },
  { id: "dumbbell", label: "Workout", symbol: "🏋️" },
  { id: "book", label: "Study", symbol: "📘" },
  { id: "moon", label: "Night", symbol: "🌙" },
  { id: "spark", label: "Focus", symbol: "⚡" },
  { id: "laptop", label: "Deep work", symbol: "💻" },
  { id: "calendar", label: "Meeting", symbol: "📅" },
  { id: "phone", label: "Call", symbol: "📞" },
  { id: "email", label: "Email", symbol: "✉️" },
  { id: "pen", label: "Write", symbol: "📝" },
  { id: "chart", label: "Finance", symbol: "📈" },
  { id: "cart", label: "Errands", symbol: "🛒" },
  { id: "food", label: "Meal", symbol: "🍽️" },
  { id: "car", label: "Commute", symbol: "🚗" },
  { id: "broom", label: "Clean", symbol: "🧹" },
  { id: "heart", label: "Health", symbol: "❤️" },
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
type RepeatType = "none" | "weekly" | "monthly";
type TimelineMode = "list" | "schedule";
type ExistingTaskOption = {
  id: string;
  label: string;
  todo: TodoItem;
};
type StyleSuggestion = {
  color?: string;
  icon?: string;
};

export default function TodosPage() {
  const {
    state,
    hydrated,
    addTodo,
    toggleTodo,
    updateTodoPriority,
    updateTodo,
    moveTodo,
    deleteTodo,
    reorderTodos,
    updateTodoSchedule,
    setMustWin,
    toggleMustWin,
  } = useJarvisState();
  const search = useSearchParams();
  const initialFocusTodoId = search?.get("focus") ?? undefined;
  const focusDay = search?.get("day");
  const todayKey = getDayKey();
  const [selectedDay, setSelectedDay] = useState<DayKey>(() =>
    normalizeDayKey(focusDay ?? todayKey, todayKey),
  );
  const [focusedTodoId, setFocusedTodoId] = useState<string | undefined>(() => initialFocusTodoId);
  const todaysMustWin = state.mustWin[selectedDay];
  const [text, setText] = useState("");
  const [priority, setPriority] = useState<TodoPriority>(1);
  const [timeblock, setTimeblock] = useState<Timeblock | undefined>(DEFAULT_TIMEBLOCK);
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME);
  const [endTime, setEndTime] = useState("08:30");
  const [color, setColor] = useState<string>(defaultBlockColor);
  const [icon, setIcon] = useState<string>(defaultTaskIcon);
  const [mustWinText, setMustWinText] = useState("");
  const [mustWinTime, setMustWinTime] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editPriority, setEditPriority] = useState<TodoPriority>(1);
  const [editTimeblock, setEditTimeblock] = useState<Timeblock | undefined>();
  const [editDay, setEditDay] = useState<DayKey>(() => selectedDay);
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editColor, setEditColor] = useState<string>(defaultBlockColor);
  const [editIcon, setEditIcon] = useState<string>(defaultTaskIcon);
  const [applyToSeries, setApplyToSeries] = useState(false);
  const [panelMode, setPanelMode] = useState<"add" | "edit" | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [repeatType, setRepeatType] = useState<RepeatType>("none");
  const [repeatWeekdays, setRepeatWeekdays] = useState<Day[]>([]);
  const [repeatMonthDay, setRepeatMonthDay] = useState<number>(
    dayKeyToDate(selectedDay).getDate(),
  );
  const [existingTaskId, setExistingTaskId] = useState<string>("");
  const [styleLocked, setStyleLocked] = useState(false);
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
  const existingTaskOptions = useMemo(() => {
    const flattened = Object.values(state.todos).flat();
    const sorted = [...flattened].sort((a, b) => b.createdTs - a.createdTs);
    const seen = new Set<string>();
    const options: ExistingTaskOption[] = [];
    for (const todo of sorted) {
      const signature = `${todo.text}|${todo.priority}|${todo.timeblockMins ?? ""}|${todo.startTime ?? ""}|${todo.color ?? ""}|${todo.icon ?? ""}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      options.push({
        id: todo.id,
        todo,
        label: todo.text,
      });
      if (options.length >= 12) break;
    }
    return options;
  }, [state.todos]);
  const editingTodo = editingId ? todosForDay.find((todo) => todo.id === editingId) : null;
  const seriesTargets = useMemo(() => {
    if (!editingTodo) return [];
    return buildSeriesTargets(state.todos, editingTodo, selectedDay);
  }, [editingTodo, selectedDay, state.todos]);
  const hasSeriesTargets = seriesTargets.length > 1;
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

  const focusTodoOnPage = useCallback((id: string) => {
    setFocusedTodoId(undefined);
    requestAnimationFrame(() => setFocusedTodoId(id));
  }, []);


  const submitTask = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const computedTimeblock = computeTimeblockFromTimes(startTime, endTime);
    const basePayload = {
      text: trimmed,
      priority,
      timeblockMins: computedTimeblock,
      startTime: startTime || undefined,
      color,
      icon,
    };
    const repeatDays = buildRepeatDays({
      startDay: selectedDay,
      repeatType,
      repeatWeekdays,
      repeatMonthDay,
      horizonDays: repeatHorizonDays,
    });
    const seriesId = repeatType === "none" ? undefined : createSeriesId();
    repeatDays.forEach((day) => {
      addTodo({
        ...basePayload,
        day,
        seriesId,
      });
    });
    setText("");
    setTimeblock(DEFAULT_TIMEBLOCK);
    setStartTime(DEFAULT_START_TIME);
    setEndTime("08:30");
    setColor(defaultBlockColor);
    setIcon(defaultTaskIcon);
    setStyleLocked(false);
    setRepeatType("none");
    setRepeatWeekdays([]);
    setRepeatMonthDay(dayKeyToDate(selectedDay).getDate());
    setExistingTaskId("");
    showToast("Todo scheduled");
    setPanelMode(null);
  }, [
    text,
    priority,
    startTime,
    endTime,
    selectedDay,
    addTodo,
    showToast,
    color,
    icon,
    repeatType,
    repeatWeekdays,
    repeatMonthDay,
  ]);

  const submitMustWin = useCallback(() => {
    const trimmed = mustWinText.trim();
    if (!trimmed) return;
    setMustWin({
      day: selectedDay,
      text: trimmed,
      timeBound: mustWinTime || undefined,
    });
    setMustWinText("");
    setMustWinTime("");
    showToast("Must Win locked");
  }, [mustWinText, mustWinTime, selectedDay, setMustWin, showToast]);

  const beginEdit = useCallback(
    (todo: TodoItem) => {
      setEditingId(todo.id);
      setEditText(todo.text);
      setEditPriority(todo.priority);
      setEditTimeblock(todo.timeblockMins);
      setEditDay(selectedDay);
      setEditStartTime(todo.startTime ?? "");
      setEditEndTime(buildEndTime(todo.startTime ?? "", todo.timeblockMins));
      setEditColor(todo.color ?? defaultBlockColor);
      setEditIcon(todo.icon ?? defaultTaskIcon);
      setApplyToSeries(false);
      setPanelMode("edit");
    },
    [selectedDay],
  );

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText("");
    setEditDay(selectedDay);
    setEditStartTime("");
    setEditEndTime("");
    setEditTimeblock(undefined);
    setEditColor(defaultBlockColor);
    setEditIcon(defaultTaskIcon);
    setApplyToSeries(false);
  }, [selectedDay]);

  const closePanel = useCallback(() => {
    setPanelMode(null);
    cancelEdit();
  }, [cancelEdit]);

  const openAddPanel = useCallback(() => {
    cancelEdit();
    setColor(defaultBlockColor);
    setIcon(defaultTaskIcon);
    setStyleLocked(false);
    setRepeatType("none");
    setRepeatWeekdays([]);
    setRepeatMonthDay(dayKeyToDate(selectedDay).getDate());
    setExistingTaskId("");
    setStartTime(DEFAULT_START_TIME);
    setEndTime("08:30");
    setTimeblock(DEFAULT_TIMEBLOCK);
    setPanelMode("add");
  }, [cancelEdit, selectedDay]);

  const handleTextChange = useCallback(
    (value: string) => {
      setText(value);
      if (!panelMode || panelMode !== "add" || styleLocked) return;
      const suggestion = suggestTaskStyle(value);
      if (suggestion.color) {
        setColor(suggestion.color);
      }
      if (suggestion.icon) {
        setIcon(suggestion.icon);
      }
    },
    [panelMode, styleLocked],
  );

  const applyTimeRange = useCallback((range: TimeRangeState) => {
    setStartTime(range.startTime);
    setEndTime(range.endTime);
    setTimeblock(range.timeblock);
  }, []);

  const handleStartTimeChange = useCallback((value: string) => {
    const duration = getTimeRangeDuration(startTime, endTime, timeblock);
    applyTimeRange(buildRangeFromStart(value, duration));
  }, [applyTimeRange, endTime, startTime, timeblock]);

  const handleEndTimeChange = useCallback((value: string) => {
    const duration = getTimeRangeDuration(startTime, endTime, timeblock);
    applyTimeRange(buildRangeFromEnd(value, startTime, duration));
  }, [applyTimeRange, endTime, startTime, timeblock]);

  const handleDurationChange = useCallback((duration: Timeblock) => {
    applyTimeRange(buildRangeFromStart(startTime || DEFAULT_START_TIME, duration));
  }, [applyTimeRange, startTime]);

  const handleClearTimeRange = useCallback(() => {
    applyTimeRange({ startTime: "", endTime: "", timeblock: undefined });
  }, [applyTimeRange]);

  const handleSelectExisting = useCallback(
    (id: string) => {
      setExistingTaskId(id);
      const option = existingTaskOptions.find((item) => item.id === id);
      if (!option) return;
      const todo = option.todo;
      setText(todo.text);
      setPriority(todo.priority);
      setTimeblock(todo.timeblockMins ?? undefined);
      setStartTime(todo.startTime ?? "");
      setEndTime(buildEndTime(todo.startTime ?? "", todo.timeblockMins));
      setColor(todo.color ?? defaultBlockColor);
      setIcon(todo.icon ?? defaultTaskIcon);
      setStyleLocked(true);
    },
    [existingTaskOptions],
  );

  const submitEdit = useCallback(() => {
    if (!editingId) return;
    const trimmed = editText.trim();
    if (!trimmed) return;
    const computedTimeblock = computeTimeblockFromTimes(editStartTime, editEndTime);
    const targetDay = normalizeDayKey(editDay, selectedDay);
    const updates = {
      text: trimmed,
      priority: editPriority,
      timeblockMins: computedTimeblock,
      startTime: editStartTime || undefined,
      color: editColor,
      icon: editIcon,
    };

    if (targetDay !== selectedDay) {
      moveTodo({
        fromDay: selectedDay,
        id: editingId,
        toDay: targetDay,
        updates,
      });
      setSelectedDay(targetDay);
      showToast(`Todo moved to ${formatTaskPanelDate(targetDay)}`);
      closePanel();
      return;
    }

    const targets =
      applyToSeries && seriesTargets.length
        ? seriesTargets
        : [{ day: selectedDay, id: editingId }];
    const seen = new Set<string>();
    targets.forEach((target) => {
      const key = `${target.day}-${target.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      updateTodo({
        day: target.day,
        id: target.id,
        updates,
      });
    });
    showToast(
      applyToSeries && targets.length > 1
        ? `Updated ${targets.length} tasks`
        : "Todo updated",
    );
    closePanel();
  }, [
    editingId,
    editText,
    editPriority,
    editStartTime,
    editEndTime,
    editColor,
    editIcon,
    editDay,
    selectedDay,
    moveTodo,
    updateTodo,
    showToast,
    closePanel,
    applyToSeries,
    seriesTargets,
  ]);

  const applyEditTimeRange = useCallback((range: TimeRangeState) => {
    setEditStartTime(range.startTime);
    setEditEndTime(range.endTime);
    setEditTimeblock(range.timeblock);
  }, []);

  const handleEditStartTimeChange = useCallback((value: string) => {
    const duration = getTimeRangeDuration(editStartTime, editEndTime, editTimeblock);
    applyEditTimeRange(buildRangeFromStart(value, duration));
  }, [applyEditTimeRange, editEndTime, editStartTime, editTimeblock]);

  const handleEditEndTimeChange = useCallback((value: string) => {
    const duration = getTimeRangeDuration(editStartTime, editEndTime, editTimeblock);
    applyEditTimeRange(buildRangeFromEnd(value, editStartTime, duration));
  }, [applyEditTimeRange, editEndTime, editStartTime, editTimeblock]);

  const handleEditDurationChange = useCallback((duration: Timeblock) => {
    applyEditTimeRange(buildRangeFromStart(editStartTime || DEFAULT_START_TIME, duration));
  }, [applyEditTimeRange, editStartTime]);

  const handleEditClearTimeRange = useCallback(() => {
    applyEditTimeRange({ startTime: "", endTime: "", timeblock: undefined });
  }, [applyEditTimeRange]);

  const handleDelete = useCallback(
    (id: string) => {
      if (editingId === id) {
        closePanel();
      }
      deleteTodo({ day: selectedDay, id });
      setFocusedTodoId((current) => (current === id ? undefined : current));
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
    const nextDay = normalizeDayKey(focusDay ?? todayKey, todayKey);
    const frame = requestAnimationFrame(() => setSelectedDay(nextDay));
    return () => cancelAnimationFrame(frame);
  }, [focusDay, todayKey]);

  useEffect(() => {
    setFocusedTodoId(initialFocusTodoId);
  }, [initialFocusTodoId]);

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
      onTextChange: handleTextChange,
      priority,
      onPriorityChange: setPriority,
      timeblock,
      startTime,
      onStartTimeChange: handleStartTimeChange,
      endTime,
      onEndTimeChange: handleEndTimeChange,
      onDurationChange: handleDurationChange,
      onClearTimeRange: handleClearTimeRange,
      color,
      onColorChange: (value) => {
        setStyleLocked(true);
        setColor(value);
      },
      colorOptions: blockColors,
      icon,
      onIconChange: (value) => {
        setStyleLocked(true);
        setIcon(value);
      },
      iconOptions: taskIconOptions,
      existingTasks: existingTaskOptions,
      existingTaskId,
      onSelectExisting: handleSelectExisting,
      repeatType,
      onRepeatTypeChange: setRepeatType,
      repeatWeekdays,
      onToggleRepeatWeekday: (day) =>
        setRepeatWeekdays((current) =>
          current.includes(day) ? current.filter((value) => value !== day) : [...current, day],
        ),
      repeatMonthDay,
      onRepeatMonthDayChange: setRepeatMonthDay,
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
      day: editDay,
      onDayChange: (day) => {
        setEditDay(day);
        if (day !== selectedDay) {
          setApplyToSeries(false);
        }
      },
      timeblock: editTimeblock,
      startTime: editStartTime,
      onStartTimeChange: handleEditStartTimeChange,
      endTime: editEndTime,
      onEndTimeChange: handleEditEndTimeChange,
      onDurationChange: handleEditDurationChange,
      onClearTimeRange: handleEditClearTimeRange,
      color: editColor,
      onColorChange: setEditColor,
      colorOptions: blockColors,
      icon: editIcon,
      onIconChange: setEditIcon,
      iconOptions: taskIconOptions,
      onSubmit: submitEdit,
      submitLabel: "Save changes",
      onDelete: () => handleDelete(editingId),
      applyToSeries: hasSeriesTargets && editDay === selectedDay ? applyToSeries : undefined,
      onApplyToSeriesChange: hasSeriesTargets && editDay === selectedDay ? setApplyToSeries : undefined,
      seriesCount: hasSeriesTargets && editDay === selectedDay ? seriesTargets.length : undefined,
    };
  }

  return (
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
          onDelete={handleDelete}
          highlightId={focusedTodoId}
          onFocusTodo={focusTodoOnPage}
          onToggle={(id) => toggleTodo({ day: selectedDay, id })}
          onShiftDay={handleShiftDay}
          onJumpToday={jumpToToday}
        />
        <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-5 xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_430px]">
          <TimeBlockingBoard
            todos={todosForDay}
            selectedDay={selectedDay}
            isToday={selectedDay === todayKey}
            highlightId={focusedTodoId}
            weekDays={weekDays}
            onScheduleChange={(id, updates) =>
              updateTodoSchedule({ day: selectedDay, id, ...updates })
            }
            onEditRequest={(todo) => beginEdit(todo)}
            onDeleteRequest={(id) => handleDelete(id)}
            onToggle={(id) => toggleTodo({ day: selectedDay, id })}
            onAddTask={openAddPanel}
            onShiftDay={handleShiftDay}
            onSelectDay={handleDaySelect}
            onOpenCalendar={() => setCalendarOpen(true)}
            onJumpToday={jumpToToday}
          />
          <DesktopPlannerRail
            todos={todosForDay}
            selectedDay={selectedDay}
            todayKey={todayKey}
            todaysMustWin={todaysMustWin}
            mustWinText={mustWinText}
            mustWinTime={mustWinTime}
            onMustWinTextChange={setMustWinText}
            onMustWinTimeChange={setMustWinTime}
            onSubmitMustWin={submitMustWin}
            onToggleMustWin={() => toggleMustWin({ day: selectedDay })}
            onEdit={(todo) => beginEdit(todo)}
            onDelete={(id) => handleDelete(id)}
            onReorder={handleReorder}
            highlightId={focusedTodoId}
            onToggle={(id) => toggleTodo({ day: selectedDay, id })}
            onCyclePriority={(id, next) =>
              updateTodoPriority({ day: selectedDay, id, priority: next })
            }
            onAddTask={openAddPanel}
            onFocusTodo={focusTodoOnPage}
          />
        </div>

        <div className="lg:hidden">
          <MustWinCard
            selectedDay={selectedDay}
            todayKey={todayKey}
            todaysMustWin={todaysMustWin}
            mustWinText={mustWinText}
            mustWinTime={mustWinTime}
            onMustWinTextChange={setMustWinText}
            onMustWinTimeChange={setMustWinTime}
            onSubmit={submitMustWin}
            onToggle={() => toggleMustWin({ day: selectedDay })}
          />
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
        className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400 text-2xl font-semibold text-zinc-900 shadow-2xl lg:hidden"
      >
        <span className="sr-only">Add task</span>
        +
      </button>
    </div>
  );
}

type DesktopPlannerRailProps = {
  todos: TodoItem[];
  selectedDay: DayKey;
  todayKey: DayKey;
  todaysMustWin?: MustWinEntry;
  mustWinText: string;
  mustWinTime: string;
  onMustWinTextChange: (value: string) => void;
  onMustWinTimeChange: (value: string) => void;
  onSubmitMustWin: () => void;
  onToggleMustWin: () => void;
  onEdit: (todo: TodoItem) => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  highlightId?: string;
  onToggle: (id: string) => void;
  onCyclePriority: (id: string, next: TodoPriority) => void;
  onAddTask: () => void;
  onFocusTodo: (id: string) => void;
};

function DesktopPlannerRail({
  todos,
  selectedDay,
  todayKey,
  todaysMustWin,
  mustWinText,
  mustWinTime,
  onMustWinTextChange,
  onMustWinTimeChange,
  onSubmitMustWin,
  onToggleMustWin,
  onEdit,
  onDelete,
  onReorder,
  highlightId,
  onToggle,
  onCyclePriority,
  onAddTask,
  onFocusTodo,
}: DesktopPlannerRailProps) {
  const isToday = selectedDay === todayKey;
  const events = useMemo(() => buildTimelineEvents(todos), [todos]);
  const scheduleSegments = useMemo(() => buildScheduleSegments(events), [events]);
  const nowMinutes = useNowMinutes(isToday);
  const nowContext = useMemo(
    () => getNowPlannerContext(scheduleSegments, nowMinutes),
    [scheduleSegments, nowMinutes],
  );
  const completedCount = todos.filter((todo) => todo.done).length;
  const scheduledCount = events.length;
  const unscheduledCount = Math.max(todos.length - scheduledCount, 0);
  const totalPlannedMinutes = todos.reduce((sum, todo) => sum + (todo.timeblockMins ?? 0), 0);
  const completionLabel = todos.length ? `${Math.round((completedCount / todos.length) * 100)}%` : "0%";

  return (
    <aside className="hidden min-w-0 flex-col gap-5 lg:sticky lg:top-8 lg:flex lg:max-h-[calc(100dvh-4rem)] lg:overflow-y-auto lg:pr-1">
      <section className="rounded-[24px] border border-white/10 bg-[#0b1224]/85 p-4 text-white shadow-[0_24px_70px_rgba(2,6,23,0.24)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.35em] text-cyan-200/70">Control rail</p>
            <h3 className="mt-1 text-lg font-semibold text-white">Today at a glance</h3>
          </div>
          <button
            type="button"
            onClick={onAddTask}
            className="rounded-full bg-emerald-400 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-950 shadow-lg shadow-emerald-500/20"
          >
            New
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <PlannerMetric label="Done" value={`${completedCount}/${todos.length}`} />
          <PlannerMetric label="Progress" value={completionLabel} />
          <PlannerMetric label="Scheduled" value={`${scheduledCount}`} />
          <PlannerMetric label="Open" value={`${unscheduledCount}`} />
        </div>
        <div className="mt-3 rounded-2xl border border-white/10 bg-black/25 px-3 py-3">
          <p className="text-[10px] uppercase tracking-[0.28em] text-white/50">Planned load</p>
          <p className="mt-1 text-xl font-semibold text-white">{formatPlannedDuration(totalPlannedMinutes)}</p>
        </div>
      </section>

      {isToday && (
        <NowStatusCard
          nowMinutes={nowMinutes}
          context={nowContext}
          compact
          onCurrentTaskClick={(todo) => onFocusTodo(todo.id)}
        />
      )}

      <MustWinCard
        selectedDay={selectedDay}
        todayKey={todayKey}
        todaysMustWin={todaysMustWin}
        mustWinText={mustWinText}
        mustWinTime={mustWinTime}
        onMustWinTextChange={onMustWinTextChange}
        onMustWinTimeChange={onMustWinTimeChange}
        onSubmit={onSubmitMustWin}
        onToggle={onToggleMustWin}
        compact
      />

      <TaskList
        todos={todos}
        onEdit={onEdit}
        onDelete={onDelete}
        onReorder={onReorder}
        highlightId={highlightId}
        onToggle={onToggle}
        onCyclePriority={onCyclePriority}
        variant="rail"
      />
    </aside>
  );
}

function PlannerMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
      <p className="text-[9px] uppercase tracking-[0.3em] text-white/45">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

type MustWinCardProps = {
  selectedDay: DayKey;
  todayKey: DayKey;
  todaysMustWin?: MustWinEntry;
  mustWinText: string;
  mustWinTime: string;
  onMustWinTextChange: (value: string) => void;
  onMustWinTimeChange: (value: string) => void;
  onSubmit: () => void;
  onToggle: () => void;
  compact?: boolean;
};

function MustWinCard({
  selectedDay,
  todayKey,
  todaysMustWin,
  mustWinText,
  mustWinTime,
  onMustWinTextChange,
  onMustWinTimeChange,
  onSubmit,
  onToggle,
  compact = false,
}: MustWinCardProps) {
  return (
    <div className={`glass-panel border border-amber-300/40 bg-gradient-to-br from-amber-500/10 via-white/5 to-rose-500/10 backdrop-blur-lg ${compact ? "rounded-[24px] p-4" : "rounded-3xl p-6"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className={`${compact ? "text-base" : "text-lg"} font-medium text-white`}>Top 1 Must Win</h2>
          <p className="mt-1 text-sm text-zinc-300">Keep it concrete, time-bound, and binary.</p>
        </div>
        {selectedDay === todayKey && todaysMustWin?.done && (
          <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-100 mustwin-completed">
            Completed
          </span>
        )}
      </div>
      {todaysMustWin ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-400/40 bg-black/40 px-4 py-3">
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold text-white">{todaysMustWin.text}</p>
            {todaysMustWin.timeBound && (
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-amber-200">
                By {todaysMustWin.timeBound}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onToggle}
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] whitespace-nowrap ${
              todaysMustWin.done
                ? "bg-emerald-400 text-emerald-950"
                : "bg-amber-300 text-amber-950"
            }`}
          >
            {todaysMustWin.done ? "Won" : "Mark done"}
          </button>
        </div>
      ) : (
        <div className={`mt-4 grid gap-3 ${compact ? "" : "sm:grid-cols-[1fr_200px_auto]"}`}>
          <input
            value={mustWinText}
            onChange={(event) => onMustWinTextChange(event.target.value)}
            className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-500"
            placeholder="What actually matters?"
          />
          <input
            value={mustWinTime}
            onChange={(event) => onMustWinTimeChange(event.target.value)}
            className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-500"
            placeholder="By when"
          />
          <button
            type="button"
            onClick={onSubmit}
            className="rounded-full bg-amber-300 px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-amber-950"
          >
            Lock it
          </button>
        </div>
      )}
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
          className="w-full appearance-none rounded-2xl border border-white/15 bg-[#111629] px-4 py-3 text-base font-medium text-white focus:border-cyan-400/60 focus:outline-none mobile-todos-input sm:text-sm"
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

function TimeRangeSelector({
  startTime,
  endTime,
  timeblock,
  options,
  onStartTimeChange,
  onEndTimeChange,
  onDurationChange,
  onClear,
}: {
  startTime: string;
  endTime: string;
  timeblock?: Timeblock;
  options: StartTimeOption[];
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
  onDurationChange: (value: Timeblock) => void;
  onClear: () => void;
}) {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  const hasRange = startMinutes !== null && endMinutes !== null && endMinutes > startMinutes;
  const durationMinutes = timeblock ?? (hasRange ? endMinutes - startMinutes : undefined);
  const startLabel = startMinutes !== null ? formatMinutesLabel(startMinutes) : "Choose start";
  const endLabel = endMinutes !== null ? formatMinutesLabel(endMinutes) : "Choose end";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/50">Time window</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {hasRange ? `${startLabel} to ${endLabel}` : "No time selected"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded-full border border-white/15 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/70 transition hover:border-white/40 hover:text-white"
        >
          No time
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TimePillSelector label="Start" value={startTime} options={options} onChange={onStartTimeChange} />
        <TimePillSelector label="End" value={endTime} options={options} onChange={onEndTimeChange} />
      </div>
      <div className="space-y-2">
        <p className="pl-1 text-xs uppercase tracking-[0.3em] text-zinc-400">Duration</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {durationPresets.map((duration) => {
            const active = durationMinutes === duration;
            return (
              <button
                key={duration}
                type="button"
                onClick={() => onDurationChange(duration)}
                className={`rounded-2xl border px-2 py-3 text-xs font-semibold transition ${
                  active
                    ? "border-cyan-300/70 bg-cyan-300/15 text-cyan-100"
                    : "border-white/10 bg-black/20 text-white/70 hover:border-white/30 hover:text-white"
                }`}
              >
                {formatDurationPreset(duration)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TimePillSelector({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: StartTimeOption[];
  onChange: (value: string) => void;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);
  const activeIndex = options.findIndex((option) => option.value === value);
  const fallbackIndex = Math.max(
    options.findIndex((option) => option.value === DEFAULT_START_TIME),
    0,
  );
  const currentIndex = activeIndex >= 0 ? activeIndex : fallbackIndex;
  const canMoveEarlier = currentIndex > 0;
  const canMoveLater = currentIndex < options.length - 1;

  const moveBy = useCallback(
    (delta: number) => {
      const nextIndex = Math.min(Math.max(currentIndex + delta, 0), options.length - 1);
      const nextOption = options[nextIndex];
      if (nextOption) {
        onChange(nextOption.value);
      }
    },
    [currentIndex, onChange, options],
  );

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLButtonElement>(`button[data-value="${value}"]`);
    if (!active) return;
    const target = active.offsetTop - list.clientHeight / 2 + active.offsetHeight / 2;
    const nextTop = Math.max(0, Math.min(target, list.scrollHeight - list.clientHeight));
    const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
    list.scrollTo({ top: nextTop, behavior });
  }, [value]);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollTimeoutRef.current !== null) {
      window.clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = window.setTimeout(() => {
      const list = listRef.current;
      if (!list) return;
      const buttons = Array.from(
        list.querySelectorAll("button[data-value]"),
      ) as HTMLButtonElement[];
      if (!buttons.length) return;
      const listRect = list.getBoundingClientRect();
      const listCenter = listRect.top + listRect.height / 2;
      let closestValue: string | null = null;
      let closestDistance = Number.POSITIVE_INFINITY;
      buttons.forEach((button) => {
        const rect = button.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const distance = Math.abs(center - listCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestValue = button.getAttribute("data-value");
        }
      });
      const nextValue = closestValue ?? undefined;
      if (nextValue && nextValue !== value) {
        onChange(nextValue);
      }
    }, 90);
  }, [onChange, value]);

  return (
    <div className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-zinc-400">
      <div className="flex items-center justify-between gap-2 pl-1">
        <span>{label}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => moveBy(-1)}
            disabled={!canMoveEarlier}
            aria-label={`Move ${label} earlier`}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-sm text-white/70 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => moveBy(1)}
            disabled={!canMoveLater}
            aria-label={`Move ${label} later`}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-sm text-white/70 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
          >
            +
          </button>
        </div>
      </div>
      <div className="relative rounded-2xl border border-white/10 bg-black/30 p-2 shadow-inner">
        <div className="pointer-events-none absolute inset-x-3 top-1/2 h-10 -translate-y-1/2 rounded-full border border-cyan-200/20 bg-white/[0.04]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-8 rounded-t-2xl bg-gradient-to-b from-[#0b1121] via-[#0b1121]/85 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-2xl bg-gradient-to-t from-[#0b1121] via-[#0b1121]/85 to-transparent" />
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="hide-scrollbar h-44 overflow-y-auto overscroll-contain scroll-smooth snap-y snap-mandatory py-[68px]"
          aria-label={`${label} selector`}
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                data-value={option.value}
                aria-pressed={active}
                onClick={() => onChange(option.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                    event.preventDefault();
                    moveBy(1);
                  }
                  if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                    event.preventDefault();
                    moveBy(-1);
                  }
                }}
                className={`mx-auto flex h-10 w-full snap-center items-center justify-center rounded-full px-4 text-center text-[11px] font-semibold uppercase tracking-[0.25em] transition ${
                  active
                    ? "text-cyan-100"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
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

function CustomEmojiField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-zinc-400">
      <span className="pl-1">Custom emoji</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={4}
        className="rounded-2xl border border-white/15 bg-[#111629] px-4 py-3 text-base font-medium text-white focus:border-cyan-400/60 focus:outline-none mobile-todos-input sm:text-sm"
        placeholder="e.g. 🧠"
      />
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
  onDelete: (id: string) => void;
  highlightId?: string;
  onFocusTodo: (id: string) => void;
  onToggle: (id: string) => void;
  onShiftDay: (delta: number) => void;
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
  onDelete,
  highlightId,
  onFocusTodo,
  onToggle,
  onShiftDay,
  onJumpToday,
}: DayTimelineProps) {
  const [timelineMode, setTimelineMode] = useState<TimelineMode>(() => readStoredTimelineMode());
  const highlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    writePlannerPreference(PLANNER_TIMELINE_MODE_KEY, timelineMode);
  }, [timelineMode]);

  useEffect(() => {
    if (!highlightId || !highlightRef.current) return;
    highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, timelineMode]);

  const events = useMemo(() => buildTimelineEvents(todos), [todos]);
  const scheduledEvents = useMemo(
    () => events.filter((event) => Boolean(event.todo.startTime)),
    [events],
  );
  const unscheduledTasks = useMemo(() => todos.filter((todo) => !todo.startTime), [todos]);
  const scheduleSegments = useMemo(() => buildScheduleSegments(scheduledEvents), [scheduledEvents]);
  const selectedDate = dayKeyToDate(selectedDay);
  const monthLabel = selectedDate.toLocaleDateString(undefined, { month: "long" });
  const weekdayLabel = selectedDate.toLocaleDateString(undefined, { weekday: "long" });
  const dayNumber = selectedDate.getDate();
  const yearLabel = selectedDate.getFullYear();
  const taskCount = todos.length;
  const totalPlannedMinutes = todos.reduce((sum, todo) => sum + (todo.timeblockMins ?? 0), 0);
  const recurringCount = todos.filter((todo) => Boolean(todo.seriesId)).length;
  const todayKey = getDayKey();
  const isToday = selectedDay === todayKey;
  const nowMinutes = useNowMinutes(isToday);
  const nowContext = useMemo(
    () => getNowPlannerContext(scheduleSegments, nowMinutes),
    [scheduleSegments, nowMinutes],
  );
  return (
    <div className="-mx-4 rounded-none border border-transparent bg-[#0b1224] px-4 py-5 text-white shadow-none mobile-todos-panel sm:mx-0 sm:rounded-3xl lg:hidden">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
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
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onShiftDay(-1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-xl leading-none text-white/85 transition hover:border-white/50 hover:text-white"
              aria-label="Previous day"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={onJumpToday}
              className="rounded-full border border-white/20 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/80 transition hover:border-white/50"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => onShiftDay(1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-xl leading-none text-white/85 transition hover:border-white/50 hover:text-white"
              aria-label="Next day"
            >
              ›
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="rounded-3xl border border-white/10 bg-black/30 p-4">
            <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Planned today</p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-white/80">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">{taskCount} blocks</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">{totalPlannedMinutes ? `${formatPlannedDuration(totalPlannedMinutes)} planned` : "No time set"}</span>
              {recurringCount > 0 && (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">{recurringCount} recurring</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onAddTask}
            className="flex items-center justify-center rounded-3xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-3 text-sm font-semibold text-emerald-200 transition hover:border-emerald-400/50 hover:bg-emerald-400/15"
          >
            New focus block
          </button>
        </div>

        {isToday && (
          <NowStatusCard
            nowMinutes={nowMinutes}
            context={nowContext}
            onCurrentTaskClick={(todo) => {
              setTimelineMode("schedule");
              onFocusTodo(todo.id);
            }}
          />
        )}

        <div className="flex flex-wrap gap-2">
          {(["list", "schedule"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setTimelineMode(mode)}
              className={`rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-[0.25em] transition ${
                timelineMode === mode
                  ? "bg-cyan-300 text-zinc-950"
                  : "border border-white/10 bg-white/5 text-white/80 hover:border-white/30 hover:text-white"
              }`}
            >
              {mode === "list" ? "Task list" : "Schedule"}
            </button>
          ))}
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
                    {colors.slice(0, 3).map((color, colorIndex) => (
                      <span key={`${day.key}-${color}-${colorIndex}`} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                    ))}
                  </div>
                  {day.isToday && (
                    <span className="mt-1 text-[8px] font-bold uppercase tracking-[0.3em] text-red-400">Today</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-2">
          {timelineMode === "schedule" ? (
            <div className="space-y-4">
              {scheduleSegments.length > 0 ? (
                <div className="space-y-3">
                  {scheduleSegments.map((segment) => {
                    const isTaskSegment = segment.type === "task";
                    const isHighlighted =
                      isTaskSegment && segment.event.todo.id === highlightId;
                    const isCurrentSegment = isToday && isMinuteWithinSegment(nowMinutes, segment);
                    const segmentHeight =
                      segment.type === "task"
                        ? getMobileTaskHeight(segment.durationMinutes)
                        : getMobileGapHeight(segment.durationMinutes);
                    const segmentStyle =
                      segment.type === "task"
                        ? { ...getTimelineCardStyle(segment.event.color), minHeight: segmentHeight }
                        : { minHeight: segmentHeight };
                    return (
                      <div
                        key={`${segment.type}-${segment.startMinutes}-${segment.endMinutes}`}
                        ref={isHighlighted ? highlightRef : undefined}
                        role={isTaskSegment ? "button" : undefined}
                        tabIndex={isTaskSegment ? 0 : undefined}
                        onClick={isTaskSegment ? () => onEdit(segment.event.todo) : undefined}
                        onKeyDown={
                          isTaskSegment
                            ? (keyEvent) => {
                                if (keyEvent.key !== "Enter" && keyEvent.key !== " ") return;
                                keyEvent.preventDefault();
                                onEdit(segment.event.todo);
                              }
                            : undefined
                        }
                        className={`relative overflow-hidden rounded-3xl border px-4 py-4 transition ${
                          segment.type === "gap"
                            ? "border-dashed border-white/20 bg-white/5 text-white/60"
                            : "border border-white/10 bg-black/30 text-white"
                        } ${isCurrentSegment ? "ring-2 ring-red-500/70" : isHighlighted ? "ring-2 ring-cyan-300/70" : ""} ${
                          isTaskSegment
                            ? "cursor-pointer hover:border-cyan-300/50 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-cyan-300/50"
                            : ""
                        }`}
                        style={segmentStyle}
                      >
                        {isCurrentSegment && (
                          <NowSegmentLine
                            progressPercent={getSegmentProgressPercent(
                              nowMinutes,
                              segment.startMinutes,
                              segment.endMinutes,
                            )}
                            showLabel={segment.type === "task"}
                          />
                        )}
                        <div className="relative z-10 flex h-full flex-col justify-between gap-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              {segment.type === "task" && (
                                <div
                                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-3xl text-lg font-semibold text-white"
                                  style={{ backgroundColor: segment.event.color }}
                                >
                                  {segment.event.iconSymbol}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold uppercase tracking-[0.3em] text-white/70">
                                  {segment.type === "gap" ? "Free window" : segment.event.title}
                                </p>
                                <p className="mt-1 text-sm text-white/80">
                                  {formatMinutesLabel(segment.startMinutes)} – {formatMinutesLabel(segment.endMinutes)}
                                </p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {segment.type === "task" && (
                                <button
                                  type="button"
                                  onClick={(eventClick) => {
                                    eventClick.stopPropagation();
                                    onToggle(segment.event.todo.id);
                                  }}
                                  aria-pressed={segment.event.todo.done}
                                  className={`min-h-10 rounded-full px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.25em] transition ${
                                    segment.event.todo.done
                                      ? "bg-emerald-300 text-emerald-950"
                                      : "border border-emerald-300/50 bg-emerald-300/10 text-emerald-100 hover:border-emerald-300"
                                  }`}
                                >
                                  {segment.event.todo.done ? "Done" : "Mark done"}
                                </button>
                              )}
                              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-white/70">
                                {formatPlannedDuration(segment.durationMinutes)}
                              </span>
                              {segment.type === "task" && (
                                <button
                                  type="button"
                                  onClick={(eventClick) => {
                                    eventClick.stopPropagation();
                                    onEdit(segment.event.todo);
                                  }}
                                  className="rounded-full border border-cyan-300/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-200 hover:border-cyan-300"
                                >
                                  Edit
                                </button>
                              )}
                              {segment.type === "task" && (
                                <button
                                  type="button"
                                  onClick={(eventClick) => {
                                    eventClick.stopPropagation();
                                    onDelete(segment.event.todo.id);
                                  }}
                                  className="rounded-full border border-red-300/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-red-200 hover:border-red-300"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                          {segment.type === "gap" ? (
                            <p className="text-sm text-white/60">
                              {segment.durationMinutes >= 60
                                ? `${formatPlannedDuration(segment.durationMinutes)} open`
                                : `Open time`}
                            </p>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-white/60">
                              <span>{priorityLabel(segment.event.todo.priority)}</span>
                              <span>{segment.event.todo.done ? "Completed" : "Open"}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[32px] border border-dashed border-white/20 bg-white/5 px-5 py-8 text-center text-sm text-white/60 shadow-inner">
                  No time-bound blocks yet. Switch to list mode to review unscheduled tasks or add a focused time slot.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {events.map((event) => {
                const isHighlighted = event.todo.id === highlightId;
                return (
                  <div
                    key={event.id}
                    ref={isHighlighted ? highlightRef : undefined}
                    role="button"
                    tabIndex={0}
                    onClick={() => onEdit(event.todo)}
                    onKeyDown={(keyEvent) => {
                      if (keyEvent.key !== "Enter" && keyEvent.key !== " ") return;
                      keyEvent.preventDefault();
                      onEdit(event.todo);
                    }}
                    className={`group flex w-full items-start gap-4 rounded-3xl border border-white/10 bg-black/30 px-4 py-4 text-left transition hover:border-cyan-300/40 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-cyan-300/50 ${
                      isHighlighted ? "ring-2 ring-cyan-300/70" : ""
                    }`}
                  >
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-3xl bg-white/5 text-lg font-semibold text-white" style={{ backgroundColor: event.color }}>
                      {event.iconSymbol}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-white">{event.title}</span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.3em] text-white/70">
                          {priorityLabel(event.todo.priority)}
                        </span>
                      </div>
                      <p className="mt-2 text-[11px] leading-5 text-white/70">
                        {event.window}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.25em] text-white/60">
                        <span>{event.durationLabel ?? "Scheduled"}</span>
                        <span>{event.todo.done ? "Completed" : "Open"}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(eventClick) => {
                        eventClick.stopPropagation();
                        onToggle(event.todo.id);
                      }}
                      aria-pressed={event.todo.done}
                      className={`ml-auto min-h-10 shrink-0 rounded-full px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.25em] transition ${
                        event.todo.done
                          ? "bg-emerald-300 text-emerald-950"
                          : "border border-emerald-300/50 bg-emerald-300/10 text-emerald-100 hover:border-emerald-300"
                      }`}
                    >
                      {event.todo.done ? "Done" : "Mark done"}
                    </button>
                  </div>
                );
              })}
              {unscheduledTasks.length > 0 && (
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-white/80">
                  <p className="text-sm font-semibold text-white">Unscheduled tasks</p>
                  <div className="mt-3 space-y-3">
                    {unscheduledTasks.map((todo) => {
                      const isHighlighted = todo.id === highlightId;
                      return (
                        <div
                          key={todo.id}
                          ref={isHighlighted ? highlightRef : undefined}
                          role="button"
                          tabIndex={0}
                          onClick={() => onEdit(todo)}
                          onKeyDown={(keyEvent) => {
                            if (keyEvent.key !== "Enter" && keyEvent.key !== " ") return;
                            keyEvent.preventDefault();
                            onEdit(todo);
                          }}
                          className={`flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left transition hover:border-cyan-300/40 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-cyan-300/50 ${
                            isHighlighted ? "ring-2 ring-cyan-300/70" : ""
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-semibold text-white">{todo.text}</p>
                            <p className="text-[10px] uppercase tracking-[0.25em] text-white/60">{priorityLabel(todo.priority)}</p>
                          </div>
                          <div className="flex shrink-0 flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={(eventClick) => {
                                eventClick.stopPropagation();
                                onToggle(todo.id);
                              }}
                              aria-pressed={todo.done}
                              className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] transition ${
                                todo.done
                                  ? "bg-emerald-300 text-emerald-950"
                                  : "border border-emerald-300/50 bg-emerald-300/10 text-emerald-100 hover:border-emerald-300"
                              }`}
                            >
                              {todo.done ? "Done" : "Mark done"}
                            </button>
                            <button
                              type="button"
                              onClick={(eventClick) => {
                                eventClick.stopPropagation();
                                onEdit(todo);
                              }}
                              className="rounded-full border border-cyan-300/40 px-3 py-1 text-[10px] font-semibold text-cyan-200 hover:border-cyan-300"
                            >
                              Schedule
                            </button>
                            <button
                              type="button"
                              onClick={(eventClick) => {
                                eventClick.stopPropagation();
                                onDelete(todo.id);
                              }}
                              className="rounded-full border border-red-300/40 px-3 py-1 text-[10px] font-semibold text-red-200 hover:border-red-300"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
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
  onToggle: (id: string) => void;
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
  pointerId: number;
  clientY: number;
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
  onToggle,
  onAddTask,
  onShiftDay,
  onSelectDay,
  onOpenCalendar,
  onJumpToday,
}: TimeBlockingBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const blocks = useMemo(() => buildScheduledBlocks(todos, dragState), [todos, dragState]);
  const totalPlannedMinutes = blocks.reduce((sum, block) => sum + block.durationMinutes, 0);
  const conflictCount = blocks.filter((block) => block.hasConflict).length;
  const nowMinutes = useNowMinutes(isToday);
  const nowLabel = formatMinutesLabel(Math.floor(nowMinutes));
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const nowLineRef = useRef<HTMLDivElement | null>(null);
  const didAutoScrollRef = useRef(false);
  const selectedDate = dayKeyToDate(selectedDay);
  const selectedDayLabel = selectedDate.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const activeDragPointerId = dragState?.pointerId;

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    if (!isToday) {
      didAutoScrollRef.current = false;
      return;
    }
    if (didAutoScrollRef.current) return;
    const node = nowLineRef.current;
    if (!node) return;
    requestAnimationFrame(() => {
      const scrollParent = boardScrollRef.current;
      if (scrollParent) {
        const targetTop = node.offsetTop - scrollParent.clientHeight / 2;
        scrollParent.scrollTo({ top: Math.max(targetTop, 0), behavior: "smooth" });
      } else {
        node.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      didAutoScrollRef.current = true;
    });
  }, [isToday, selectedDay]);

  useEffect(() => {
    if (activeDragPointerId === undefined) return undefined;

    const updateFromClientY = (clientY: number) => {
      setDragState((current) => {
        if (!current || current.pointerId !== activeDragPointerId) return current;
        return updateDragStateFromClientY(current, clientY, boardRef.current);
      });
    };

    const finishDrag = (event?: PointerEvent) => {
      if (event && event.pointerId !== activeDragPointerId) return;
      event?.preventDefault();
      const current = dragStateRef.current;
      if (current && current.pointerId === activeDragPointerId) {
        onScheduleChange(current.id, {
          startTime: minutesToTimeString(snapToSlot(current.startMinutes)),
          timeblockMins: snapToSlot(current.durationMinutes),
        });
      }
      setDragState(null);
    };

    const handleMove = (event: PointerEvent) => {
      if (event.pointerId !== activeDragPointerId) return;
      event.preventDefault();
      updateFromClientY(event.clientY);
    };

    const handleScroll = () => {
      const current = dragStateRef.current;
      if (!current || current.pointerId !== activeDragPointerId) return;
      updateFromClientY(current.clientY);
    };

    const runAutoScroll = () => {
      const current = dragStateRef.current;
      const scrollParent = boardScrollRef.current;
      if (!current || current.pointerId !== activeDragPointerId || !scrollParent) {
        autoScrollFrameRef.current = null;
        return;
      }

      const rect = scrollParent.getBoundingClientRect();
      const edgeSize = 80;
      let delta = 0;
      if (current.clientY < rect.top + edgeSize) {
        const proximity = (rect.top + edgeSize - current.clientY) / edgeSize;
        delta = -Math.ceil(6 + proximity * 18);
      } else if (current.clientY > rect.bottom - edgeSize) {
        const proximity = (current.clientY - (rect.bottom - edgeSize)) / edgeSize;
        delta = Math.ceil(6 + proximity * 18);
      }

      if (delta !== 0) {
        const previousScrollTop = scrollParent.scrollTop;
        const maxScrollTop = scrollParent.scrollHeight - scrollParent.clientHeight;
        scrollParent.scrollTop = Math.min(Math.max(previousScrollTop + delta, 0), maxScrollTop);
        if (scrollParent.scrollTop !== previousScrollTop) {
          updateFromClientY(current.clientY);
        }
      }

      autoScrollFrameRef.current = requestAnimationFrame(runAutoScroll);
    };

    const scrollParent = boardScrollRef.current;
    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    scrollParent?.addEventListener("scroll", handleScroll, { passive: true });
    autoScrollFrameRef.current = requestAnimationFrame(runAutoScroll);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
      scrollParent?.removeEventListener("scroll", handleScroll);
      if (autoScrollFrameRef.current !== null) {
        cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
    };
  }, [activeDragPointerId, onScheduleChange]);

  useEffect(() => {
    if (!highlightId || !highlightRef.current) return;
    highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  const handleDragStart = (event: React.PointerEvent, todo: TodoItem, type: "move" | "resize") => {
    if (event.pointerType === "touch" && !event.isPrimary) return;
    if (!todo.startTime || !todo.timeblockMins) return;
    const startMinutes = parseTimeToMinutes(todo.startTime);
    if (startMinutes === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const pointer = pointerToMinutes(event.nativeEvent, boardRef.current);
    const pointerOffset = pointer !== null ? pointer - startMinutes : 0;
    setDragState({
      id: todo.id,
      type,
      startMinutes,
      durationMinutes: todo.timeblockMins,
      pointerId: event.pointerId,
      clientY: event.clientY,
      pointerOffset,
    });
  };

  return (
    <div className="min-w-0 rounded-[28px] border border-white/10 bg-[#08101f]/85 p-5 text-white shadow-[0_24px_80px_rgba(2,6,23,0.26)] backdrop-blur-xl">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">Day planner</p>
            <h2 className="text-2xl font-semibold text-white">{selectedDayLabel}</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Drag and resize the day while your control rail stays in view.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/80">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">{blocks.length} blocks</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">{formatPlannedDuration(totalPlannedMinutes)}</span>
              {conflictCount > 0 && (
                <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-amber-100">{conflictCount} conflict{conflictCount > 1 ? "s" : ""}</span>
              )}
            </div>
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
                    {day.isToday && <span className="font-bold text-red-400">Today</span>}
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
      <div
        ref={boardScrollRef}
        className={`planner-board-scroll mt-5 max-h-[calc(100dvh-17rem)] overflow-auto overscroll-contain rounded-2xl border border-white/5 bg-black/40 ${
          dragState ? "planner-board-dragging" : ""
        }`}
      >
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
                  ref={nowLineRef}
                  className="pointer-events-none absolute inset-x-0 z-40"
                  style={{ top: minutesToBoardTop(nowMinutes) }}
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
                      }
                    : undefined;
                  const isCurrentBlock =
                    isToday && nowMinutes >= block.startMinutes && nowMinutes < block.startMinutes + block.durationMinutes;
                  const isTiny = block.durationMinutes <= SLOT_MINUTES;
                  const isCompact = block.durationMinutes <= 30;
                  const blockHeight = getBoardDurationHeight(block.durationMinutes);
                  const blockClass = block.hasConflict
                    ? "border-amber-300 bg-amber-200/90 text-zinc-900"
                    : block.color
                      ? "border-transparent text-zinc-900"
                      : `${priorityClasses(block.priority)} border-white/10`;
                  return (
                    <div
                      key={block.id}
                      ref={highlight ? highlightRef : undefined}
                      role={onEditRequest ? "button" : undefined}
                      tabIndex={onEditRequest ? 0 : undefined}
                      onClick={() => onEditRequest?.(block.originalTodo)}
                      onKeyDown={(keyEvent) => {
                        if (!onEditRequest) return;
                        if (keyEvent.key !== "Enter" && keyEvent.key !== " ") return;
                        keyEvent.preventDefault();
                        onEditRequest(block.originalTodo);
                      }}
                      className={`scheduled-block group absolute left-4 right-4 z-10 cursor-pointer overflow-hidden rounded-2xl border px-3 text-xs shadow-lg focus:outline-none focus:ring-2 focus:ring-cyan-300/50 ${blockClass} ${highlight ? "ring-2 ring-cyan-300/70" : ""} ${
                        isCompact ? "py-1" : "py-2"
                      }`}
                      style={{
                        top: minutesToBoardTop(block.startMinutes),
                        height: blockHeight,
                        ...customStyle,
                      }}
                    >
                      {isCurrentBlock && (
                        <NowSegmentLine
                          progressPercent={getSegmentProgressPercent(
                            nowMinutes,
                            block.startMinutes,
                            block.startMinutes + block.durationMinutes,
                          )}
                          showLabel={false}
                        />
                      )}
                      <button
                        type="button"
                        aria-label={`Move ${block.label}`}
                        className={`planner-drag-handle absolute right-2 top-1/2 z-30 flex -translate-y-1/2 cursor-grab items-center justify-center rounded-full bg-black/35 font-semibold leading-none text-white/85 opacity-90 shadow-lg transition hover:bg-black/70 hover:text-white active:cursor-grabbing ${
                          isTiny ? "h-5 w-8 text-[9px]" : "h-8 w-8 text-[10px]"
                        }`}
                        onPointerDown={(event) => handleDragStart(event, block.originalTodo, "move")}
                        onClick={(event) => event.stopPropagation()}
                      >
                        ⋮⋮
                      </button>
                      <div className="pointer-events-none absolute right-12 top-2 flex gap-1 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
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
                      <div className="flex h-full items-center gap-2 pr-10 text-left">
                        <button
                          type="button"
                          aria-label={`${block.originalTodo.done ? "Reopen" : "Mark done"} ${block.label}`}
                          aria-pressed={block.originalTodo.done}
                          className={`relative z-20 flex shrink-0 items-center justify-center rounded-full border font-semibold transition ${
                            isTiny ? "h-5 w-5 text-[10px]" : "h-8 w-8 text-sm"
                          } ${
                            block.originalTodo.done
                              ? "border-white/80 bg-white text-emerald-800"
                              : "border-white/55 bg-black/20 text-white/80 hover:border-white hover:bg-black/35"
                          }`}
                          onPointerDown={(eventClick) => eventClick.stopPropagation()}
                          onClick={(eventClick) => {
                            eventClick.stopPropagation();
                            onToggle(block.id);
                          }}
                        >
                          {block.originalTodo.done ? "✓" : ""}
                        </button>
                        <div className="pointer-events-none flex min-w-0 flex-col justify-center gap-1">
                          <p
                            className={`truncate font-semibold uppercase tracking-[0.15em] ${
                              isCompact ? "text-[10px] leading-[12px]" : "text-xs"
                            }`}
                          >
                            {block.label}
                          </p>
                          {!isTiny && (
                            <p
                              className={`truncate uppercase tracking-[0.25em] opacity-80 ${
                                isCompact ? "text-[9px] leading-[12px]" : "text-[10px]"
                              }`}
                            >
                              {block.window}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label={`Resize ${block.label}`}
                        className="planner-resize-handle absolute bottom-0.5 left-1/2 h-2.5 w-16 -translate-x-1/2 cursor-ns-resize rounded-full bg-white/65 transition hover:bg-white/90"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          handleDragStart(event, block.originalTodo, "resize");
                        }}
                        onClick={(event) => event.stopPropagation()}
                      />
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
  variant?: "full" | "rail";
};

function TaskList({ todos, onEdit, onDelete, onReorder, highlightId, onToggle, onCyclePriority, variant = "full" }: TaskListProps) {
  const completedCount = todos.filter((todo) => todo.done).length;
  const isRail = variant === "rail";
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
    <div className={`min-w-0 ${isRail ? "rounded-[24px] border border-white/10 bg-[#0b1224]/85 p-4 text-white shadow-[0_24px_70px_rgba(2,6,23,0.22)] backdrop-blur-xl" : "glass-panel rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-lg"}`}>
      <div className={`flex flex-col gap-2 ${isRail ? "" : "sm:flex-row sm:items-center sm:justify-between"}`}>
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
      <div className={`mt-4 ${isRail ? "space-y-2" : "space-y-3"}`}>
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
                className={`flex flex-col gap-3 rounded-2xl border border-white/5 bg-black/20 ${isRail ? "px-3 py-3" : "px-4 py-3 sm:flex-row sm:items-center sm:justify-between"} ${
                  highlight ? "ring-2 ring-cyan-300/70" : ""
                } ${draggingId === todo.id ? "opacity-60" : ""}`}
              >
                <span
                  className="hidden cursor-grab select-none text-lg font-semibold leading-none text-zinc-500 sm:block"
                  aria-hidden="true"
                >
                  ⋮⋮
                </span>
                <button
                  type="button"
                  onClick={() => onEdit(todo)}
                  className="flex min-w-0 flex-1 items-start gap-3 rounded-xl text-left transition hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-cyan-300/40"
                >
                  <div className="min-w-0 space-y-1 px-1 py-1">
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
                </button>
                <div className={`flex w-full flex-wrap gap-2 ${isRail ? "" : "sm:w-auto sm:justify-end"}`}>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggle(todo.id);
                    }}
                    aria-pressed={todo.done}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      todo.done
                        ? "bg-emerald-300 text-emerald-950"
                        : "border border-emerald-300/50 bg-emerald-300/10 text-emerald-100 hover:border-emerald-300"
                    }`}
                  >
                    {todo.done ? "Done" : "Mark done"}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCyclePriority(todo.id, nextPriority(todo.priority));
                    }}
                    className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-zinc-200"
                  >
                    {priorityLabel(todo.priority)}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEdit(todo);
                    }}
                    className="rounded-full border border-cyan-300/40 px-3 py-1 text-xs font-semibold text-cyan-200 hover:border-cyan-300"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(todo.id);
                    }}
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
  day,
  onDayChange,
  timeblock,
  startTime,
  onStartTimeChange,
  endTime,
  onEndTimeChange,
  onDurationChange,
  onClearTimeRange,
  color,
  onColorChange,
  colorOptions,
  icon,
  onIconChange,
  iconOptions,
  existingTasks,
  existingTaskId,
  onSelectExisting,
  repeatType,
  onRepeatTypeChange,
  repeatWeekdays,
  onToggleRepeatWeekday,
  repeatMonthDay,
  onRepeatMonthDayChange,
  onSubmit,
  submitLabel,
  onDelete,
  applyToSeries,
  onApplyToSeriesChange,
  seriesCount,
  onClose,
}: TaskPanelProps) {
  const customEmojiValue = iconOptions.some((option) => option.id === icon) ? "" : icon;
  const durationMinutes = timeblock ?? computeTimeblockFromTimes(startTime, endTime);
  return (
    <div
      className="fixed inset-0 z-40 flex justify-end overflow-x-hidden bg-black/60 backdrop-blur-sm mobile-todos-overlay"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-[#0b1121] p-6 shadow-2xl mobile-todos-drawer sm:rounded-l-3xl lg:max-w-2xl"
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
          className="mt-6 flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-2xl text-white">
                {getTaskIconSymbol(icon, text)}
              </div>
              <div className="flex-1">
                <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Task</p>
                <input
                  value={text}
                  onChange={(event) => onTextChange(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-base text-white placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none mobile-todos-input sm:text-sm"
                  placeholder="Name the focus block"
                />
              </div>
            </div>
            {existingTasks && existingTasks.length > 0 && onSelectExisting && (
              <div className="mt-4">
                <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-400">Recent tasks</p>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {existingTasks.map((option) => {
                    const active = existingTaskId === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => onSelectExisting(option.id)}
                        className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${
                          active
                            ? "border-cyan-300/70 bg-cyan-300/10 text-white"
                            : "border-white/10 text-white/70 hover:text-white"
                        }`}
                      >
                        <span className="text-base">{getTaskIconSymbol(option.todo.icon, option.todo.text)}</span>
                        <span className="max-w-[160px] truncate">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
          <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Schedule</p>
              <span className="text-[10px] uppercase tracking-[0.3em] text-white/50">
                {durationMinutes ? `${durationMinutes}m` : "No duration"}
              </span>
            </div>
            <div className="mt-4 space-y-4">
              {day && onDayChange && (
                <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-zinc-400">
                  <span className="pl-1">Date</span>
                  <input
                    type="date"
                    value={day}
                    onChange={(event) => onDayChange(event.target.value as DayKey)}
                    className="w-full rounded-2xl border border-white/15 bg-[#111629] px-4 py-3 text-base font-medium text-white focus:border-cyan-400/60 focus:outline-none sm:text-sm"
                  />
                </label>
              )}
              <TimeRangeSelector
                startTime={startTime}
                endTime={endTime}
                timeblock={timeblock}
                options={startTimeOptions}
                onStartTimeChange={onStartTimeChange}
                onEndTimeChange={onEndTimeChange}
                onDurationChange={onDurationChange}
                onClear={onClearTimeRange}
              />
              <div className={`grid gap-4 ${onRepeatTypeChange ? "sm:grid-cols-2" : ""}`}>
                <SelectField
                  label="Priority"
                  value={priority.toString()}
                  onChange={(value) => onPriorityChange(Number(value) as TodoPriority)}
                >
                  {[1, 2, 3].map((value) => (
                    <option key={value} value={value}>
                      {priorityLabel(value as TodoPriority)}
                    </option>
                  ))}
                </SelectField>
                {onRepeatTypeChange && (
                  <SelectField
                    label="Repeat"
                    value={repeatType ?? "none"}
                    onChange={(value) => onRepeatTypeChange(value as RepeatType)}
                  >
                    <option value="none">Once</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </SelectField>
                )}
              </div>
            </div>
            {repeatType === "weekly" && repeatWeekdays && onToggleRepeatWeekday && (
              <div className="mt-4 flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-zinc-400">
                <span className="pl-1">Repeat days</span>
                <div className="flex flex-wrap gap-2">
                  {repeatDayLabels.map((day) => {
                    const active = repeatWeekdays.includes(day.day);
                    return (
                      <button
                        key={day.day}
                        type="button"
                        onClick={() => onToggleRepeatWeekday(day.day)}
                        className={`rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.25em] ${
                          active ? "bg-cyan-300 text-zinc-900" : "border border-white/15 text-white/70"
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {repeatType === "monthly" && typeof repeatMonthDay === "number" && onRepeatMonthDayChange && (
              <div className="mt-4">
                <SelectField
                  label="Repeat day"
                  value={repeatMonthDay.toString()}
                  onChange={(value) => onRepeatMonthDayChange(Number(value))}
                >
                  {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                    <option key={day} value={day}>
                      Day {day}
                    </option>
                  ))}
                </SelectField>
              </div>
            )}
            {onApplyToSeriesChange && typeof applyToSeries === "boolean" && seriesCount && seriesCount > 1 && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 px-3 py-3">
                <label className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-white/50">Series</p>
                    <p className="mt-1 text-xs font-medium text-white/80">
                      Apply changes to {seriesCount} upcoming tasks
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={applyToSeries}
                    onChange={(event) => onApplyToSeriesChange(event.target.checked)}
                    className="h-4 w-4 accent-cyan-300"
                  />
                </label>
              </div>
            )}
          </section>
          <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Style</p>
              <span className="text-[10px] uppercase tracking-[0.3em] text-white/40">Suggested</span>
            </div>
            <div className="mt-4 space-y-4">
              <ColorPicker colors={colorOptions} value={color ?? colorOptions[0]} onChange={onColorChange} />
              <IconPicker icons={iconOptions} value={icon} onChange={onIconChange} />
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <CustomEmojiField
                  value={customEmojiValue}
                  onChange={(value) => {
                    const trimmed = value.trim();
                    if (!trimmed) return;
                    onIconChange(trimmed);
                  }}
                />
                <button
                  type="button"
                  onClick={() => onIconChange(defaultTaskIcon)}
                  className="rounded-full border border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-white/70 hover:text-white"
                >
                  Reset icon
                </button>
              </div>
            </div>
          </section>
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
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onDelete();
                }}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 calendar-overlay px-4 py-6" onClick={onClose}>
      <div
        className="calendar-panel w-full max-w-md rounded-3xl border border-white/10 bg-[#050912] p-6 text-white shadow-2xl"
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
                className={`calendar-day flex h-14 flex-col items-center justify-center rounded-2xl border text-sm font-semibold transition ${
                  getDayKey(cell) === selectedDay
                    ? "border-cyan-300/70 bg-cyan-300/20 text-white"
                    : "border-white/10 text-zinc-200 hover:border-white/40"
                }`}
              >
                <span>{cell.getDate()}</span>
                <span className="mt-1 flex gap-1">
                  {(markers[getDayKey(cell)] ?? []).slice(0, 3).map((color, colorIndex) => (
                    <span key={`${cell.toISOString()}-${color}-${colorIndex}`} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
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

function NowStatusCard({
  nowMinutes,
  context,
  compact = false,
  onCurrentTaskClick,
}: {
  nowMinutes: number;
  context: NowPlannerContext;
  compact?: boolean;
  onCurrentTaskClick?: (todo: TodoItem) => void;
}) {
  const current = context.currentSegment;
  const progressPercent = current
    ? getSegmentProgressPercent(nowMinutes, current.startMinutes, current.endMinutes)
    : 0;
  const currentLabel = formatMinutesLabel(Math.floor(nowMinutes));

  if (current?.type === "task") {
    const remaining = getWholeMinutesRemaining(current.endMinutes, nowMinutes);
    const elapsed = getWholeMinutesElapsed(current.startMinutes, nowMinutes);
    const clickable = Boolean(onCurrentTaskClick);
    const className = `w-full rounded-3xl border border-red-500/50 bg-red-500/10 p-4 text-left text-white shadow-lg shadow-red-950/20 transition ${clickable ? "hover:border-red-300/70 hover:bg-red-500/15" : ""} ${compact ? "lg:max-w-xl" : ""}`;
    const content = (
      <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-red-200">Now • {currentLabel}</p>
            <h3 className="mt-2 truncate text-base font-semibold text-white">{current.event.title}</h3>
          </div>
          <span className="rounded-full bg-red-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white">
            {Math.round(progressPercent)}%
          </span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-red-500" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.25em] text-white/70">
          <span>{formatPlannedDuration(elapsed)} elapsed</span>
          <span>{formatPlannedDuration(remaining)} left</span>
          <span>{formatMinutesLabel(current.startMinutes)} to {formatMinutesLabel(current.endMinutes)}</span>
        </div>
      </>
    );
    if (!clickable) {
      return <div className={className}>{content}</div>;
    }
    return (
      <button type="button" className={className} onClick={() => onCurrentTaskClick?.(current.event.todo)}>
        {content}
      </button>
    );
  }

  if (current?.type === "gap") {
    const remaining = getWholeMinutesRemaining(current.endMinutes, nowMinutes);
    return (
      <div className={`rounded-3xl border border-white/10 bg-black/30 p-4 text-white ${compact ? "lg:max-w-xl" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-red-200">Now • {currentLabel}</p>
            <h3 className="mt-2 text-base font-semibold text-white">Free window</h3>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-white/70">
            {formatPlannedDuration(remaining)} open
          </span>
        </div>
        {context.nextTask && (
          <p className="mt-3 text-sm text-white/70">
            Next: {context.nextTask.event.title} at {formatMinutesLabel(context.nextTask.startMinutes)}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-3xl border border-white/10 bg-black/30 p-4 text-white ${compact ? "lg:max-w-xl" : ""}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-red-200">Now • {currentLabel}</p>
      <p className="mt-2 text-sm text-white/70">
        {context.nextTask
          ? `Next: ${context.nextTask.event.title} at ${formatMinutesLabel(context.nextTask.startMinutes)}`
          : "No upcoming blocks today"}
      </p>
    </div>
  );
}

function NowSegmentLine({
  progressPercent,
  showLabel,
}: {
  progressPercent: number;
  showLabel: boolean;
}) {
  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-20"
      style={{ top: `${progressPercent}%` }}
    >
      <div className="h-0.5 bg-red-500 shadow-[0_0_14px_rgba(239,68,68,0.9)]" />
      {showLabel && (
        <span className="absolute -top-3 left-3 rounded-full bg-red-500 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.25em] text-white shadow-lg">
          Now
        </span>
      )}
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

type TimeRangeState = {
  startTime: string;
  endTime: string;
  timeblock?: Timeblock;
};

type TaskPanelState = {
  title: string;
  subtitle: string;
  text: string;
  onTextChange: (value: string) => void;
  priority: TodoPriority;
  onPriorityChange: (value: TodoPriority) => void;
  day?: DayKey;
  onDayChange?: (value: DayKey) => void;
  timeblock?: Timeblock;
  startTime: string;
  onStartTimeChange: (value: string) => void;
  endTime: string;
  onEndTimeChange: (value: string) => void;
  onDurationChange: (value: Timeblock) => void;
  onClearTimeRange: () => void;
  color?: string;
  onColorChange: (value: string) => void;
  colorOptions: string[];
  icon: string;
  onIconChange: (value: string) => void;
  iconOptions: IconOption[];
  existingTasks?: ExistingTaskOption[];
  existingTaskId?: string;
  onSelectExisting?: (id: string) => void;
  repeatType?: RepeatType;
  onRepeatTypeChange?: (value: RepeatType) => void;
  repeatWeekdays?: Day[];
  onToggleRepeatWeekday?: (day: Day) => void;
  repeatMonthDay?: number;
  onRepeatMonthDayChange?: (value: number) => void;
  onSubmit: () => void;
  submitLabel: string;
  onDelete?: () => void;
  applyToSeries?: boolean;
  onApplyToSeriesChange?: (value: boolean) => void;
  seriesCount?: number;
};

function formatTaskPanelDate(day: DayKey) {
  return dayKeyToDate(day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function readStoredTimelineMode(): TimelineMode {
  if (typeof window === "undefined") return "schedule";
  try {
    const value = window.localStorage.getItem(PLANNER_TIMELINE_MODE_KEY);
    return value === "list" || value === "schedule" ? value : "schedule";
  } catch (error) {
    console.warn("Planner view preference load failed", error);
    return "schedule";
  }
}

function writePlannerPreference(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.warn("Planner preference save failed", error);
  }
}

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

function computeTimeblockFromTimes(start: string, end: string) {
  if (!start || !end) return undefined;
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  if (startMinutes === null || endMinutes === null) return undefined;
  if (endMinutes <= startMinutes) return undefined;
  const diff = endMinutes - startMinutes;
  return diff % SLOT_MINUTES === 0 ? (diff as Timeblock) : (Math.round(diff / SLOT_MINUTES) * SLOT_MINUTES as Timeblock);
}

function getTimeRangeDuration(start: string, end: string, fallback?: Timeblock): Timeblock {
  const computed = computeTimeblockFromTimes(start, end);
  if (computed) return computed;
  if (fallback && fallback >= SLOT_MINUTES) return fallback;
  return DEFAULT_TIMEBLOCK;
}

function buildRangeFromStart(start: string, duration: Timeblock): TimeRangeState {
  if (!start) return { startTime: "", endTime: "", timeblock: undefined };
  const parsedStart = parseTimeToMinutes(start);
  if (parsedStart === null) return { startTime: "", endTime: "", timeblock: undefined };
  const startMinutes = snapToSlot(parsedStart);
  const maxDuration = DAY_MINUTES - SLOT_MINUTES - startMinutes;
  const normalizedStart = minutesToTimeString(startMinutes);
  if (maxDuration < SLOT_MINUTES) {
    return { startTime: normalizedStart, endTime: "", timeblock: undefined };
  }
  const nextDuration = Math.min(
    Math.max(snapToSlot(duration), SLOT_MINUTES),
    maxDuration,
  ) as Timeblock;
  return {
    startTime: normalizedStart,
    endTime: minutesToTimeString(startMinutes + nextDuration),
    timeblock: nextDuration,
  };
}

function buildRangeFromEnd(end: string, currentStart: string, duration: Timeblock): TimeRangeState {
  if (!end) return { startTime: currentStart, endTime: "", timeblock: undefined };
  const parsedEnd = parseTimeToMinutes(end);
  if (parsedEnd === null) return { startTime: currentStart, endTime: "", timeblock: undefined };
  const endMinutes = snapToSlot(parsedEnd);
  const startMinutes = currentStart ? parseTimeToMinutes(currentStart) : null;
  if (startMinutes !== null && endMinutes > startMinutes) {
    const normalizedStart = minutesToTimeString(snapToSlot(startMinutes));
    const normalizedEnd = minutesToTimeString(endMinutes);
    return {
      startTime: normalizedStart,
      endTime: normalizedEnd,
      timeblock: computeTimeblockFromTimes(normalizedStart, normalizedEnd),
    };
  }
  if (endMinutes < SLOT_MINUTES) {
    return { startTime: "", endTime: minutesToTimeString(endMinutes), timeblock: undefined };
  }
  const nextDuration = Math.min(
    Math.max(snapToSlot(duration), SLOT_MINUTES),
    endMinutes,
  ) as Timeblock;
  const nextStart = endMinutes - nextDuration;
  return {
    startTime: minutesToTimeString(nextStart),
    endTime: minutesToTimeString(endMinutes),
    timeblock: nextDuration,
  };
}

function formatDurationPreset(duration: Timeblock) {
  if (duration < 60) return `${duration}m`;
  const hours = duration / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${duration}m`;
}

function formatPlannedDuration(totalMinutes: number) {
  const normalizedMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function buildEndTime(start: string, duration?: Timeblock) {
  if (!start || !duration) return "";
  const startMinutes = parseTimeToMinutes(start);
  if (startMinutes === null) return "";
  const endMinutes = startMinutes + duration;
  if (endMinutes > DAY_MINUTES - SLOT_MINUTES) return "";
  return minutesToTimeString(endMinutes);
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

function suggestTaskStyle(text: string): StyleSuggestion {
  const normalized = text.toLowerCase();
  const hasAny = (words: string[]) => words.some((word) => normalized.includes(word));
  if (hasAny(["meeting", "sync", "standup", "call", "interview"])) {
    return { icon: "calendar", color: "#60a5fa" };
  }
  if (hasAny(["email", "inbox", "reply", "follow up"])) {
    return { icon: "email", color: "#38bdf8" };
  }
  if (hasAny(["write", "draft", "post", "outline", "notes"])) {
    return { icon: "pen", color: "#a78bfa" };
  }
  if (hasAny(["code", "build", "ship", "deploy", "debug"])) {
    return { icon: "laptop", color: "#34d399" };
  }
  if (hasAny(["workout", "gym", "run", "training", "lift"])) {
    return { icon: "dumbbell", color: "#f97316" };
  }
  if (hasAny(["read", "study", "learn", "course"])) {
    return { icon: "book", color: "#818cf8" };
  }
  if (hasAny(["coffee", "break", "lunch", "meal", "cook", "dinner"])) {
    return { icon: "food", color: "#facc15" };
  }
  if (hasAny(["money", "budget", "invoice", "finance", "tax"])) {
    return { icon: "chart", color: "#4ade80" };
  }
  if (hasAny(["clean", "tidy", "laundry"])) {
    return { icon: "broom", color: "#fb7185" };
  }
  if (hasAny(["drive", "commute", "travel"])) {
    return { icon: "car", color: "#f87171" };
  }
  if (hasAny(["sleep", "rest", "night"])) {
    return { icon: "moon", color: "#60a5fa" };
  }
  if (hasAny(["focus", "deep work", "plan"])) {
    return { icon: "spark", color: "#facc15" };
  }
  return {};
}

function buildRepeatDays(args: {
  startDay: DayKey;
  repeatType: RepeatType;
  repeatWeekdays: Day[];
  repeatMonthDay: number;
  horizonDays: number;
}): DayKey[] {
  const startDate = dayKeyToDate(args.startDay);
  const days: DayKey[] = [];
  const weekdaySet =
    args.repeatWeekdays.length > 0 ? new Set(args.repeatWeekdays) : new Set<Day>([startDate.getDay() as Day]);
  for (let offset = 0; offset < args.horizonDays; offset += 1) {
    const current = new Date(startDate);
    current.setDate(startDate.getDate() + offset);
    const dayKey = getDayKey(current);
    if (args.repeatType === "none") {
      if (offset === 0) {
        days.push(dayKey);
      }
      break;
    }
    if (args.repeatType === "weekly") {
      if (weekdaySet.has(current.getDay() as Day)) {
        days.push(dayKey);
      }
    }
    if (args.repeatType === "monthly") {
      if (current.getDate() === args.repeatMonthDay) {
        days.push(dayKey);
      }
    }
  }
  return Array.from(new Set(days));
}

type SeriesTarget = {
  day: DayKey;
  id: string;
};

function createSeriesId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `series-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildTodoSeriesSignature(todo: TodoItem) {
  return `${todo.text}|${todo.priority}|${todo.timeblockMins ?? ""}|${todo.startTime ?? ""}|${todo.color ?? ""}|${todo.icon ?? ""}`;
}

function buildSeriesTargets(
  record: Record<DayKey, TodoItem[]>,
  anchor: TodoItem,
  fromDay: DayKey,
): SeriesTarget[] {
  const useSeriesId = Boolean(anchor.seriesId);
  const seriesKey = useSeriesId ? anchor.seriesId ?? "" : buildTodoSeriesSignature(anchor);
  const targets: SeriesTarget[] = [];
  Object.entries(record).forEach(([day, todos]) => {
    if (day < fromDay) return;
    todos.forEach((todo) => {
      if (todo.done) return;
      if (useSeriesId) {
        if (todo.seriesId && todo.seriesId === seriesKey) {
          targets.push({ day: day as DayKey, id: todo.id });
        }
      } else if (buildTodoSeriesSignature(todo) === seriesKey) {
        targets.push({ day: day as DayKey, id: todo.id });
      }
    });
  });
  return targets;
}

function getTaskIconSymbol(iconId?: string, fallbackText = "") {
  const icon = taskIconOptions.find((option) => option.id === iconId);
  if (icon) return icon.symbol;
  if (iconId) return iconId;
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

function buildScheduledBlocks(todos: TodoItem[], drag?: DragState | null): ScheduledBlock[] {
  const blocks: ScheduledBlock[] = [];
  todos.forEach((todo) => {
    if (!todo.startTime || !todo.timeblockMins) return;
    const startMinutes = parseTimeToMinutes(todo.startTime);
    if (startMinutes === null) return;
    const durationMinutes = getTodoDurationMinutes(todo, startMinutes);
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
  const detailParts = [priorityLabel(todo.priority)];
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
      return "bg-gradient-to-r from-rose-400/90 to-red-500/80 text-white";
    case 2:
      return "bg-gradient-to-r from-amber-300/90 to-orange-400/80 text-zinc-900";
    case 3:
    default:
      return "bg-gradient-to-r from-sky-400/80 to-indigo-500/70 text-white";
  }
}

function priorityLabel(priority: TodoPriority) {
  switch (priority) {
    case 1:
      return "High";
    case 2:
      return "Medium";
    case 3:
    default:
      return "Low";
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
      const duration = getTodoDurationMinutes(todo, startMinutes);
      const endMinutes = startMinutes + duration;
      const iconSymbol = getTaskIconSymbol(todo.icon, todo.text);
      const event: TimelineEvent = {
        id: todo.id,
        title: todo.text,
        startLabel: formatMinutesLabel(startMinutes),
        endLabel: formatMinutesLabel(endMinutes),
        window: `${formatMinutesLabel(startMinutes)} – ${formatMinutesLabel(endMinutes)}`,
        durationLabel: `${duration}m`,
        color: todo.color ?? "#94a3b8",
        iconSymbol,
        todo,
      };
      return { event, order: startMinutes };
    })
    .filter((value): value is { event: TimelineEvent; order: number } => Boolean(value));
  return enriched.sort((a, b) => a.order - b.order).map((item) => item.event);
}

type ScheduleSegment =
  | {
      type: "task";
      event: TimelineEvent;
      startMinutes: number;
      endMinutes: number;
      durationMinutes: number;
    }
  | {
      type: "gap";
      startMinutes: number;
      endMinutes: number;
      durationMinutes: number;
    };

type TaskScheduleSegment = Extract<ScheduleSegment, { type: "task" }>;

type NowPlannerContext = {
  currentSegment: ScheduleSegment | null;
  nextTask: TaskScheduleSegment | null;
};

function buildScheduleSegments(events: TimelineEvent[]): ScheduleSegment[] {
  const segments: ScheduleSegment[] = [];
  let cursor = 0;

  events.forEach((event) => {
    const startMinutes = parseTimeToMinutes(event.todo.startTime ?? "") ?? 0;
    const duration = getTodoDurationMinutes(event.todo, startMinutes);
    const endMinutes = startMinutes + duration;

    if (startMinutes > cursor) {
      segments.push({
        type: "gap",
        startMinutes: cursor,
        endMinutes: startMinutes,
        durationMinutes: startMinutes - cursor,
      });
    }

    segments.push({
      type: "task",
      event,
      startMinutes,
      endMinutes,
      durationMinutes: duration,
    });
    cursor = endMinutes;
  });

  if (cursor < DAY_MINUTES) {
    segments.push({
      type: "gap",
      startMinutes: cursor,
      endMinutes: DAY_MINUTES,
      durationMinutes: DAY_MINUTES - cursor,
    });
  }

  return segments;
}

function getNowPlannerContext(segments: ScheduleSegment[], nowMinutes: number): NowPlannerContext {
  const currentSegment = segments.find((segment) => isMinuteWithinSegment(nowMinutes, segment)) ?? null;
  const nextTask =
    segments.find(
      (segment): segment is TaskScheduleSegment =>
        segment.type === "task" && segment.startMinutes > nowMinutes,
    ) ?? null;
  return { currentSegment, nextTask };
}

function useNowMinutes(enabled: boolean) {
  const [nowMinutes, setNowMinutes] = useState(() => getCurrentMinuteOfDay());

  useEffect(() => {
    if (!enabled) return;
    const update = () => setNowMinutes(getCurrentMinuteOfDay());
    update();
    const interval = window.setInterval(update, NOW_UPDATE_MS);
    return () => window.clearInterval(interval);
  }, [enabled]);

  return nowMinutes;
}

function getCurrentMinuteOfDay(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

function isMinuteWithinSegment(minute: number, segment: ScheduleSegment) {
  return minute >= segment.startMinutes && minute < segment.endMinutes;
}

function getSegmentProgressPercent(minute: number, startMinutes: number, endMinutes: number) {
  if (endMinutes <= startMinutes) return 0;
  return Math.min(Math.max(((minute - startMinutes) / (endMinutes - startMinutes)) * 100, 0), 100);
}

function getWholeMinutesRemaining(endMinutes: number, nowMinutes: number) {
  return Math.max(0, Math.ceil(endMinutes - nowMinutes));
}

function getWholeMinutesElapsed(startMinutes: number, nowMinutes: number) {
  return Math.max(0, Math.floor(nowMinutes - startMinutes));
}

function getTodoDurationMinutes(todo: TodoItem, startMinutes: number) {
  const requestedDuration = Math.max(todo.timeblockMins ?? SLOT_MINUTES, SLOT_MINUTES);
  const maxDuration = Math.max(1, DAY_MINUTES - startMinutes);
  return Math.min(requestedDuration, maxDuration);
}

function minutesToBoardTop(minutes: number) {
  return (minutes / SLOT_MINUTES) * SLOT_HEIGHT;
}

function getBoardDurationHeight(durationMinutes: number) {
  return Math.max((durationMinutes / SLOT_MINUTES) * SLOT_HEIGHT - 2, SLOT_HEIGHT - 2);
}

function getMobileTaskHeight(durationMinutes: number) {
  return Math.max(MOBILE_TASK_MIN_HEIGHT, Math.round(durationMinutes * MOBILE_TASK_MINUTE_HEIGHT));
}

function getMobileGapHeight(durationMinutes: number) {
  return Math.min(
    MOBILE_GAP_MAX_HEIGHT,
    Math.max(MOBILE_GAP_MIN_HEIGHT, Math.round(durationMinutes * MOBILE_GAP_MINUTE_HEIGHT)),
  );
}

function pointerToMinutes(event: PointerEvent, element: HTMLDivElement | null) {
  return clientYToMinutes(event.clientY, element);
}

function clientYToMinutes(clientY: number, element: HTMLDivElement | null) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const y = Math.min(Math.max(clientY - rect.top, 0), BOARD_HEIGHT);
  const slot = Math.round(y / SLOT_HEIGHT);
  return slotToMinutes(slot);
}

function updateDragStateFromClientY(
  current: DragState,
  clientY: number,
  element: HTMLDivElement | null,
): DragState {
  const minutes = clientYToMinutes(clientY, element);
  if (minutes === null) return current;

  if (current.type === "move" && current.pointerOffset !== undefined) {
    const proposed = minutes - current.pointerOffset;
    return {
      ...current,
      clientY,
      startMinutes: clampMinutes(proposed, current.durationMinutes),
    };
  }

  if (current.type === "resize") {
    const duration = Math.max(SLOT_MINUTES, minutes - current.startMinutes);
    const snapped = snapToSlot(duration);
    return {
      ...current,
      clientY,
      durationMinutes: Math.min(snapped, DAY_MINUTES - current.startMinutes),
    };
  }

  return { ...current, clientY };
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
