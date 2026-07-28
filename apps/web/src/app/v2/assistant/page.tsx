"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import {
  Day,
  DayKey,
  JarvisState,
  MoodTag,
  TodoItem,
  TodoPriority,
  Timeblock,
  dayKeyToDate,
  defaultMoodTags,
  getDayKey,
  useJarvisState,
} from "@/lib/jarvisStore";
import { useToast } from "@/components/Toast";
import { assistantVoiceToggleEvent } from "@/lib/assistantVoiceEvents";
import {
  findTodoTarget,
  type AssistantContextPayload,
  type AssistantIntentResult,
  type AssistantIntentTodoTarget,
  type AssistantTodoCandidate,
} from "@/lib/assistantIntent";
import { formatMinutesLabel, minutesToTimeString, parseTimeToMinutes } from "@/lib/timeDisplay";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type TodoActionTarget = AssistantIntentTodoTarget;

type TodoUpdatePayload = {
  target?: TodoActionTarget;
  updates: {
    text?: string;
    day?: DayKey;
    startTime?: string;
    endTime?: string;
    timeblockMins?: number;
    priority?: TodoPriority;
  };
};

type PendingAction =
  | {
      type: "mood";
      payload: {
        mood?: number;
        note?: string;
        tags?: string[];
      };
      missing: Array<"mood">;
    }
  | {
      type: "journal";
      payload: {
        text?: string;
        prompt?: "morning" | "priority" | "free";
      };
      missing: Array<"text">;
    }
  | {
      type: "todo";
      payload: {
        text?: string;
        day?: DayKey;
        timeblockMins?: number;
        startTime?: string;
        endTime?: string;
        priority?: TodoPriority;
        color?: string;
        icon?: string;
        repeatType?: RepeatType;
        repeatWeekdays?: Day[];
        repeatMonthDay?: number;
      };
      missing: Array<"text">;
    }
  | {
      type: "sleep";
      payload: {
        durationMins?: number;
        quality?: number;
        recoveryScore?: number;
        day?: DayKey;
        startMinutes?: number;
        endMinutes?: number;
        dreams?: string;
        notes?: string;
      };
      missing: Array<"duration" | "quality">;
    }
  | {
      type: "todo-update";
      payload: TodoUpdatePayload;
      missing: Array<"target" | "change">;
    }
  | {
      type: "todo-complete";
      payload: {
        target?: TodoActionTarget;
        done?: boolean;
      };
      missing: Array<"target">;
    };

type TodoDraftAction = Extract<PendingAction, { type: "todo" }>;
type DayOption = { value: DayKey; label: string };
type StyleSuggestion = { icon: string; color: string };

type VoiceStatus = "idle" | "listening" | "processing" | "error";

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0?: { transcript?: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}


const TOTAL_MINUTES = 24 * 60;
const DIAL_MINUTES = 12 * 60;
const DEFAULT_DURATION = 8 * 60;
const RECORDED_VOICE_MAX_MS = 60000;
const SPEECH_VOICE_MAX_MS = 60000;
const SPEECH_SILENCE_SUBMIT_MS = 4500;
const SPEECH_RESTART_LIMIT = 8;
const durationPresets: Timeblock[] = [15, 30, 45, 60, 90, 120];
const CLOCK_SIZE = 340;
const CLOCK_RADIUS = 130;
const timeblockOptions = buildStartTimeOptions(15);
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
const taskIconOptions = [
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
const defaultBlockColor = blockColors[0];
const defaultTaskIcon = taskIconOptions[0].id;
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
const assistantExamplePrompts = [
  "add dinner today at 5:30pm high priority",
  "move budget review to tomorrow at 9am",
  "complete grocery list",
  "log mood 7 calm note: steady day",
  "how am I doing this week?",
];
type RepeatType = "none" | "weekly" | "monthly";

export default function AssistantPage() {
  const {
    state,
    logMood,
    addJournal,
    addTodo,
    toggleTodo,
    updateTodo,
    moveTodo,
    logSleep,
    addMoodTag,
    renameMoodTag,
    deleteMoodTag,
  } = useJarvisState();
  const { showToast } = useToast();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [draft, setDraft] = useState<PendingAction | null>(null);
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const dayOptions = useMemo(() => buildDayOptions(14), []);
  const sleepDefaultDay = useMemo(() => getDefaultSleepDay(), []);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [newTagValue, setNewTagValue] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceAutoPrompted, setVoiceAutoPrompted] = useState(false);
  const [intentStatus, setIntentStatus] = useState<"idle" | "thinking">("idle");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechErrorRef = useRef(false);
  const voiceTranscriptRef = useRef("");
  const voiceSilenceTimerRef = useRef<number | null>(null);
  const voiceRestartTimerRef = useRef<number | null>(null);
  const speechRestartCountRef = useRef(0);
  const voiceSubmitRequestedRef = useRef(false);
  const voiceHardStopRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const voiceStopTimerRef = useRef<number | null>(null);

  const moodTagLibrary = useMemo(() => state.moodTags ?? [], [state.moodTags]);
  const moodTagOptions: MoodTag[] = useMemo(() => {
    const seen = new Set<string>();
    const combined = [...defaultMoodTags, ...moodTagLibrary];
    return combined.filter((tag) => {
      const normalized = tag.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  }, [moodTagLibrary]);
  const builtInMoodTagSet = useMemo(
    () => new Set(defaultMoodTags.map((tag) => tag.toLowerCase())),
    [],
  );
  const knownMoodTags = useMemo(
    () => moodTagOptions.map((tag) => tag.toLowerCase()),
    [moodTagOptions],
  );
  const assistantContext = useMemo(() => buildAssistantContext(state), [state]);

  useEffect(() => {
    const node = conversationRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages, pending, draft]);

  const appendMessage = useCallback((role: Message["role"], text: string) => {
    setMessages((current) => [
      ...current,
      { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, role, text },
    ]);
  }, []);

  const applyIntentResult = useCallback(
    (result: AssistantIntentResult) => {
      if (result.kind === "insight") {
        appendMessage("assistant", result.assistantMessage ?? result.summary);
        return;
      }
      if (result.kind === "unsupported") {
        appendMessage(
          "assistant",
          result.clarification ?? "I can help with tasks, sleep, mood, journal, and insights.",
        );
        return;
      }

      const action = buildPendingActionFromIntent(result, assistantContext);
      if (!action) {
        appendMessage("assistant", result.clarification ?? "I need one more detail to do that.");
        return;
      }
      if (action.missing.length) {
        setPending(action);
        setDraft(null);
        appendMessage("assistant", result.clarification ?? buildClarifier(action));
        return;
      }
      setPending(null);
      setDraft(action);
      appendMessage("assistant", `I understood: ${result.summary}. Review the details below and confirm.`);
    },
    [appendMessage, assistantContext],
  );

  const requestFuzzyIntent = useCallback(
    async (trimmed: string) => {
      setIntentStatus("thinking");
      try {
        const response = await fetch("/api/assistant/intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: trimmed, context: assistantContext }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error ?? `Intent parsing failed with ${response.status}`);
        }
        if (!data?.result) {
          throw new Error("Assistant intent parser did not return a result.");
        }
        applyIntentResult(data.result as AssistantIntentResult);
        return true;
      } catch (error) {
        appendMessage("assistant", getIntentErrorMessage(error));
        return false;
      } finally {
        setIntentStatus("idle");
      }
    },
    [appendMessage, applyIntentResult, assistantContext],
  );

  const submitCommand = useCallback(
    async (rawInput: string, options?: { preferIntent?: boolean }) => {
      const trimmed = rawInput.trim();
      if (!trimmed) return;
      setInput("");
      appendMessage("user", trimmed);

      if (pending) {
        const resolved = applyAnswer(pending, trimmed, assistantContext);
        if (resolved.missing.length) {
          setPending(resolved);
          appendMessage("assistant", buildClarifier(resolved));
          return;
        }
        setPending(null);
        setDraft(resolved);
        appendMessage("assistant", "Review the details below and confirm.");
        return;
      }

      if (isHelpRequest(trimmed)) {
        appendMessage("assistant", buildHelpText());
        return;
      }

      if (options?.preferIntent) {
        const handled = await requestFuzzyIntent(trimmed);
        if (handled) return;
      }

      const parsed = parseCommand(trimmed, knownMoodTags);
      if (!parsed) {
        await requestFuzzyIntent(trimmed);
        return;
      }

      if (parsed.missing.length) {
        if (parsed.type === "mood" && !options?.preferIntent) {
          const handled = await requestFuzzyIntent(trimmed);
          if (handled) return;
        }
        setPending(parsed);
        setDraft(null);
        appendMessage("assistant", buildClarifier(parsed));
        return;
      }

      setDraft(parsed);
      appendMessage("assistant", "Review the details below and confirm.");
    },
    [appendMessage, assistantContext, knownMoodTags, pending, requestFuzzyIntent],
  );

  const handleSubmit = useCallback(() => {
    void submitCommand(input);
  }, [input, submitCommand]);

  const clearVoiceTimers = useCallback(() => {
    if (voiceStopTimerRef.current !== null) {
      window.clearTimeout(voiceStopTimerRef.current);
      voiceStopTimerRef.current = null;
    }
    if (voiceSilenceTimerRef.current !== null) {
      window.clearTimeout(voiceSilenceTimerRef.current);
      voiceSilenceTimerRef.current = null;
    }
    if (voiceRestartTimerRef.current !== null) {
      window.clearTimeout(voiceRestartTimerRef.current);
      voiceRestartTimerRef.current = null;
    }
  }, []);

  const stopMediaCapture = useCallback(() => {
    clearVoiceTimers();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, [clearVoiceTimers]);

  const submitVoiceTranscript = useCallback(
    (transcript: string) => {
      clearVoiceTimers();
      voiceSubmitRequestedRef.current = false;
      voiceHardStopRef.current = false;
      speechRestartCountRef.current = 0;
      const trimmed = transcript.trim();
      if (!trimmed) {
        setVoiceStatus("error");
        setVoiceError("I didn't catch anything. Try a shorter command.");
        return;
      }
      setVoiceTranscript(trimmed);
      setVoiceStatus("idle");
      void submitCommand(trimmed, { preferIntent: true });
    },
    [clearVoiceTimers, submitCommand],
  );

  const transcribeRecordedAudio = useCallback(
    async (audioBlob: Blob) => {
      setVoiceStatus("processing");
      setVoiceError(null);
      try {
        const body = new FormData();
        body.append("audio", audioBlob, `jarvis-voice.${getAudioExtension(audioBlob.type)}`);
        const response = await fetch("/api/assistant/transcribe", {
          method: "POST",
          body,
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error ?? `Transcription failed with ${response.status}`);
        }
        submitVoiceTranscript(typeof data?.text === "string" ? data.text : "");
      } catch (error) {
        setVoiceStatus("error");
        setVoiceError(getVoiceCaptureError(error));
      }
    },
    [submitVoiceTranscript],
  );

  const startRecordedVoiceCapture = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceStatus("error");
      setVoiceError("Voice capture is not available in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const mimeType = getPreferredAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        setVoiceStatus("error");
        setVoiceError("The microphone recording stopped unexpectedly.");
        stopMediaCapture();
      };
      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        mediaRecorderRef.current = null;
        stopMediaCapture();
        if (audioBlob.size === 0) {
          setVoiceStatus("error");
          setVoiceError("No audio was captured. Try again closer to the microphone.");
          return;
        }
        void transcribeRecordedAudio(audioBlob);
      };

      recorder.start();
      setVoiceStatus("listening");
      voiceSubmitRequestedRef.current = false;
      voiceHardStopRef.current = false;
      voiceStopTimerRef.current = window.setTimeout(() => {
        voiceHardStopRef.current = true;
        if (recorder.state === "recording") {
          recorder.stop();
        }
      }, RECORDED_VOICE_MAX_MS);
    } catch (error) {
      setVoiceStatus("error");
      setVoiceError(getVoiceCaptureError(error));
      stopMediaCapture();
    }
  }, [stopMediaCapture, transcribeRecordedAudio]);

  const startVoiceCapture = useCallback(async () => {
    if (voiceStatus === "listening" || voiceStatus === "processing") return;
    clearVoiceTimers();
    setVoiceError(null);
    setVoiceTranscript("");
    voiceTranscriptRef.current = "";
    voiceSubmitRequestedRef.current = false;
    voiceHardStopRef.current = false;
    speechRestartCountRef.current = 0;

    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      await startRecordedVoiceCapture();
      return;
    }

    let finalTranscript = "";

    const clearSilenceTimer = () => {
      if (voiceSilenceTimerRef.current !== null) {
        window.clearTimeout(voiceSilenceTimerRef.current);
        voiceSilenceTimerRef.current = null;
      }
    };

    const requestTranscriptSubmit = () => {
      voiceSubmitRequestedRef.current = true;
      clearSilenceTimer();
      const activeRecognition = recognitionRef.current;
      if (activeRecognition) {
        activeRecognition.stop();
        return;
      }
      setVoiceStatus("processing");
      submitVoiceTranscript(voiceTranscriptRef.current);
    };

    const scheduleSilenceSubmit = () => {
      clearSilenceTimer();
      voiceSilenceTimerRef.current = window.setTimeout(
        requestTranscriptSubmit,
        SPEECH_SILENCE_SUBMIT_MS,
      );
    };

    const startRecognition = () => {
      try {
        const recognition = new Recognition();
        speechErrorRef.current = false;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = navigator.language || "en-US";
        recognition.maxAlternatives = 1;
        recognition.onstart = () => setVoiceStatus("listening");
        recognition.onresult = (event) => {
          let interimTranscript = "";
          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index];
            const transcript = result[0]?.transcript ?? "";
            if (result.isFinal) {
              finalTranscript = `${finalTranscript} ${transcript}`.trim();
            } else {
              interimTranscript = `${interimTranscript} ${transcript}`.trim();
            }
          }
          const nextTranscript = `${finalTranscript} ${interimTranscript}`.trim();
          voiceTranscriptRef.current = nextTranscript;
          setVoiceTranscript(nextTranscript);
          if (nextTranscript) scheduleSilenceSubmit();
        };
        recognition.onerror = (event) => {
          recognitionRef.current = null;
          const hasTranscript = Boolean(voiceTranscriptRef.current.trim());
          if (event.error === "no-speech" && hasTranscript) {
            speechErrorRef.current = true;
            voiceSubmitRequestedRef.current = true;
            clearVoiceTimers();
            setVoiceStatus("processing");
            submitVoiceTranscript(voiceTranscriptRef.current);
            return;
          }
          speechErrorRef.current = true;
          clearVoiceTimers();
          setVoiceStatus("error");
          setVoiceError(getSpeechRecognitionError(event.error));
        };
        recognition.onend = () => {
          recognitionRef.current = null;
          if (speechErrorRef.current) return;
          const shouldSubmit =
            voiceSubmitRequestedRef.current ||
            voiceHardStopRef.current ||
            speechRestartCountRef.current >= SPEECH_RESTART_LIMIT;
          if (shouldSubmit) {
            clearVoiceTimers();
            setVoiceStatus("processing");
            submitVoiceTranscript(voiceTranscriptRef.current);
            return;
          }
          speechRestartCountRef.current += 1;
          voiceRestartTimerRef.current = window.setTimeout(() => {
            voiceRestartTimerRef.current = null;
            startRecognition();
          }, 150);
        };
        recognitionRef.current = recognition;
        recognition.start();
      } catch (error) {
        recognitionRef.current = null;
        clearVoiceTimers();
        if (voiceTranscriptRef.current.trim()) {
          setVoiceStatus("processing");
          submitVoiceTranscript(voiceTranscriptRef.current);
          return;
        }
        void startRecordedVoiceCapture();
        if (error instanceof Error && error.name !== "InvalidStateError") {
          console.warn("Speech recognition failed; falling back to recorded transcription", error);
        }
      }
    };

    voiceStopTimerRef.current = window.setTimeout(() => {
      voiceHardStopRef.current = true;
      requestTranscriptSubmit();
    }, SPEECH_VOICE_MAX_MS);

    startRecognition();
  }, [clearVoiceTimers, startRecordedVoiceCapture, submitVoiceTranscript, voiceStatus]);

  const stopVoiceCapture = useCallback(() => {
    voiceSubmitRequestedRef.current = true;
    clearVoiceTimers();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, [clearVoiceTimers]);

  const toggleVoiceCapture = useCallback(() => {
    if (voiceStatus === "listening") {
      stopVoiceCapture();
      return;
    }
    if (voiceStatus === "processing" || intentStatus === "thinking") return;
    void startVoiceCapture();
  }, [intentStatus, startVoiceCapture, stopVoiceCapture, voiceStatus]);

  useEffect(() => {
    const handleAssistantVoiceToggle = () => toggleVoiceCapture();
    window.addEventListener(assistantVoiceToggleEvent, handleAssistantVoiceToggle);
    return () => window.removeEventListener(assistantVoiceToggleEvent, handleAssistantVoiceToggle);
  }, [toggleVoiceCapture]);

  useEffect(() => {
    return () => {
      voiceSubmitRequestedRef.current = true;
      speechErrorRef.current = true;
      recognitionRef.current?.abort();
      stopMediaCapture();
    };
  }, [stopMediaCapture]);

  useEffect(() => {
    if (voiceAutoPrompted) return;
    const search = new URLSearchParams(window.location.search);
    if (search.get("voice") !== "1") return;
    setVoiceAutoPrompted(true);
    window.history.replaceState(null, "", window.location.pathname);
    window.setTimeout(() => {
      void startVoiceCapture();
    }, 250);
  }, [startVoiceCapture, voiceAutoPrompted]);

  const runAction = useCallback(
    (action: PendingAction) => {
      const summary = buildActionSummary(action);
      switch (action.type) {
        case "mood": {
          if (!action.payload.mood) return;
          logMood({
            mood: action.payload.mood,
            note: action.payload.note,
            tags: action.payload.tags ?? [],
          });
          appendMessage("assistant", summary);
          showToast("Mood logged");
          break;
        }
        case "journal": {
          if (!action.payload.text) return;
          addJournal({
            text: action.payload.text,
            prompt: action.payload.prompt,
          });
          appendMessage("assistant", summary);
          showToast("Journal entry saved");
          break;
        }
        case "todo": {
          if (!action.payload.text) return;
          const computedTimeblock = computeTimeblockFromTimes(
            action.payload.startTime,
            action.payload.endTime,
          );
          const repeatType = action.payload.repeatType ?? "none";
          const repeatDays = buildRepeatDays({
            startDay: action.payload.day ?? getDayKey(),
            repeatType,
            repeatWeekdays: action.payload.repeatWeekdays ?? [],
            repeatMonthDay: action.payload.repeatMonthDay ?? dayKeyToDate(action.payload.day ?? getDayKey()).getDate(),
            horizonDays: repeatHorizonDays,
          });
          const seriesId = repeatType === "none" ? undefined : createSeriesId();
          const basePayload = {
            text: action.payload.text,
            priority: action.payload.priority ?? 2,
            timeblockMins: computedTimeblock ?? action.payload.timeblockMins,
            startTime: action.payload.startTime,
            color: action.payload.color,
            icon: action.payload.icon,
            seriesId,
          };
          if (repeatType === "none") {
            addTodo({
              ...basePayload,
              day: action.payload.day,
            });
          } else {
            repeatDays.forEach((day) => {
              addTodo({
                ...basePayload,
                day,
              });
            });
          }
          appendMessage("assistant", summary);
          showToast("Todo scheduled");
          break;
        }
        case "sleep": {
          if (!action.payload.durationMins || !action.payload.quality) return;
          const duration =
            action.payload.startMinutes !== undefined && action.payload.endMinutes !== undefined
              ? calculateDuration(action.payload.startMinutes, action.payload.endMinutes)
              : action.payload.durationMins;
          logSleep({
            durationMins: duration,
            quality: action.payload.quality,
            recoveryScore: action.payload.recoveryScore,
            day: action.payload.day,
            startMinutes: action.payload.startMinutes,
            endMinutes: action.payload.endMinutes,
            dreams: action.payload.dreams,
            notes: action.payload.notes,
          });
          appendMessage("assistant", summary);
          showToast("Sleep logged");
          break;
        }
        case "todo-update": {
          const target = resolveTodoCandidate(action.payload.target, assistantContext.todos);
          if (!target) {
            appendMessage("assistant", "I couldn't match that task. Try naming the task more specifically.");
            return;
          }
          const updates = buildTodoUpdateFields(action.payload);
          const nextDay = action.payload.updates.day ?? target.day;
          const hasFieldUpdates = Object.keys(updates).length > 0;
          if (!hasFieldUpdates && nextDay === target.day) {
            appendMessage("assistant", "I need a time, day, priority, or title change for that task.");
            return;
          }
          if (nextDay !== target.day) {
            moveTodo({ fromDay: target.day, id: target.id, toDay: nextDay, updates });
          } else {
            updateTodo({ day: target.day, id: target.id, updates });
          }
          appendMessage("assistant", buildTodoUpdateActionSummary(target, action.payload));
          showToast("Task updated");
          break;
        }
        case "todo-complete": {
          const target = resolveTodoCandidate(action.payload.target, assistantContext.todos);
          if (!target) {
            appendMessage("assistant", "I couldn't match that task. Try naming the task more specifically.");
            return;
          }
          const shouldBeDone = action.payload.done ?? true;
          if (target.done !== shouldBeDone) {
            toggleTodo({ day: target.day, id: target.id });
          }
          appendMessage("assistant", `${shouldBeDone ? "Completed" : "Reopened"}: ${target.text}.`);
          showToast(shouldBeDone ? "Task completed" : "Task reopened");
          break;
        }
        default:
          break;
      }
    },
    [
      addJournal,
      addTodo,
      appendMessage,
      assistantContext.todos,
      logMood,
      logSleep,
      moveTodo,
      showToast,
      toggleTodo,
      updateTodo,
    ],
  );

  const moodValue = draft?.type === "mood" ? draft.payload.mood ?? 5 : 5;
  const moodTone = useMemo(() => {
    if (moodValue <= 3) {
      return { text: "text-rose-300", accent: "#f87171" };
    }
    if (moodValue <= 5) {
      return { text: "text-amber-300", accent: "#fbbf24" };
    }
    if (moodValue <= 7) {
      return { text: "text-lime-300", accent: "#84cc16" };
    }
    return { text: "text-emerald-300", accent: "#34d399" };
  }, [moodValue]);
  const moodPercent = useMemo(() => ((moodValue - 1) / 9) * 100, [moodValue]);

  const handleAddMoodTag = useCallback(() => {
    const trimmed = newTagValue.trim();
    if (!trimmed) return;
    addMoodTag({ tag: trimmed });
    setNewTagValue("");
    setTagManagerOpen(false);
    showToast("Mood tag added");
  }, [addMoodTag, newTagValue, showToast]);

  const handleRenameMoodTag = useCallback(
    (tag: string) => {
      const next = window.prompt("Rename tag", tag);
      if (!next) return;
      const trimmed = next.trim();
      if (!trimmed || trimmed === tag) return;
      renameMoodTag({ from: tag, to: trimmed });
      setDraft((current) => {
        if (!current || current.type !== "mood") return current;
        const currentTags = current.payload.tags ?? [];
        if (!currentTags.includes(tag)) return current;
        const nextTags = currentTags.map((value) => (value === tag ? trimmed : value));
        return { ...current, payload: { ...current.payload, tags: nextTags } };
      });
      showToast("Mood tag updated");
    },
    [renameMoodTag, showToast],
  );

  const handleDeleteMoodTag = useCallback(
    (tag: string) => {
      const confirmed = window.confirm(`Remove "${tag}" from quick tags?`);
      if (!confirmed) return;
      deleteMoodTag({ tag });
      setDraft((current) => {
        if (!current || current.type !== "mood") return current;
        const currentTags = current.payload.tags ?? [];
        if (!currentTags.includes(tag)) return current;
        return {
          ...current,
          payload: { ...current.payload, tags: currentTags.filter((value) => value !== tag) },
        };
      });
      showToast("Mood tag removed");
    },
    [deleteMoodTag, showToast],
  );

  return (
    <div
      className={`grid gap-5 ${
        draft
          ? "lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.78fr)] xl:grid-cols-[minmax(0,0.9fr)_minmax(460px,0.72fr)]"
          : "xl:grid-cols-[minmax(0,1fr)_360px]"
      }`}
    >
      <section
        className={`glass-panel rounded-[28px] border border-white/10 bg-white/[0.055] p-4 backdrop-blur-xl sm:p-5 lg:p-6 ${
          draft ? "hidden lg:block" : "block"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">Assistant</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Command Chat</h2>
            <p className="mt-2 text-sm text-zinc-300">
              Type a quick command to log mood, journal, sleep, or schedule todos.
            </p>
          </div>
          <button
            type="button"
            onClick={() => appendMessage("assistant", buildHelpText())}
            className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/70 hover:text-white"
          >
            Examples
          </button>
        </div>

        <VoiceActionPanel
          status={voiceStatus}
          intentStatus={intentStatus}
          transcript={voiceTranscript}
          error={voiceError}
          onStart={() => void startVoiceCapture()}
          onStop={stopVoiceCapture}
        />

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { label: "Log mood", action: "mood" },
            { label: "Log journal", action: "journal" },
            { label: "Log sleep", action: "sleep" },
            { label: "Add todo", action: "todo" },
          ].map((item) => (
            <button
              key={item.action}
              type="button"
              onClick={() => {
                if (item.action === "mood") {
                  setDraft({
                    type: "mood",
                    payload: { mood: 5, note: "", tags: [] },
                    missing: [],
                  });
                  setTagManagerOpen(false);
                  setNewTagValue("");
                }
                if (item.action === "journal") {
                  setDraft({
                    type: "journal",
                    payload: { text: "", prompt: "free" },
                    missing: ["text"],
                  });
                }
                if (item.action === "sleep") {
                  setDraft({
                    type: "sleep",
                    payload: {
                      durationMins: DEFAULT_DURATION,
                      quality: 3,
                      recoveryScore: 3,
                      day: sleepDefaultDay,
                      startMinutes: 23 * 60,
                      endMinutes: 7 * 60,
                    },
                    missing: [],
                  });
                }
                if (item.action === "todo") {
                  setDraft({
                    type: "todo",
                    payload: {
                      text: "",
                      day: getDayKey(),
                      timeblockMins: 30,
                      startTime: "",
                      endTime: "",
                      priority: 2,
                      color: defaultBlockColor,
                      icon: defaultTaskIcon,
                      repeatType: "none",
                      repeatWeekdays: [],
                      repeatMonthDay: dayKeyToDate(getDayKey()).getDate(),
                    },
                    missing: ["text"],
                  });
                }
                setPending(null);
              }}
              className="rounded-full border border-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/70 hover:text-white"
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {assistantExamplePrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setInput(prompt)}
              className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/8 px-3 py-2 text-[11px] font-semibold text-cyan-50/80 transition hover:border-cyan-200/50 hover:text-white"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div
          ref={conversationRef}
          className="mt-6 max-h-[420px] space-y-3 overflow-y-auto pr-2"
        >
          {messages.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Start with a command. I’ll ask clarifying questions if needed.
            </p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[520px] rounded-2xl px-4 py-3 text-sm shadow-lg ${
                    message.role === "user"
                      ? "bg-gradient-to-br from-cyan-400/30 to-emerald-400/20 text-white"
                      : "bg-black/40 text-zinc-100"
                  }`}
                >
                  <p className="text-[10px] uppercase tracking-[0.3em] text-white/50">
                    {message.role === "user" ? "You" : "Assistant"}
                  </p>
                  <p className="mt-1 whitespace-pre-line">{message.text}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {pending && (
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-200">
            <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">
              Pending {pending.type}
            </p>
            <p className="mt-1">{buildPendingSummary(pending)}</p>
          </div>
        )}
        {!draft && (
          <form
            className="mt-6 flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              handleSubmit();
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
              placeholder="e.g. log mood 7 stressed note: long day"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="rounded-2xl bg-gradient-to-r from-emerald-300 to-cyan-400 px-4 py-3 text-sm font-semibold text-zinc-900"
              >
                Send
              </button>
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setPending(null);
                  setDraft(null);
                  setTagManagerOpen(false);
                  setNewTagValue("");
                }}
                className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/70 hover:text-white"
              >
                Clear
              </button>
            </div>
          </form>
        )}
      </section>

      {draft && (
        <section className="min-w-0">
        {draft?.type === "todo" && (
          <AssistantTaskPanel
            draft={draft}
            dayOptions={dayOptions}
            onChange={(payload) =>
              setDraft((current) =>
                current && current.type === "todo"
                  ? {
                      ...current,
                      payload,
                      missing: payload.text?.trim() ? [] : ["text"],
                    }
                  : current,
              )
            }
            onConfirm={() => {
              runAction(draft);
              setDraft(null);
            }}
            onCancel={() => setDraft(null)}
          />
        )}
        {draft && draft.type !== "todo" && (
          <form
            className="glass-panel flex h-[calc(100svh-var(--jarvis-mobile-nav-height)-6rem)] min-h-0 flex-col overflow-hidden rounded-[28px] border border-emerald-300/20 bg-[#0b1121]/95 text-sm text-white shadow-2xl backdrop-blur-xl lg:sticky lg:top-8 lg:h-[calc(100dvh-4rem)] lg:min-h-0"
            onSubmit={(event) => {
              event.preventDefault();
              runAction(draft);
              setDraft(null);
            }}
          >
            <div className="shrink-0 border-b border-white/10 px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.3em] text-emerald-100/70">Action editor</p>
                  <h3 className="mt-1 text-xl font-semibold text-white sm:text-2xl">Confirm {draft.type}</h3>
                  <p className="mt-1 text-sm text-white/80">
                    {draft.type === "sleep"
                      ? `Duration ${formatDuration(
                          draft.payload.durationMins ?? DEFAULT_DURATION,
                        )}, quality ${draft.payload.quality ?? "?"}, recovery ${
                          draft.payload.recoveryScore ?? "?"
                        }.`
                      : buildPendingSummary(draft)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="shrink-0 rounded-full border border-white/20 px-3 py-2 text-sm text-white/70 hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>

            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-5"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
              {draft.type === "mood" && (
                <>
                  <div className="sm:col-span-2">
                    <label className="text-sm font-medium text-zinc-200">
                      Mood: <span className={`slider-emphasis ${moodTone.text}`}>{moodValue}/10</span>
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={moodValue}
                      onChange={(event) =>
                        setDraft((current) =>
                          current && current.type === "mood"
                            ? {
                                ...current,
                                payload: { ...current.payload, mood: Number(event.target.value) || 1 },
                              }
                            : current,
                        )
                      }
                      className="mt-2 h-2 w-full cursor-pointer appearance-none rounded bg-transparent"
                      style={{
                        accentColor: moodTone.accent,
                        background: `linear-gradient(90deg, ${moodTone.accent} 0%, ${moodTone.accent} ${moodPercent}%, #3f3f46 ${moodPercent}%, #3f3f46 100%)`,
                      }}
                    />
                  </div>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70">
                    Note
                    <input
                      value={draft.payload.note ?? ""}
                      onChange={(event) =>
                        setDraft((current) =>
                          current && current.type === "mood"
                            ? {
                                ...current,
                                payload: { ...current.payload, note: event.target.value },
                              }
                            : current,
                        )
                      }
                      className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70 sm:col-span-2">
                    Tags
                    <div className="flex flex-wrap gap-2">
                      {moodTagOptions.map((tag) => {
                        const active = draft.payload.tags?.includes(tag);
                        const normalized = tag.toLowerCase();
                        const isCustom = !builtInMoodTagSet.has(normalized);
                        return (
                          <div key={tag} className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setDraft((current) => {
                                  if (!current || current.type !== "mood") return current;
                                  const currentTags = current.payload.tags ?? [];
                                  const nextTags = active
                                    ? currentTags.filter((value) => value !== tag)
                                    : [...currentTags, tag];
                                  return {
                                    ...current,
                                    payload: { ...current.payload, tags: nextTags },
                                  };
                                })
                              }
                              className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] transition ${
                                active
                                  ? "bg-cyan-300 text-zinc-900"
                                  : "bg-white/10 text-zinc-300"
                              }`}
                            >
                              {tag}
                            </button>
                            {tagManagerOpen && isCustom && (
                              <div className="absolute -top-2 -right-2 flex gap-1 rounded-full bg-black/60 px-1 py-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleRenameMoodTag(tag)}
                                  className="text-[10px] text-cyan-200 hover:text-white"
                                  aria-label={`Rename ${tag}`}
                                >
                                  ✎
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMoodTag(tag)}
                                  className="text-[10px] text-rose-300 hover:text-white"
                                  aria-label={`Delete ${tag}`}
                                >
                                  ×
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </label>
                  <button
                    type="button"
                    onClick={() => setTagManagerOpen((prev) => !prev)}
                    className={`rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                      tagManagerOpen ? "bg-cyan-300/20 text-cyan-100" : "bg-white/10 text-zinc-400"
                    }`}
                  >
                    {tagManagerOpen ? "Done" : "+ Tag"}
                  </button>
                  {tagManagerOpen && (
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <input
                        value={newTagValue}
                        onChange={(event) => setNewTagValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleAddMoodTag();
                          }
                        }}
                        className="flex-1 min-w-[180px] rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white placeholder:text-zinc-500"
                        placeholder="e.g. calm, foggy, dialed"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddMoodTag()}
                        className="rounded-full bg-cyan-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-900"
                      >
                        Add
                      </button>
                    </div>
                  )}
                </>
              )}
              {draft.type === "journal" && (
                <>
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    {(["morning", "priority", "free"] as const).map((prompt) => {
                      const active = draft.payload.prompt === prompt;
                      return (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() =>
                            setDraft((current) =>
                              current && current.type === "journal"
                                ? {
                                    ...current,
                                    payload: { ...current.payload, prompt },
                                  }
                                : current,
                            )
                          }
                          className={`rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.25em] ${
                            active
                              ? "bg-emerald-300 text-zinc-900"
                              : "border border-white/15 text-white/70"
                          }`}
                        >
                          {prompt}
                        </button>
                      );
                    })}
                  </div>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70 sm:col-span-2">
                    Entry
                    <textarea
                      value={draft.payload.text ?? ""}
                      onChange={(event) =>
                        setDraft((current) =>
                          current && current.type === "journal"
                            ? {
                                ...current,
                                payload: { ...current.payload, text: event.target.value },
                              }
                            : current,
                        )
                      }
                      rows={3}
                      className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                  </label>
                </>
              )}
              {draft.type === "sleep" && (
                <>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70 sm:col-span-2">
                    Day
                    <select
                      value={draft.payload.day ?? getDefaultSleepDay()}
                      onChange={(event) =>
                        setDraft((current) =>
                          current && current.type === "sleep"
                            ? {
                                ...current,
                                payload: {
                                  ...current.payload,
                                  day: event.target.value as DayKey,
                                },
                              }
                            : current,
                        )
                      }
                      className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    >
                      {dayOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="sm:col-span-2">
                    <SleepClock
                      startMinutes={draft.payload.startMinutes ?? 23 * 60}
                      endMinutes={draft.payload.endMinutes ?? 7 * 60}
                      onChange={(range) =>
                        setDraft((current) =>
                          current && current.type === "sleep"
                            ? {
                                ...current,
                                payload: {
                                  ...current.payload,
                                  startMinutes: range.startMinutes,
                                  endMinutes: range.endMinutes,
                                  durationMins: calculateDuration(range.startMinutes, range.endMinutes),
                                },
                              }
                            : current,
                        )
                      }
                    />
                  </div>
                  <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
                    <SliderField
                      label="Quality"
                      value={draft.payload.quality ?? 3}
                      min={1}
                      max={5}
                      onChange={(value) =>
                        setDraft((current) =>
                          current && current.type === "sleep"
                            ? {
                                ...current,
                                payload: { ...current.payload, quality: value },
                              }
                            : current,
                        )
                      }
                      suffix="/5"
                    />
                    <SliderField
                      label="Recovery"
                      value={draft.payload.recoveryScore ?? 3}
                      min={1}
                      max={5}
                      onChange={(value) =>
                        setDraft((current) =>
                          current && current.type === "sleep"
                            ? {
                                ...current,
                                payload: { ...current.payload, recoveryScore: value },
                              }
                            : current,
                        )
                      }
                      suffix="/5"
                    />
                  </div>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70 sm:col-span-2">
                    Dreams
                    <textarea
                      value={draft.payload.dreams ?? ""}
                      onChange={(event) =>
                        setDraft((current) =>
                          current && current.type === "sleep"
                            ? {
                                ...current,
                                payload: { ...current.payload, dreams: event.target.value },
                              }
                            : current,
                        )
                      }
                      rows={2}
                      className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                      placeholder="Symbols, themes, or recall"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70 sm:col-span-2">
                    Recovery notes
                    <textarea
                      value={draft.payload.notes ?? ""}
                      onChange={(event) =>
                        setDraft((current) =>
                          current && current.type === "sleep"
                            ? {
                                ...current,
                                payload: { ...current.payload, notes: event.target.value },
                              }
                            : current,
                        )
                      }
                      rows={2}
                      className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                      placeholder="HRV, soreness, habits, or sleep quality notes"
                    />
                  </label>
                </>
              )}
              {draft.type === "todo-update" && (
                <>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70 sm:col-span-2">
                    Task to update
                    <input
                      value={draft.payload.target?.text ?? ""}
                      onChange={(event) =>
                        setDraft((current) =>
                          current && current.type === "todo-update"
                            ? {
                                ...current,
                                payload: {
                                  ...current.payload,
                                  target: { ...current.payload.target, text: event.target.value },
                                },
                                missing: event.target.value.trim()
                                  ? current.missing.filter((item) => item !== "target")
                                  : current.missing,
                              }
                            : current,
                        )
                      }
                      className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70">
                    Day
                    <input
                      type="date"
                      value={draft.payload.updates.day ?? draft.payload.target?.day ?? getDayKey()}
                      onChange={(event) =>
                        setDraft((current) =>
                          current && current.type === "todo-update"
                            ? {
                                ...current,
                                payload: {
                                  ...current.payload,
                                  updates: { ...current.payload.updates, day: event.target.value as DayKey },
                                },
                                missing: current.missing.filter((item) => item !== "change"),
                              }
                            : current,
                        )
                      }
                      className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70">
                    Start
                    <select
                      value={draft.payload.updates.startTime ?? ""}
                      onChange={(event) =>
                        setDraft((current) =>
                          current && current.type === "todo-update"
                            ? {
                                ...current,
                                payload: {
                                  ...current.payload,
                                  updates: {
                                    ...current.payload.updates,
                                    startTime: event.target.value || undefined,
                                  },
                                },
                                missing: current.missing.filter((item) => item !== "change"),
                              }
                            : current,
                        )
                      }
                      className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    >
                      <option value="">No time</option>
                      {timeblockOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70">
                    Minutes
                    <input
                      type="number"
                      min={5}
                      step={5}
                      value={draft.payload.updates.timeblockMins ?? ""}
                      onChange={(event) =>
                        setDraft((current) =>
                          current && current.type === "todo-update"
                            ? {
                                ...current,
                                payload: {
                                  ...current.payload,
                                  updates: {
                                    ...current.payload.updates,
                                    timeblockMins: event.target.value ? Number(event.target.value) : undefined,
                                  },
                                },
                                missing: current.missing.filter((item) => item !== "change"),
                              }
                            : current,
                        )
                      }
                      className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70">
                    Priority
                    <select
                      value={draft.payload.updates.priority ?? ""}
                      onChange={(event) =>
                        setDraft((current) =>
                          current && current.type === "todo-update"
                            ? {
                                ...current,
                                payload: {
                                  ...current.payload,
                                  updates: {
                                    ...current.payload.updates,
                                    priority: event.target.value ? (Number(event.target.value) as TodoPriority) : undefined,
                                  },
                                },
                                missing: current.missing.filter((item) => item !== "change"),
                              }
                            : current,
                        )
                      }
                      className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    >
                      <option value="">Keep</option>
                      <option value="1">High</option>
                      <option value="2">Medium</option>
                      <option value="3">Low</option>
                    </select>
                  </label>
                </>
              )}
              {draft.type === "todo-complete" && (
                <>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70 sm:col-span-2">
                    Task to complete
                    <input
                      value={draft.payload.target?.text ?? ""}
                      onChange={(event) =>
                        setDraft((current) =>
                          current && current.type === "todo-complete"
                            ? {
                                ...current,
                                payload: {
                                  ...current.payload,
                                  target: { ...current.payload.target, text: event.target.value },
                                },
                                missing: event.target.value.trim()
                                  ? current.missing.filter((item) => item !== "target")
                                  : current.missing,
                              }
                            : current,
                        )
                      }
                      className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={draft.payload.done ?? true}
                      onChange={(event) =>
                        setDraft((current) =>
                          current && current.type === "todo-complete"
                            ? {
                                ...current,
                                payload: { ...current.payload, done: event.target.checked },
                              }
                            : current,
                        )
                      }
                    />
                    Complete this task
                  </label>
                </>
              )}
              </div>
            </div>

            <div className="shrink-0 border-t border-white/10 bg-[#0b1121] px-5 pb-3 pt-3 shadow-[0_-18px_40px_rgba(2,6,23,0.45)] sm:px-6 sm:pb-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/70 hover:text-white"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  className="rounded-2xl bg-gradient-to-r from-emerald-300 to-cyan-400 px-4 py-3 text-sm font-semibold text-zinc-900"
                >
                  Confirm
                </button>
              </div>
            </div>
          </form>
        )}
        </section>
      )}

      {!draft && (
        <aside className="hidden min-w-0 xl:block">
          <div className="glass-panel rounded-[28px] border border-white/10 bg-white/[0.045] p-5 backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">Ready actions</p>
            <div className="mt-4 space-y-3 text-sm text-zinc-300">
              <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                <p className="font-semibold text-white">Capture</p>
                <p className="mt-1 text-xs leading-5 text-zinc-400">Tasks, mood, sleep, journal notes, and quick updates.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                <p className="font-semibold text-white">Adjust</p>
                <p className="mt-1 text-xs leading-5 text-zinc-400">Move tasks, change priorities, complete items, and reschedule blocks.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                <p className="font-semibold text-white">Review</p>
                <p className="mt-1 text-xs leading-5 text-zinc-400">Ask for patterns across mood, sleep, tasks, and recent planner data.</p>
              </div>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

function buildAssistantContext(state: JarvisState): AssistantContextPayload {
  const today = getDayKey();
  const now = Date.now();
  const minDay = offsetDayKey(today, -14);
  const maxDay = offsetDayKey(today, 45);
  const todos = Object.entries(state.todos)
    .flatMap(([day, items]) =>
      items.map((todo) => ({
        id: todo.id,
        day,
        text: todo.text,
        done: todo.done,
        priority: todo.priority,
        startTime: todo.startTime,
        timeblockMins: todo.timeblockMins,
      })),
    )
    .filter((todo) => todo.day >= minDay && todo.day <= maxDay)
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.day !== b.day) return a.day.localeCompare(b.day);
      return (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99");
    })
    .slice(0, 90);
  const mood = Object.entries(state.mood)
    .flatMap(([day, logs]) => logs.map((log) => ({ day, mood: log.mood, note: log.note, tags: log.tags })))
    .filter((log) => now - dayKeyToDate(log.day).getTime() <= 14 * 24 * 60 * 60 * 1000)
    .slice(0, 30);
  const sleep = Object.entries(state.sleep)
    .flatMap(([day, entries]) =>
      entries.map((entry) => ({
        day,
        durationMins: entry.durationMins,
        quality: entry.quality,
        recoveryScore: entry.recoveryScore,
      })),
    )
    .filter((entry) => now - dayKeyToDate(entry.day).getTime() <= 14 * 24 * 60 * 60 * 1000)
    .slice(0, 30);

  return {
    nowIso: new Date().toISOString(),
    today,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
    todos,
    mood,
    sleep,
    moodTags: Array.from(new Set([...defaultMoodTags, ...(state.moodTags ?? [])])),
  };
}

function buildPendingActionFromIntent(
  result: AssistantIntentResult,
  context: AssistantContextPayload,
): PendingAction | null {
  switch (result.kind) {
    case "log_mood": {
      const mood = normalizeNumber(result.mood?.mood);
      return {
        type: "mood",
        payload: {
          mood: mood && mood >= 1 && mood <= 10 ? mood : undefined,
          note: result.mood?.note,
          tags: result.mood?.tags ?? [],
        },
        missing: mood ? [] : ["mood"],
      };
    }
    case "add_journal": {
      return {
        type: "journal",
        payload: {
          text: result.journal?.text,
          prompt: result.journal?.prompt ?? "free",
        },
        missing: result.journal?.text ? [] : ["text"],
      };
    }
    case "add_todo": {
      const day = normalizeIntentDay(result.todo?.day, context.today);
      const text = result.todo?.text;
      const style = suggestTaskStyle(text ?? "");
      return {
        type: "todo",
        payload: {
          text,
          day,
          startTime: result.todo?.startTime,
          endTime: result.todo?.endTime,
          timeblockMins: result.todo?.timeblockMins,
          priority: normalizePriority(result.todo?.priority) ?? 2,
          color: style.color,
          icon: style.icon,
          repeatType: "none",
          repeatWeekdays: [],
          repeatMonthDay: dayKeyToDate(day ?? getDayKey()).getDate(),
        },
        missing: text ? [] : ["text"],
      };
    }
    case "log_sleep": {
      return {
        type: "sleep",
        payload: {
          durationMins: normalizeNumber(result.sleep?.durationMins),
          quality: normalizeNumber(result.sleep?.quality) ?? 3,
          recoveryScore: normalizeNumber(result.sleep?.recoveryScore),
          day: normalizeIntentDay(result.sleep?.day, context.today),
          startMinutes: normalizeNumber(result.sleep?.startMinutes),
          endMinutes: normalizeNumber(result.sleep?.endMinutes),
          notes: result.sleep?.notes,
        },
        missing: result.sleep?.durationMins ? [] : ["duration"],
      };
    }
    case "update_todo": {
      const target = result.todo?.target ?? findTodoTarget(result.todo?.text, context.todos);
      const updates = {
        text: result.todo?.text && target?.text !== result.todo.text ? result.todo.text : undefined,
        day: normalizeIntentDay(result.todo?.day, undefined),
        startTime: result.todo?.startTime,
        endTime: result.todo?.endTime,
        timeblockMins: result.todo?.timeblockMins,
        priority: normalizePriority(result.todo?.priority),
      };
      return {
        type: "todo-update",
        payload: { target, updates },
        missing: [
          ...(target?.id || target?.text ? [] : ["target"] as const),
          ...(hasTodoUpdates(updates) ? [] : ["change"] as const),
        ],
      };
    }
    case "complete_todo": {
      const target = result.todo?.target ?? findTodoTarget(result.todo?.text, context.todos);
      return {
        type: "todo-complete",
        payload: { target, done: result.todo?.done ?? true },
        missing: target?.id || target?.text ? [] : ["target"],
      };
    }
    case "clarify": {
      if (result.todo?.target || result.todo?.text || result.todo?.priority || result.todo?.startTime || result.todo?.day) {
        const target = result.todo.target ?? findTodoTarget(result.todo.text, context.todos);
        return {
          type: "todo-update",
          payload: {
            target: target ?? (result.todo.text ? { text: result.todo.text } : undefined),
            updates: {
              day: normalizeIntentDay(result.todo.day, undefined),
              startTime: result.todo.startTime,
              endTime: result.todo.endTime,
              timeblockMins: result.todo.timeblockMins,
              priority: normalizePriority(result.todo.priority),
            },
          },
          missing: target?.id ? [] : ["target"],
        };
      }
      return null;
    }
    default:
      return null;
  }
}

function resolveTodoCandidate(
  target: TodoActionTarget | undefined,
  todos: AssistantTodoCandidate[],
): AssistantTodoCandidate | undefined {
  if (!target) return undefined;
  if (target.id) {
    const byId = todos.find((todo) => todo.id === target.id);
    if (byId) return byId;
  }
  const fuzzy = findTodoTarget(target.text, todos);
  if (fuzzy?.id) return todos.find((todo) => todo.id === fuzzy.id);
  if (target.day && target.text) {
    return todos.find(
      (todo) => todo.day === target.day && todo.text.toLowerCase() === target.text?.toLowerCase(),
    );
  }
  return undefined;
}

function buildTodoUpdateFields(payload: TodoUpdatePayload): Partial<Pick<TodoItem, "text" | "priority" | "timeblockMins" | "startTime">> {
  const computedTimeblock = computeTimeblockFromTimes(payload.updates.startTime, payload.updates.endTime);
  return compactObject({
    text: payload.updates.text,
    priority: payload.updates.priority,
    startTime: payload.updates.startTime,
    timeblockMins: computedTimeblock ?? payload.updates.timeblockMins,
  });
}

function buildTodoUpdateActionSummary(target: AssistantTodoCandidate, payload: TodoUpdatePayload) {
  const pieces = [`Updated ${target.text}`];
  if (payload.updates.day && payload.updates.day !== target.day) {
    pieces.push(`to ${formatDayLabel(payload.updates.day)}`);
  }
  if (payload.updates.startTime) {
    pieces.push(`at ${formatMinutesLabel(parseTimeToMinutes(payload.updates.startTime) ?? 0)}`);
  }
  if (payload.updates.timeblockMins) {
    pieces.push(`for ${formatDuration(payload.updates.timeblockMins)}`);
  }
  if (payload.updates.priority) {
    pieces.push(priorityLabel(payload.updates.priority).toLowerCase());
  }
  return `${pieces.join(" ")}.`;
}

function hasTodoUpdates(updates: TodoUpdatePayload["updates"]) {
  return Boolean(updates.text || updates.day || updates.startTime || updates.endTime || updates.timeblockMins || updates.priority);
}

function normalizePriority(value: unknown): TodoPriority | undefined {
  return value === 1 || value === 2 || value === 3 ? value : undefined;
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeIntentDay(value: unknown, fallback: DayKey | undefined): DayKey | undefined {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value;
}

function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== ""),
  ) as Partial<T>;
}

function offsetDayKey(dayKey: DayKey, offset: number) {
  const date = dayKeyToDate(dayKey);
  date.setDate(date.getDate() + offset);
  return getDayKey(date);
}

function formatDayLabel(day: DayKey) {
  return dayKeyToDate(day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getIntentErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return `I could not interpret that yet: ${error.message}`;
  }
  return "I could not interpret that yet.";
}

function VoiceActionPanel({
  status,
  intentStatus,
  transcript,
  error,
  onStart,
  onStop,
}: {
  status: VoiceStatus;
  intentStatus: "idle" | "thinking";
  transcript: string;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
}) {
  const isListening = status === "listening";
  const isProcessing = status === "processing" || intentStatus === "thinking";
  const statusLabel =
    intentStatus === "thinking"
      ? "Thinking"
      : status === "listening"
        ? "Listening"
        : status === "processing"
          ? "Processing"
          : status === "error"
            ? "Needs attention"
            : "Ready";

  return (
    <div className="mt-5 grid gap-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/8 p-4 md:grid-cols-[auto,1fr] md:items-center">
      <button
        type="button"
        onClick={isListening ? onStop : onStart}
        disabled={isProcessing}
        className={
          "flex h-16 w-16 items-center justify-center rounded-full border text-slate-950 shadow-[0_14px_32px_rgba(34,211,238,0.25)] transition focus:outline-none focus:ring-2 focus:ring-cyan-200/70 " +
          (isListening
            ? "border-rose-200/70 bg-rose-300 hover:bg-rose-200"
            : "border-cyan-200/70 bg-cyan-300 hover:bg-cyan-200") +
          (isProcessing ? " opacity-70" : "")
        }
        aria-label={isListening ? "Stop voice capture" : "Start voice capture"}
      >
        {isListening ? <StopIcon className="h-6 w-6" /> : <VoiceIcon className="h-7 w-7" />}
      </button>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-100/70">Voice</p>
          <span
            className={
              "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] " +
              (status === "error"
                ? "border-rose-300/40 bg-rose-300/10 text-rose-100"
                : isListening
                  ? "border-cyan-200/40 bg-cyan-200/10 text-cyan-100"
                  : "border-white/10 bg-white/5 text-white/70")
            }
          >
            {statusLabel}
          </span>
        </div>
        <p className="mt-2 min-h-6 truncate text-sm text-white/90">
          {transcript || (isListening ? "Listening. Tap again when done." : isProcessing ? "Turning speech into an action..." : "Tap the mic and speak naturally.")}
        </p>
        {error && <p className="mt-2 text-xs text-rose-200">{error}</p>}
      </div>
    </div>
  );
}


function AssistantTaskPanel({
  draft,
  dayOptions,
  onChange,
  onConfirm,
  onCancel,
}: {
  draft: TodoDraftAction;
  dayOptions: DayOption[];
  onChange: (payload: TodoDraftAction["payload"]) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const payload = draft.payload;
  const text = payload.text ?? "";
  const priority = payload.priority ?? 2;
  const startTime = payload.startTime ?? "";
  const endTime = payload.endTime ?? "";
  const durationMinutes = payload.timeblockMins ?? computeTimeblockFromTimes(startTime, endTime);
  const icon = payload.icon ?? defaultTaskIcon;
  const color = payload.color ?? defaultBlockColor;
  const repeatType = payload.repeatType ?? "none";
  const repeatMonthDay = payload.repeatMonthDay ?? dayKeyToDate(payload.day ?? getDayKey()).getDate();
  const customEmojiValue = taskIconOptions.some((option) => option.id === icon) ? "" : icon;

  const updatePayload = (updates: Partial<TodoDraftAction["payload"]>) => {
    onChange({ ...payload, ...updates });
  };

  const handleTextChange = (value: string) => {
    const suggestion = suggestTaskStyle(value);
    const canApplySuggestion =
      (!payload.color || payload.color === defaultBlockColor) &&
      (!payload.icon || payload.icon === defaultTaskIcon);
    updatePayload({
      text: value,
      ...(canApplySuggestion ? { color: suggestion.color, icon: suggestion.icon } : {}),
    });
  };

  return (
    <form
      className="glass-panel flex h-[calc(100svh-var(--jarvis-mobile-nav-height)-6rem)] min-h-0 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0b1121]/95 shadow-2xl backdrop-blur-xl lg:sticky lg:top-8 lg:h-[calc(100dvh-4rem)] lg:min-h-0"
      onSubmit={(event) => {
        event.preventDefault();
        onConfirm();
      }}
    >
      <div className="shrink-0 border-b border-white/10 px-5 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">Task editor</p>
            <h3 className="mt-1 text-xl font-semibold text-white sm:text-2xl">Review and schedule</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-full border border-white/20 px-3 py-2 text-sm text-white/70 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-5"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="flex flex-col gap-5 pb-3">
            <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-2xl text-white">
                {getTaskIconSymbol(icon, text)}
              </div>
              <div className="flex-1">
                <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Task</p>
                <input
                  value={text}
                  onChange={(event) => handleTextChange(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-base text-white placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none sm:text-sm"
                  placeholder="Name the focus block"
                />
              </div>
            </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Schedule</p>
              <span className="text-[10px] uppercase tracking-[0.3em] text-white/50">
                {durationMinutes ? `${durationMinutes}m` : "No duration"}
              </span>
            </div>
            <div className="mt-4 space-y-4">
              <SelectField
                label="Day"
                value={payload.day ?? getDayKey()}
                onChange={(value) =>
                  updatePayload({
                    day: value as DayKey,
                    repeatMonthDay: dayKeyToDate(value as DayKey).getDate(),
                  })
                }
              >
                {dayOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
              <TimeRangeSelector
                startTime={startTime}
                endTime={endTime}
                timeblock={payload.timeblockMins}
                onStartTimeChange={(value) => {
                  const nextEndTime = payload.timeblockMins ? buildEndTime(value, payload.timeblockMins) : endTime;
                  updatePayload({
                    startTime: value || undefined,
                    endTime: nextEndTime || undefined,
                  });
                }}
                onEndTimeChange={(value) => {
                  const nextDuration = computeTimeblockFromTimes(startTime, value);
                  updatePayload({
                    endTime: value || undefined,
                    timeblockMins: nextDuration ?? payload.timeblockMins,
                  });
                }}
                onDurationChange={(duration) =>
                  updatePayload({
                    timeblockMins: duration,
                    endTime: startTime ? buildEndTime(startTime, duration) : endTime,
                  })
                }
                onClear={() =>
                  updatePayload({
                    startTime: undefined,
                    endTime: undefined,
                    timeblockMins: undefined,
                  })
                }
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Priority"
                  value={priority.toString()}
                  onChange={(value) => updatePayload({ priority: Number(value) as TodoPriority })}
                >
                  {[1, 2, 3].map((value) => (
                    <option key={value} value={value}>
                      {priorityLabel(value as TodoPriority)}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Repeat"
                  value={repeatType}
                  onChange={(value) =>
                    updatePayload({
                      repeatType: value as RepeatType,
                      repeatWeekdays: payload.repeatWeekdays ?? [],
                      repeatMonthDay,
                    })
                  }
                >
                  <option value="none">Once</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </SelectField>
              </div>
            </div>
            {repeatType === "weekly" && (
              <div className="mt-4 flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-zinc-400">
                <span className="pl-1">Repeat days</span>
                <div className="flex flex-wrap gap-2">
                  {repeatDayLabels.map((day) => {
                    const active = payload.repeatWeekdays?.includes(day.day);
                    return (
                      <button
                        key={day.day}
                        type="button"
                        onClick={() => {
                          const currentDays = payload.repeatWeekdays ?? [];
                          updatePayload({
                            repeatWeekdays: active
                              ? currentDays.filter((value) => value !== day.day)
                              : [...currentDays, day.day],
                          });
                        }}
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
            {repeatType === "monthly" && (
              <div className="mt-4">
                <SelectField
                  label="Repeat day"
                  value={repeatMonthDay.toString()}
                  onChange={(value) => updatePayload({ repeatMonthDay: Number(value) })}
                >
                  {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                    <option key={day} value={day}>
                      Day {day}
                    </option>
                  ))}
                </SelectField>
              </div>
            )}
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Style</p>
              <span className="text-[10px] uppercase tracking-[0.3em] text-white/40">Suggested</span>
            </div>
            <div className="mt-4 space-y-4">
              <ColorPicker colors={blockColors} value={color} onChange={(value) => updatePayload({ color: value })} />
              <IconPicker icons={taskIconOptions} value={icon} onChange={(value) => updatePayload({ icon: value })} />
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <CustomEmojiField
                  value={customEmojiValue}
                  onChange={(value) => {
                    const trimmed = value.trim();
                    if (!trimmed) return;
                    updatePayload({ icon: trimmed });
                  }}
                />
                <button
                  type="button"
                  onClick={() => updatePayload({ icon: defaultTaskIcon })}
                  className="rounded-full border border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-white/70 hover:text-white"
                >
                  Reset icon
                </button>
              </div>
            </div>
            </section>

        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 bg-[#0b1121] px-5 pb-3 pt-3 shadow-[0_-18px_40px_rgba(2,6,23,0.45)] sm:px-6 sm:pb-4">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/70 hover:text-white"
          >
            Discard
          </button>
          <button
            type="submit"
            className="rounded-2xl bg-gradient-to-r from-emerald-300 to-cyan-400 px-4 py-3 text-sm font-semibold text-zinc-900"
          >
            Save task
          </button>
        </div>
      </div>
    </form>
  );
}

function VoiceIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
      <path d="M8 22h8" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </svg>
  );
}

function getPreferredAudioMimeType() {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function getAudioExtension(mimeType: string) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

function getSpeechRecognitionError(error?: string) {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "Microphone permission is blocked for Jarvis.";
  }
  if (error === "no-speech") {
    return "I didn't hear a command. Try again a little closer to the microphone.";
  }
  if (error === "network") {
    return "Speech recognition could not reach the browser service.";
  }
  return "Voice capture could not finish. Try again.";
}

function getVoiceCaptureError(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Microphone permission is blocked for Jarvis.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No microphone was found on this device.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Voice capture failed.";
}

function isHelpRequest(text: string) {
  const normalized = text.trim().toLowerCase();
  return ["help", "examples", "commands", "?"].includes(normalized);
}

function buildHelpText() {
  return [
    "Try commands like:",
    "- add dinner today at 5:30pm high priority",
    "- add a task for 5:30 today for dinner high priority",
    "- move budget review to tomorrow at 9am",
    "- make workout high priority",
    "- complete grocery list",
    "- log mood 7 stressed note: long day",
    "- sleep 7.5h quality 4 recovery 3 yesterday",
    "- how am I doing this week?",
  ].join("\n");
}

function parseCommand(input: string, knownMoodTags: string[]): PendingAction | null {
  const normalized = input.trim();
  const lower = normalized.toLowerCase();

  if (lower.startsWith("mood") || lower.startsWith("log mood")) {
    return parseMoodCommand(normalized, knownMoodTags);
  }
  if (lower.startsWith("journal") || lower.startsWith("note")) {
    return parseJournalCommand(normalized);
  }
  if (lower.startsWith("todo") || lower.startsWith("task") || lower.startsWith("add ")) {
    return parseTodoCommand(normalized);
  }
  if (lower.startsWith("sleep") || lower.startsWith("log sleep")) {
    return parseSleepCommand(normalized);
  }
  return null;
}

function parseMoodCommand(input: string, knownMoodTags: string[]): PendingAction {
  const mood = extractMoodScore(input);
  const note = extractNote(input);
  const tags = extractTags(input, knownMoodTags);
  const missing: Array<"mood"> = mood ? [] : ["mood"];
  return {
    type: "mood",
    payload: { mood, note, tags },
    missing,
  };
}

function parseJournalCommand(input: string): PendingAction {
  const cleaned = input.replace(/^journal\s*/i, "").replace(/^note\s*/i, "");
  const prompt = extractPrompt(cleaned);
  const text = cleaned.replace(/^(morning|priority|free)\s*[:\-]\s*/i, "").trim();
  const missing: Array<"text"> = text ? [] : ["text"];
  return {
    type: "journal",
    payload: { text, prompt },
    missing,
  };
}

function parseTodoCommand(input: string): PendingAction {
  const cleaned = stripTodoLeadIn(input);
  const range = extractTimeRange(cleaned);
  const day = extractDayKey(cleaned);
  const timeblockMins = range?.durationMins ?? extractDurationMinutes(cleaned);
  const startTime = range?.startTime ?? extractTime(cleaned);
  const priority = extractPriority(cleaned);
  const rawText = cleanTodoTitle(cleaned);
  const text = rawText ? smartTitleCase(rawText) : rawText;
  const style = suggestTaskStyle(text);
  const missing: Array<"text"> = text ? [] : ["text"];
  return {
    type: "todo",
    payload: {
      text,
      day,
      timeblockMins,
      startTime,
      endTime: range?.endTime,
      priority,
      color: style.color,
      icon: style.icon,
      repeatType: "none",
      repeatWeekdays: [],
      repeatMonthDay: dayKeyToDate(day ?? getDayKey()).getDate(),
    },
    missing,
  };
}


function stripTodoLeadIn(input: string) {
  return input
    .replace(/^hey jarvis[,\s]*/i, "")
    .replace(/^(please\s+)?(add|create|schedule|set up)\s+/i, "")
    .replace(/^(todo|task)\s*/i, "")
    .trim();
}

function cleanTodoTitle(input: string) {
  const cleaned = normalizeTodoTitle(stripCommandMetadata(input));
  return isPlaceholderTodoTitle(cleaned) ? "" : cleaned;
}

function normalizeTodoTitle(text: string) {
  return text
    .replace(/^hey jarvis[,\s]*/i, "")
    .replace(/^(please\s+)?(add|create|schedule|set up)\s+/i, "")
    .replace(/^(a|an|the)\s+(new\s+)?(task|todo)\s*(for|to)?\s*/i, "")
    .replace(/^(new\s+)?(task|todo)\s*(for|to)?\s*/i, "")
    .replace(/^(a|an|the)\s+/i, "")
    .replace(/^(remind me to|remember to|i need to|need to|i have to|have to|gotta|make sure i)\s+/i, "")
    .replace(/^(for|to)\s+/i, "")
    .replace(/\b(a|an|the)\s+(task|todo)\s+(for|to)\s+/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[,.:;\-\s]+|[,.:;\-\s]+$/g, "")
    .replace(/^(for|to)\s+/i, "")
    .replace(/^(a|an|the)\s+/i, "")
    .trim();
}

function isPlaceholderTodoTitle(text: string) {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return !normalized || ["a task", "task", "todo", "new task", "new todo"].includes(normalized);
}
function parseSleepCommand(input: string): PendingAction {
  const durationMins = extractDurationMinutes(input);
  const quality = extractQuality(input) ?? 3;
  const recoveryScore = extractRecovery(input) ?? 3;
  const day = extractDayKey(input) ?? getDefaultSleepDay();
  const missing: Array<"duration" | "quality"> = [];
  const fallbackStart = 23 * 60;
  const fallbackEnd = durationMins ? (fallbackStart + durationMins) % TOTAL_MINUTES : 7 * 60;
  const fallbackDuration = durationMins ?? calculateDuration(fallbackStart, fallbackEnd);
  return {
    type: "sleep",
    payload: {
      durationMins: fallbackDuration,
      quality,
      recoveryScore,
      day,
      startMinutes: fallbackStart,
      endMinutes: fallbackEnd,
    },
    missing,
  };
}

function applyAnswer(
  pending: PendingAction,
  answer: string,
  context: AssistantContextPayload,
): PendingAction {
  switch (pending.type) {
    case "mood": {
      const mood = extractMoodScore(answer);
      if (!mood) return pending;
      return {
        ...pending,
        payload: { ...pending.payload, mood },
        missing: [],
      };
    }
    case "journal": {
      const text = answer.trim();
      if (!text) return pending;
      return {
        ...pending,
        payload: { ...pending.payload, text },
        missing: [],
      };
    }
    case "todo": {
      const text = answer.trim();
      if (!text) return pending;
      return {
        ...pending,
        payload: { ...pending.payload, text },
        missing: [],
      };
    }
    case "sleep": {
      const nextMissing = pending.missing[0];
      if (nextMissing === "duration") {
        const durationMins = extractDurationMinutes(answer);
        if (!durationMins) return pending;
        const remaining = pending.missing.filter((item) => item !== "duration");
        return {
          ...pending,
          payload: { ...pending.payload, durationMins },
          missing: remaining.length ? remaining : [],
        };
      }
      const quality = extractQuality(answer);
      if (!quality) return pending;
      const remaining = pending.missing.filter((item) => item !== "quality");
      return {
        ...pending,
        payload: { ...pending.payload, quality },
        missing: remaining.length ? remaining : [],
      };
    }
    case "todo-update": {
      if (pending.missing.includes("target")) {
        const target = findTodoTarget(answer, context.todos) ?? { text: answer.trim() };
        return {
          ...pending,
          payload: { ...pending.payload, target },
          missing: pending.missing.filter((item) => item !== "target"),
        };
      }
      return pending;
    }
    case "todo-complete": {
      if (pending.missing.includes("target")) {
        const target = findTodoTarget(answer, context.todos) ?? { text: answer.trim() };
        return {
          ...pending,
          payload: { ...pending.payload, target },
          missing: pending.missing.filter((item) => item !== "target"),
        };
      }
      return pending;
    }
    default:
      return pending;
  }
}

function buildClarifier(action: PendingAction) {
  const next = action.missing[0];
  if (action.type === "mood") {
    return "What mood (1-10) should I log?";
  }
  if (action.type === "journal") {
    return "What should I capture for the journal entry?";
  }
  if (action.type === "todo") {
    return "What task should I add?";
  }
  if (action.type === "sleep") {
    if (next === "duration") {
      return "How long did you sleep (e.g. 7.5h or 7h)?";
    }
    return "What was the sleep quality (1-5)?";
  }
  if (action.type === "todo-update") {
    if (next === "target") return "Which task should I update?";
    return "What should I change about that task?";
  }
  if (action.type === "todo-complete") {
    return "Which task should I complete?";
  }
  return "Can you clarify?";
}

function buildPendingSummary(action: PendingAction) {
  switch (action.type) {
    case "mood":
      return `Mood ${action.payload.mood ?? "?"} with tags ${
        action.payload.tags?.join(", ") || "none"
      }.`;
    case "journal":
      return action.payload.text ? `Entry: ${action.payload.text}` : "Waiting for entry text.";
    case "todo":
      if (!action.payload.text) {
        return "Waiting for task description.";
      }
      return `Task: ${action.payload.text}${formatTimeWindow(
        action.payload.startTime,
        action.payload.timeblockMins,
        action.payload.endTime,
      )}${action.payload.priority ? ` - ${priorityLabel(action.payload.priority)}` : ""}`;
    case "sleep":
      return `Duration ${formatDuration(
        action.payload.durationMins ?? DEFAULT_DURATION,
      )}, quality ${action.payload.quality ?? "?"}.`;
    case "todo-update":
      return buildTodoUpdatePendingSummary(action.payload);
    case "todo-complete":
      return `Complete task: ${action.payload.target?.text ?? "?"}.`;
    default:
      return "Pending action.";
  }
}

function buildTodoUpdatePendingSummary(payload: TodoUpdatePayload) {
  const pieces = [`Task: ${payload.target?.text ?? "?"}`];
  if (payload.updates.text) pieces.push(`rename to ${payload.updates.text}`);
  if (payload.updates.day) pieces.push(`move to ${formatDayLabel(payload.updates.day)}`);
  if (payload.updates.startTime) {
    pieces.push(`start ${formatMinutesLabel(parseTimeToMinutes(payload.updates.startTime) ?? 0)}`);
  }
  const duration = computeTimeblockFromTimes(payload.updates.startTime, payload.updates.endTime) ?? payload.updates.timeblockMins;
  if (duration) pieces.push(`duration ${formatDuration(duration)}`);
  if (payload.updates.priority) pieces.push(priorityLabel(payload.updates.priority));
  return pieces.join(" - ");
}

function buildActionSummary(action: PendingAction) {
  switch (action.type) {
    case "mood": {
      const tags = action.payload.tags?.length ? ` - tags: ${action.payload.tags.join(", ")}` : "";
      const note = action.payload.note ? ` - note: ${action.payload.note}` : "";
      return `Logged mood ${action.payload.mood}/10${tags}${note}.`;
    }
    case "journal": {
      const prompt = action.payload.prompt ? ` (${action.payload.prompt})` : "";
      return `Saved journal entry${prompt}: ${action.payload.text ?? ""}`.trim();
    }
    case "todo": {
      const dayLabel = action.payload.day
        ? dayKeyToDate(action.payload.day).toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })
        : "Today";
      const timeLabel = formatTimeWindow(
        action.payload.startTime,
        action.payload.timeblockMins,
        action.payload.endTime,
      );
      const priority = action.payload.priority ? ` - ${priorityLabel(action.payload.priority)}` : "";
      const repeatLabel =
        action.payload.repeatType && action.payload.repeatType !== "none"
          ? action.payload.repeatType === "weekly"
            ? " - repeats weekly"
            : ` - repeats monthly (${action.payload.repeatMonthDay ?? "?"})`
          : "";
      return `Added todo: ${action.payload.text} - ${dayLabel}${timeLabel}${priority}${repeatLabel}`;
    }
    case "sleep": {
      const durationValue =
        action.payload.startMinutes !== undefined && action.payload.endMinutes !== undefined
          ? calculateDuration(action.payload.startMinutes, action.payload.endMinutes)
          : action.payload.durationMins;
      const duration = durationValue ? formatDuration(durationValue) : "?";
      const quality = action.payload.quality ? ` - quality ${action.payload.quality}/5` : "";
      const recovery = action.payload.recoveryScore ? ` - recovery ${action.payload.recoveryScore}/5` : "";
      const dayLabel = action.payload.day
        ? dayKeyToDate(action.payload.day).toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })
        : "Today";
      return `Logged sleep: ${duration} - ${dayLabel}${quality}${recovery}.`;
    }
    case "todo-update":
      return buildTodoUpdatePendingSummary(action.payload);
    case "todo-complete":
      return `Complete task: ${action.payload.target?.text ?? "?"}.`;
    default:
      return "Action completed.";
  }
}

function extractMoodScore(text: string) {
  const numeric = text.match(/\b(10|[1-9])\b/) ?? text.match(/\b(10|[1-9])\s*(?:\/|out of\s*)10\b/i);
  if (numeric) {
    const value = Number(numeric[1]);
    return Number.isNaN(value) ? undefined : value;
  }
  const wordScore = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/i);
  return wordScore ? moodWordToScore(wordScore[1]) : undefined;
}

function moodWordToScore(value: string) {
  const scores: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  return scores[value.toLowerCase()];
}

function extractNote(text: string) {
  const match = text.match(/notes?[:\-]\s*(.+)$/i);
  return match ? match[1].trim() : undefined;
}

function extractTags(text: string, knownTags: string[]) {
  const lower = text.toLowerCase();
  const inferred = knownTags.filter((tag) => lower.includes(tag));
  const explicit = extractExplicitTags(lower, knownTags);
  return Array.from(new Set([...inferred, ...explicit]));
}

function extractExplicitTags(text: string, knownTags: string[]) {
  const match = text.match(/tags?\s*[:\-]\s*([a-z0-9,\s]+)/i);
  if (!match) return [];
  const rawTags = match[1]
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
  if (!rawTags.length) return [];
  const knownSet = new Set(knownTags.map((tag) => tag.toLowerCase()));
  return rawTags.filter((tag) => knownSet.has(tag));
}

type SliderFieldProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
};

function SliderField({ label, value, min, max, suffix = "", onChange }: SliderFieldProps) {
  const percent = ((value - min) / (max - min)) * 100;
  const tone =
    value <= 2
      ? { text: "text-rose-300", accent: "#f87171" }
      : value <= 3
        ? { text: "text-amber-300", accent: "#fbbf24" }
        : value <= 4
          ? { text: "text-lime-300", accent: "#84cc16" }
          : { text: "text-emerald-300", accent: "#34d399" };

  return (
    <label className="flex flex-col gap-2 text-sm text-zinc-300">
      <span>
        {label}: <span className={`slider-emphasis ${tone.text}`}>{value}{suffix}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded bg-transparent"
        style={{
          accentColor: tone.accent,
          background: `linear-gradient(90deg, ${tone.accent} 0%, ${tone.accent} ${percent}%, #3f3f46 ${percent}%, #3f3f46 100%)`,
        }}
      />
    </label>
  );
}

type SleepClockProps = {
  startMinutes: number;
  endMinutes: number;
  onChange: (range: { startMinutes: number; endMinutes: number }) => void;
};

function SleepClock({ startMinutes, endMinutes, onChange }: SleepClockProps) {
  const dialRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<"start" | "end" | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const scrollLockRef = useRef<number | null>(null);

  const lockScroll = useCallback(() => {
    if (scrollLockRef.current !== null) return;
    const scrollY = window.scrollY;
    scrollLockRef.current = scrollY;
    document.body.classList.add("scroll-locked");
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "";
    document.body.style.width = "100%";
  }, []);

  const unlockScroll = useCallback(() => {
    if (scrollLockRef.current === null) return;
    const scrollY = scrollLockRef.current;
    scrollLockRef.current = null;
    document.body.classList.remove("scroll-locked");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    window.scrollTo(0, scrollY);
  }, []);

  useEffect(() => {
    function handleMove(event: PointerEvent) {
      if (!draggingRef.current) return;
      event.preventDefault();
      const dial = dialRef.current;
      if (!dial) return;
      const rect = dial.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = event.clientX - centerX;
      const dy = event.clientY - centerY;
      const angle = Math.atan2(dy, dx);
      const degrees = ((angle * 180) / Math.PI + 450) % 360;
      const dialMinutes = snapToFive(Math.round((degrees / 360) * DIAL_MINUTES) % DIAL_MINUTES);
      if (draggingRef.current === "start") {
        onChange({
          startMinutes: dialMinutesToDayMinutes(dialMinutes, startMinutes),
          endMinutes,
        });
      } else {
        onChange({
          startMinutes,
          endMinutes: dialMinutesToDayMinutes(dialMinutes, endMinutes),
        });
      }
    }

    function handleUp() {
      draggingRef.current = null;
      setIsDragging(false);
      unlockScroll();
    }

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [startMinutes, endMinutes, onChange, unlockScroll]);

  useEffect(() => {
    if (!isDragging) return;
    return () => unlockScroll();
  }, [isDragging, unlockScroll]);

  const beginDrag = useCallback((handle: "start" | "end", event: ReactPointerEvent<HTMLButtonElement>) => {
    draggingRef.current = handle;
    lockScroll();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsDragging(true);
  }, [lockScroll]);

  const dialStart = startMinutes % DIAL_MINUTES;
  const dialEnd = endMinutes % DIAL_MINUTES;
  const durationMins = calculateDuration(startMinutes, endMinutes);
  const baseSegments =
    durationMins > DIAL_MINUTES
      ? [{ start: 0, end: DIAL_MINUTES }]
      : buildArcSegments(dialStart, dialEnd);
  const overMinutes = Math.max(0, durationMins - DIAL_MINUTES);
  const overSegments =
    overMinutes > 0
      ? buildArcSegments(dialStart, (dialStart + Math.min(overMinutes, DIAL_MINUTES)) % DIAL_MINUTES)
      : [];
  const duration = formatDuration(durationMins);

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div
        ref={dialRef}
        className="relative mx-auto aspect-square w-full max-w-[320px] select-none touch-none sm:max-w-[340px]"
        style={{ overscrollBehavior: "contain" }}
        onTouchMove={(event) => {
          if (isDragging) {
            event.preventDefault();
          }
        }}
      >
        <svg viewBox={`0 0 ${CLOCK_SIZE} ${CLOCK_SIZE}`} className="h-full w-full">
          <circle
            cx={CLOCK_SIZE / 2}
            cy={CLOCK_SIZE / 2}
            r={CLOCK_RADIUS}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={34}
            fill="none"
          />
          <circle
            cx={CLOCK_SIZE / 2}
            cy={CLOCK_SIZE / 2}
            r={CLOCK_RADIUS - 38}
            stroke="rgba(0,0,0,0.5)"
            strokeWidth={10}
            fill="none"
          />
          {Array.from({ length: 60 }).map((_, index) => {
            const angle = (index * 6 - 90) * (Math.PI / 180);
            const outer = CLOCK_RADIUS - 4;
            const inner = outer - (index % 5 === 0 ? 16 : 8);
            const x1 = CLOCK_SIZE / 2 + outer * Math.cos(angle);
            const y1 = CLOCK_SIZE / 2 + outer * Math.sin(angle);
            const x2 = CLOCK_SIZE / 2 + inner * Math.cos(angle);
            const y2 = CLOCK_SIZE / 2 + inner * Math.sin(angle);
            return (
              <line
                key={`tick-${index}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={index % 5 === 0 ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)"}
                strokeWidth={index % 5 === 0 ? 3 : 1}
                className="sleep-tick"
              />
            );
          })}
          {Array.from({ length: 12 }).map((_, index) => {
            const angle = (index * 30 - 90) * (Math.PI / 180);
            const textRadius = CLOCK_RADIUS - 60;
            const x = CLOCK_SIZE / 2 + textRadius * Math.cos(angle);
            const y = CLOCK_SIZE / 2 + textRadius * Math.sin(angle) + 4;
            return (
              <text
                key={`hour-${index}`}
                x={x}
                y={y}
                className="fill-white text-[13px] font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                textAnchor="middle"
              >
                {index === 0 ? 12 : index}
              </text>
            );
          })}
          {baseSegments.map((segment, index) => {
            const d = describeArc(segment.start, segment.end);
            return (
              <path
                key={`${segment.start}-${segment.end}-${index}`}
                d={d}
                stroke="url(#sleepGradient)"
                strokeWidth={36}
                fill="none"
                strokeLinecap="round"
              />
            );
          })}
          {overSegments.map((segment, index) => {
            const d = describeArc(segment.start, segment.end, CLOCK_RADIUS - 26);
            return (
              <path
                key={`over-${segment.start}-${segment.end}-${index}`}
                d={d}
                stroke="url(#sleepOverGradient)"
                strokeWidth={18}
                fill="none"
                strokeLinecap="round"
              />
            );
          })}
          <defs>
            <linearGradient id="sleepGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fde68a" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
            <linearGradient id="sleepOverGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fb7185" />
              <stop offset="100%" stopColor="#f97316" />
            </linearGradient>
          </defs>
        </svg>
        <ClockHandle
          label="Sleep"
          minutes={startMinutes}
          onPointerDown={(event) => beginDrag("start", event)}
        />
        <ClockHandle
          label="Wake"
          minutes={endMinutes}
          onPointerDown={(event) => beginDrag("end", event)}
        />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Duration</p>
          <p className="text-2xl font-semibold text-white whitespace-nowrap leading-tight tabular-nums">{duration}</p>
        </div>
      </div>
      <div className="grid w-full grid-cols-2 gap-4 text-sm text-zinc-300">
        <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Lights out</p>
          <p className="text-2xl font-semibold text-white">{formatMinutesLabel(startMinutes)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Wake</p>
          <p className="text-2xl font-semibold text-white">{formatMinutesLabel(endMinutes)}</p>
        </div>
      </div>
    </div>
  );
}

type ClockHandleProps = {
  label: string;
  minutes: number;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

function ClockHandle({ label, minutes, onPointerDown }: ClockHandleProps) {
  const position = useMemo(() => getHandlePosition(minutes), [minutes]);
  const icon = label === "Sleep" ? "🌙" : "🔔";
  return (
    <button
      type="button"
      aria-label={`${label} handle`}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onPointerDown(event);
      }}
      style={{ left: `${(position.x / CLOCK_SIZE) * 100}%`, top: `${(position.y / CLOCK_SIZE) * 100}%` }}
      className="absolute z-10 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-white text-xl text-zinc-900 shadow-xl transition hover:scale-105 focus:outline-none cursor-pointer touch-none"
    >
      <span role="presentation">{icon}</span>
    </button>
  );
}

function extractPrompt(text: string) {
  const match = text.match(/\b(morning|priority|free)\b/i);
  if (!match) return undefined;
  return match[1].toLowerCase() as "morning" | "priority" | "free";
}

function extractPriority(text: string): TodoPriority | undefined {
  const lower = text.toLowerCase();
  if (
    lower.includes("priority high") ||
    lower.includes("high priority") ||
    lower.includes("p1") ||
    lower.includes("priority 1")
  ) {
    return 1;
  }
  if (
    lower.includes("priority low") ||
    lower.includes("low priority") ||
    lower.includes("p3") ||
    lower.includes("priority 3")
  ) {
    return 3;
  }
  if (
    lower.includes("priority medium") ||
    lower.includes("medium priority") ||
    lower.includes("p2") ||
    lower.includes("priority 2")
  ) {
    return 2;
  }
  return undefined;
}

function extractDurationMinutes(text: string) {
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*h/i);
  if (hourMatch) {
    const hours = Number(hourMatch[1]);
    if (Number.isNaN(hours)) return undefined;
    return Math.round(hours * 60);
  }
  const minuteMatch = text.match(/(\d+)\s*m/i);
  if (minuteMatch) {
    const mins = Number(minuteMatch[1]);
    if (Number.isNaN(mins)) return undefined;
    return mins;
  }
  return undefined;
}

function extractQuality(text: string) {
  const match = text.match(/\bquality\s*([1-5])\b/i) ?? text.match(/\bq([1-5])\b/i);
  if (!match) return undefined;
  return Number(match[1]);
}

function extractRecovery(text: string) {
  const match = text.match(/\brecovery\s*([1-5])\b/i);
  if (!match) return undefined;
  return Number(match[1]);
}

function extractDayKey(text: string) {
  const lower = text.toLowerCase();
  const today = new Date();
  if (lower.includes("tomorrow")) {
    const next = new Date(today);
    next.setDate(today.getDate() + 1);
    return getDayKey(next);
  }
  if (lower.includes("yesterday") || lower.includes("last night")) {
    const prev = new Date(today);
    prev.setDate(today.getDate() - 1);
    return getDayKey(prev);
  }
  if (lower.includes("today")) {
    return getDayKey(today);
  }
  return undefined;
}

function extractTime(text: string) {
  const match12 = text.match(
    /\b(1[0-2]|0?[1-9])(?:\s*[:.]\s*|\s+)?([0-5]\d)?\s*(a\.?\s*m\.?|p\.?\s*m\.?)\b/i,
  );
  if (match12) {
    return formatClockTime(Number(match12[1]), match12[2] ?? "00", match12[3]);
  }
  if (/\bnoon\b/i.test(text)) return "12:00";
  if (/\bmidnight\b/i.test(text)) return "00:00";

  const match24 = text.match(/\b(2[0-3]|1[3-9]|0?0):([0-5]\d)\b/);
  if (match24) {
    const hours = match24[1].padStart(2, "0");
    return `${hours}:${match24[2]}`;
  }

  const ambiguousClock = text.match(
    /\b(?:at|around|about|by|for|from|to)?\s*(1[0-2]|0?[1-9])[:.]([0-5]\d)\b/i,
  );
  if (ambiguousClock) {
    const meridiem = inferMeridiemForAmbiguousTime(text, Number(ambiguousClock[1]));
    return formatClockTime(Number(ambiguousClock[1]), ambiguousClock[2], meridiem);
  }

  const casual = text.match(/\b(1[0-2]|0?[1-9])\s*(morning|afternoon|evening|night)\b/i);
  if (casual) {
    const meridiem = casual[2].toLowerCase() === "morning" ? "am" : "pm";
    return formatClockTime(Number(casual[1]), "00", meridiem);
  }

  const bareTime = text.match(
    /\b(?:at|around|about|by|for|from|to)\s+(1[0-2]|0?[1-9])\b(?!\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes|out\s+of))/i,
  );
  if (bareTime) {
    const meridiem = inferMeridiemForAmbiguousTime(text, Number(bareTime[1]));
    return formatClockTime(Number(bareTime[1]), "00", meridiem);
  }

  return undefined;
}

function formatClockTime(hourValue: number, minuteValue: string, meridiemValue: string) {
  let hours = hourValue;
  const meridiem = meridiemValue.toLowerCase().replace(/[\s.]/g, "");
  if (meridiem === "pm" && hours !== 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, "0")}:${minuteValue.padStart(2, "0")}`;
}

function inferMeridiemForAmbiguousTime(text: string, hour: number): "am" | "pm" {
  const lower = text.toLowerCase();
  if (/\b(morning|breakfast|before work|early)\b/.test(lower)) return "am";
  if (/\b(afternoon|evening|tonight|night|dinner|supper|after work|lunch|pm|p\.m\.)\b/.test(lower)) return "pm";
  if (hour === 12) return "pm";
  if (hour >= 1 && hour <= 6) return "pm";
  return "am";
}

function extractTimeRange(text: string) {
  const match =
    text.match(/\bfrom\s+([0-9:.\samp]+)\s+to\s+([0-9:.\samp]+)\b/i) ??
    text.match(/\bat\s+([0-9:.\samp]+)\s+to\s+([0-9:.\samp]+)\b/i) ??
    text.match(/\b([0-9:.\samp]+)\s+to\s+([0-9:.\samp]+)\b/i);
  if (!match) return undefined;
  const endMeridiem = extractMeridiem(match[2]);
  const startSource =
    endMeridiem && !extractMeridiem(match[1]) ? `${match[1]} ${endMeridiem}` : match[1];
  const startTime = extractTime(startSource);
  const endTime = extractTime(match[2]);
  if (!startTime || !endTime) return undefined;
  const [startHours, startMinutes] = startTime.split(":").map(Number);
  const [endHours, endMinutes] = endTime.split(":").map(Number);
  if (
    [startHours, startMinutes, endHours, endMinutes].some((value) =>
      Number.isNaN(value),
    )
  ) {
    return undefined;
  }
  const startTotal = startHours * 60 + startMinutes;
  const endTotal = endHours * 60 + endMinutes;
  const durationMins = endTotal > startTotal ? endTotal - startTotal : undefined;
  if (!durationMins) return { startTime };
  return { startTime, endTime, durationMins };
}

function formatTimeWindow(startTime?: string, durationMins?: number, endTime?: string) {
  if (!startTime) return "";
  const startMinutes = parseTimeToMinutes(startTime);
  if (startMinutes === null) return "";
  const startLabel = formatMinutesLabel(startMinutes);
  if (!durationMins && !endTime) {
    return ` - ${startLabel}`;
  }
  if (endTime) {
    const endMinutes = parseTimeToMinutes(endTime);
    if (endMinutes === null) return ` - ${startLabel}`;
    return ` - ${startLabel}-${formatMinutesLabel(endMinutes)}`;
  }
  const endLabel = formatMinutesLabel(startMinutes + (durationMins ?? 0));
  return ` - ${startLabel}-${endLabel}`;
}

function computeTimeblockFromTimes(start?: string, end?: string) {
  if (!start || !end) return undefined;
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  if (startMinutes === null || endMinutes === null) return undefined;
  if (endMinutes <= startMinutes) return undefined;
  return endMinutes - startMinutes;
}

function createSeriesId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `series-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
    args.repeatWeekdays.length > 0
      ? new Set(args.repeatWeekdays)
      : new Set<Day>([startDate.getDay() as Day]);
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

function calculateDuration(start: number, end: number) {
  const diff = (end - start + TOTAL_MINUTES) % TOTAL_MINUTES;
  if (diff === 0) return DEFAULT_DURATION;
  return diff;
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function snapToFive(minutes: number) {
  return Math.round(minutes / 5) * 5;
}

function buildArcSegments(start: number, end: number) {
  const diff = (end - start + DIAL_MINUTES) % DIAL_MINUTES;
  if (diff === 0) {
    return [{ start: 0, end: DIAL_MINUTES }];
  }
  if (end >= start) {
    return [{ start, end }];
  }
  return [
    { start, end: DIAL_MINUTES },
    { start: 0, end },
  ];
}

function describeArc(start: number, end: number, radius = CLOCK_RADIUS) {
  const center = CLOCK_SIZE / 2;
  const startAngle = minutesToDegrees(start);
  const endAngle = minutesToDegrees(end);
  const startPoint = polarToCartesian(center, center, radius, startAngle);
  const endPoint = polarToCartesian(center, center, radius, endAngle);
  const sweep = (end - start + DIAL_MINUTES) % DIAL_MINUTES;
  const largeArcFlag = sweep > DIAL_MINUTES / 2 ? 1 : 0;
  const sweepFlag = 1;
  return `M ${startPoint.x} ${startPoint.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${endPoint.x} ${endPoint.y}`;
}

function minutesToDegrees(minutes: number) {
  return ((minutes / DIAL_MINUTES) * 360) - 90;
}

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number,
) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function getHandlePosition(minutes: number) {
  const radius = CLOCK_RADIUS;
  const center = CLOCK_SIZE / 2;
  const angle = minutesToDegrees(minutes % DIAL_MINUTES);
  return polarToCartesian(center, center, radius, angle);
}

function dialMinutesToDayMinutes(dialMinutes: number, currentMinutes: number) {
  const normalizedCurrent =
    ((currentMinutes % TOTAL_MINUTES) + TOTAL_MINUTES) % TOTAL_MINUTES;
  const candidates = [dialMinutes, dialMinutes + DIAL_MINUTES];
  const distances = candidates.map((candidate) => {
    const diff = Math.abs(normalizedCurrent - candidate);
    return Math.min(diff, TOTAL_MINUTES - diff);
  });
  const bestIndex = distances[0] <= distances[1] ? 0 : 1;
  return candidates[bestIndex] % TOTAL_MINUTES;
}

function getDefaultSleepDay() {
  return getDayKey();
}

function buildDayOptions(rangeDays: number) {
  const options: Array<{ value: DayKey; label: string }> = [];
  for (let offset = -1; offset < rangeDays; offset += 1) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const value = getDayKey(date);
    const label = date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    options.push({ value, label });
  }
  return options;
}

type StartTimeOption = {
  value: string;
  label: string;
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
          className="w-full appearance-none rounded-2xl border border-white/15 bg-[#111629] px-4 py-3 text-base font-medium text-white focus:border-cyan-400/60 focus:outline-none sm:text-sm"
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
  onStartTimeChange,
  onEndTimeChange,
  onDurationChange,
  onClear,
}: {
  startTime: string;
  endTime: string;
  timeblock?: Timeblock;
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
            {hasRange ? `${startLabel} to ${endLabel}` : startMinutes !== null ? `Starts ${startLabel}` : "No time selected"}
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
        <TimeInputField label="Start" value={startTime} onChange={onStartTimeChange} />
        <TimeInputField label="End" value={endTime} onChange={onEndTimeChange} />
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

function TimeInputField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-zinc-400">
      <span className="pl-1">{label}</span>
      <input
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/15 bg-[#111629] px-4 py-3 text-base font-medium text-white accent-cyan-300 focus:border-cyan-400/60 focus:outline-none sm:text-sm"
      />
    </label>
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
  icons: Array<{ id: string; label: string; symbol: string }>;
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
    <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-zinc-400">
      <span className="pl-1">Custom emoji</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={4}
        className="rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-base font-medium text-white placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none sm:text-sm"
        placeholder="e.g. food"
      />
    </label>
  );
}

function formatDurationPreset(duration: Timeblock) {
  if (duration < 60) return `${duration}m`;
  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function buildEndTime(start: string, duration?: Timeblock) {
  if (!start || !duration) return "";
  const startMinutes = parseTimeToMinutes(start);
  if (startMinutes === null) return "";
  return minutesToTimeString(startMinutes + duration);
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
  if (hasAny(["coffee", "break", "lunch", "meal", "cook", "dinner", "breakfast"])) {
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
  return { icon: defaultTaskIcon, color: defaultBlockColor };
}

function getTaskIconSymbol(iconId?: string, fallbackText = "") {
  const icon = taskIconOptions.find((option) => option.id === iconId);
  if (icon) return icon.symbol;
  if (iconId) return iconId;
  const trimmed = fallbackText.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "•";
}

function priorityLabel(priority: TodoPriority) {
  switch (priority) {
    case 1:
      return "High priority";
    case 2:
      return "Medium priority";
    default:
      return "Low priority";
  }
}

function stripCommandMetadata(text: string) {
  return text
    .replace(/\b(today|tonight|tomorrow|tmrw|yesterday|last night|next week|this weekend|next weekend)\b/gi, "")
    .replace(/\b(last|this|next)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, "")
    .replace(/\bin\s+\d+\s+(day|days|week|weeks)\b/gi, "")
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, "")
    .replace(/\bfrom\s+[0-9:.,\samp]+\s+to\s+[0-9:.,\samp]+\b/gi, "")
    .replace(/\bat\s+[0-9:.,\samp]+\s+to\s+[0-9:.,\samp]+\b/gi, "")
    .replace(/\b(?:at|around|about|by|for)\s+(1[0-2]|0?[1-9])(?:\s*[:.]\s*|\s+)?([0-5]\d)?\s*(a\.?\s*m\.?|p\.?\s*m\.?)\b/gi, "")
    .replace(/\b(?:at|around|about|by|for)\s+([01]?\d|2[0-3])[:.]([0-5]\d)\b/gi, "")
    .replace(/\b(1[0-2]|0?[1-9])(?:\s*[:.]\s*|\s+)?([0-5]\d)?\s*(a\.?\s*m\.?|p\.?\s*m\.?)\b/gi, "")
    .replace(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/gi, "")
    .replace(/\b(?:at|around|about|by|for)\s+(1[0-2]|0?[1-9])\s*(morning|afternoon|evening|night)\b/gi, "")
    .replace(/\b(?:at|around|about|by|for)\s+(noon|midnight)\b/gi, "")
    .replace(/\b(for)\s+\d+(\.\d+)?\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/gi, "")
    .replace(/\b(priority)\s+(high|medium|low|\d)\b/gi, "")
    .replace(/\b(high|medium|low)\s+priority\b/gi, "")
    .replace(/\bp[1-3]\b/gi, "")
    .replace(/\bquality\s*[1-5]\b/gi, "")
    .replace(/\brecovery\s*[1-5]\b/gi, "")
    .replace(/note[:\-].+$/i, "")
    .replace(/\ba task to\b/gi, "")
    .replace(/\btask to\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}


function extractMeridiem(text: string) {
  const match = text.match(/\b(a\.?\s*m\.?|p\.?\s*m\.?)\b/i);
  if (!match) return undefined;
  return match[1].toLowerCase().replace(/[\s.]/g, "");
}

function smartTitleCase(text: string) {
  const hasUppercase = /[A-Z]/.test(text);
  if (hasUppercase) return text;
  return text
    .split(" ")
    .map((word, index) => {
      const trimmed = word.trim();
      if (!trimmed) return trimmed;
      if (index !== 0 && ["and", "or", "the", "to", "of", "in", "for"].includes(trimmed)) {
        return trimmed;
      }
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
    })
    .join(" ");
}
