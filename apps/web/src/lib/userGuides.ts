export type GuideCategory = "Start here" | "Daily routine" | "Tools and projects" | "Your workspace";

export type GuideStep = {
  id: string;
  title: string;
  body: string;
  compactBody?: string;
  route: string;
  target?: string;
  /** Short pointer beside a real control; the panel carries the explanation. */
  anchor?: { label: string; placement?: "top" | "bottom" };
  /** Optional control group whose interactions count toward this step. */
  interactionTarget?: string;
  /** Opens the actual quick settings controls, including the mobile drawer. */
  shell?: "theme" | "navigation";
  practice?: string;
  /** Short recap shown after the user completes the real action. */
  success?: string;
  event?: "click" | "input" | "change";
};

export type UserGuide = {
  id: string;
  title: string;
  description: string;
  category: GuideCategory;
  minutes: number;
  steps: GuideStep[];
};

export const userGuides: UserGuide[] = [
  {
    "id": "essentials",
    "title": "Guided first day",
    "description": "A guided first day: learn every core control, practice safely, and understand what each signal becomes.",
    "category": "Start here",
    "minutes": 11,
    "steps": [
      {
        "id": "theme-start",
        "title": "First, make it feel like yours",
        "body": "Quick settings changes the whole app instantly. Mode controls brightness and contrast; it does not change your data. You can return here whenever your environment or eyesight needs something different.",
        "compactBody": "Quick settings lives inside More. Mode controls brightness and contrast without changing your data.",
        "route": "/v2",
        "target": "[data-guide=\"quick-theme-mode\"]",
        "interactionTarget": "[data-guide=\"quick-theme-mode\"] button",
        "anchor": { "label": "Choose Light, Dark, or High Contrast.", "placement": "top" },
        "success": "You changed the display mode. This setting follows you through Jarvis, and you can change it again from Quick settings at any time.",
        "event": "click",
        "shell": "theme"
      },
      {
        "id": "theme-palette",
        "title": "Give the interface your color",
        "body": "Palette controls the accent color used for highlights, progress, and active controls. It works together with the brightness mode you just chose.",
        "route": "/v2",
        "target": "[data-guide=\"quick-theme-palette\"]",
        "interactionTarget": "[data-guide=\"quick-theme-palette\"] button",
        "anchor": { "label": "Try one palette and watch the highlights change.", "placement": "top" },
        "success": "Mode controls brightness; palette controls color. Together they define how Jarvis looks without affecting how anything works.",
        "event": "click",
        "shell": "theme"
      },
      {
        "id": "theme-collapse",
        "title": "Learn the real navigation",
        "body": "The sidebar is the map for the whole app. On desktop, collapse it when you want more space and use Nav to bring it back. On mobile, More opens this same list of pages.",
        "compactBody": "More opens the full Jarvis page list. Closing it returns you to the page; the bottom bar keeps your most-used areas nearby.",
        "route": "/v2",
        "target": "button[aria-label=\"Collapse sidebar\"], [data-sidebar-close]",
        "interactionTarget": "button[aria-label=\"Collapse sidebar\"], [data-sidebar-close]",
        "anchor": { "label": "Collapse the sidebar or close the More menu.", "placement": "bottom" },
        "success": "You used the actual navigation control. Use Nav on desktop or More on mobile whenever you need the full page list again.",
        "event": "click",
        "shell": "navigation"
      },
      {
        "id": "home-overview",
        "title": "Read Home as a command center",
        "body": "Home is a quick remote, not another form to maintain. Recommended points to the next useful action, while the shortcuts take you directly to the daily tools. The detailed dashboard is there when you want more context.",
        "compactBody": "Home is a quick remote. Recommended suggests the next useful action, and the shortcuts jump directly to daily tools.",
        "route": "/v2",
        "target": "[data-guide=\"home-remote\"], [data-guide=\"home-command\"]",
        "anchor": { "label": "Home summarizes what may need attention next.", "placement": "bottom" }
      },
      {
        "id": "must-win-start",
        "title": "Give today one finish line",
        "body": "Must Win is the single result that would make the day count. A concrete result such as ‘Send the proposal’ is easier to finish than a broad intention such as ‘Work on sales.’ This field saves when you leave it; use the demo walkthrough when you only want to practice.",
        "route": "/v2/must-win",
        "target": "[data-guide=\"must-win-input\"]",
        "anchor": { "label": "Type one concrete result for today." },
        "success": "That sentence is your day’s finish line. Jarvis can now show it beside the rest of your plan so urgent work does not bury the outcome that matters most.",
        "event": "input"
      },
      {
        "id": "todos-start",
        "title": "Open Plan for everything else",
        "body": "Plan holds tasks and time blocks around your Must Win. Mind Sweep is for things you have captured but have not scheduled. The plus button opens the full task editor.",
        "compactBody": "Plan holds everything around your Must Win. The plus button opens the full task editor.",
        "route": "/v2/daily",
        "target": "[data-guide=\"plan-add\"]",
        "anchor": { "label": "Open the task editor with the plus button.", "placement": "top" },
        "success": "You opened the editor. Opening it creates nothing yet; the next step shows what is inside and how to leave safely.",
        "event": "click"
      },
      {
        "id": "todos-basics",
        "title": "Start with a name you can finish",
        "body": "The task name is the only essential field. Write it as a visible action such as ‘Email the revised quote’ instead of a broad category such as ‘Sales.’ You can reuse a recent task when the work repeats.",
        "compactBody": "The name is the only essential field. Use a visible action so you know exactly what finished means.",
        "route": "/v2/daily",
        "target": "[data-guide=\"task-basics\"] input",
        "anchor": { "label": "A clear action belongs in the name field." }
      },
      {
        "id": "todos-schedule",
        "title": "Schedule only when timing helps",
        "body": "Date chooses the day. Start, end, and duration turn the task into a time block. Leaving time empty keeps it in Mind Sweep, while priority and repeat rules help when the work truly needs them.",
        "compactBody": "Date chooses the day. Time creates a scheduled block; leaving it empty keeps the task in Mind Sweep.",
        "route": "/v2/daily",
        "target": "[data-guide=\"task-schedule-label\"]",
        "anchor": { "label": "Schedule is optional; Mind Sweep can hold the task first." }
      },
      {
        "id": "todos-style",
        "title": "Use style as a scanning aid",
        "body": "Color and icon help you recognize categories quickly on a busy day. They are visual aids, not required metadata, so keep the defaults when styling would slow you down.",
        "route": "/v2/daily",
        "target": "[data-guide=\"task-style-label\"]",
        "anchor": { "label": "Color and icon are optional visual shortcuts." }
      },
      {
        "id": "todos-save",
        "title": "Know exactly when a task is created",
        "body": "Nothing in this editor is created until you choose Add task. That lets you inspect or abandon a draft safely. For this walkthrough, continue to the Close step without saving.",
        "route": "/v2/daily",
        "target": "[data-guide=\"task-save\"]",
        "anchor": { "label": "Add task is the save point." }
      },
      {
        "id": "todos-editor",
        "title": "See what makes a task actionable",
        "body": "A task needs a clear name. Date, time, duration, priority, repeat rules, color, and icon are optional tools for planning it. Add task saves it; Close leaves without creating anything.",
        "compactBody": "Name is the only essential field. Scheduling and styling are optional. Close leaves without saving.",
        "route": "/v2/daily",
        "target": "button[aria-label=\"Close task editor\"]",
        "interactionTarget": "button[aria-label=\"Close task editor\"]",
        "anchor": { "label": "Close this practice editor without saving." },
        "success": "You left the editor without creating a task. When you do want to keep one, enter a name and choose Add task.",
        "event": "click"
      },
      {
        "id": "habits-start",
        "title": "Use Habits for repeated behavior",
        "body": "Tasks are finished once; habits are behaviors you want to repeat and measure over time. Add habit opens the setup for a small routine.",
        "route": "/v2/habits",
        "target": "button[aria-label=\"Add habit\"]",
        "anchor": { "label": "Open Add habit to see the setup." },
        "success": "You opened the habit setup. The next step explains the choices before you decide whether to save anything.",
        "event": "click"
      },
      {
        "id": "habits-name",
        "title": "Name a behavior, not an ambition",
        "body": "A useful habit describes something observable: ‘Read 10 pages’ is easier to track than ‘Become a reader.’ The icon and group help organize the list but do not change the tracking.",
        "compactBody": "Name one observable behavior. Icon and group only help organize the list.",
        "route": "/v2/habits",
        "target": "[data-guide=\"habit-name\"] input",
        "anchor": { "label": "Use a small behavior you can clearly mark Yes or No." }
      },
      {
        "id": "habits-direction",
        "title": "Choose Build or Quit",
        "body": "Build tracks a behavior you want to repeat. Quit tracks a behavior you want to avoid. Both use the same daily Yes, No, and Skip history, but the direction keeps the goal easy to understand.",
        "compactBody": "Build means repeat it; Quit means avoid it. Both create the same daily check-in history.",
        "route": "/v2/habits",
        "target": "[data-guide=\"habit-intent\"]",
        "anchor": { "label": "Direction explains what success means for this habit." }
      },
      {
        "id": "habits-save",
        "title": "Saving creates the habit chain",
        "body": "Add creates the habit and places it in the tracker. You can edit or archive it later. Continue without saving this practice draft; the next step shows how Close behaves.",
        "route": "/v2/habits",
        "target": "[data-guide=\"habit-save\"]",
        "anchor": { "label": "Add is the save point for a new habit." }
      },
      {
        "id": "habits-editor",
        "title": "Make the behavior easy to repeat",
        "body": "Give the habit a short name, then choose Build for something you want to do or Quit for something you are avoiding. Groups and icons make a longer list easier to scan.",
        "compactBody": "Use Build for something to repeat and Quit for something to avoid. A short, specific name is easiest to track.",
        "route": "/v2/habits",
        "target": "button[aria-label=\"Close habit editor\"]",
        "interactionTarget": "button[aria-label=\"Close habit editor\"]",
        "anchor": { "label": "Close this practice editor without saving." },
        "success": "You now know how habit setup works. Saving creates the chain; closing lets you inspect it without adding anything.",
        "event": "click"
      },
      {
        "id": "habits-tracking",
        "title": "Mark the selected day deliberately",
        "body": "The selected day controls which check-in you update. Yes records completion, No records a miss, and Skip stays neutral. Future days cannot be marked, and an untouched past day remains unlogged rather than silently becoming No.",
        "compactBody": "Select the day first. Yes completes it, No records a miss, and Skip stays neutral.",
        "route": "/v2/habits",
        "target": "[data-guide=\"habit-actions\"], .jarvis-page-viewport",
        "anchor": { "label": "Day selection and status buttons build the history." }
      },
      {
        "id": "sleep-window",
        "title": "Set the night before rating it",
        "body": "The sleep clock defines bedtime and wake time, including windows that cross midnight. Check the date and duration label so the entry lands on the night you mean to record.",
        "compactBody": "Set bedtime and wake time, then check the date and duration—especially across midnight.",
        "route": "/v2/sleep",
        "target": "[data-guide=\"sleep-clock\"]",
        "anchor": { "label": "The clock sets the sleep window." }
      },
      {
        "id": "sleep-start",
        "title": "Turn sleep into a useful signal",
        "body": "Sleep combines the time window with how the night felt. Quality is your personal rating, so consistency matters more than choosing a ‘correct’ number.",
        "route": "/v2/sleep",
        "target": "[data-guide=\"sleep-quality\"] input",
        "anchor": { "label": "Move the quality slider once." },
        "success": "The quality rating adds context that hours alone cannot show. Over time, Review can compare this signal with mood and completion.",
        "event": "input"
      },
      {
        "id": "sleep-context",
        "title": "Add only the sleep context you will use",
        "body": "Recovery is a second personal rating for how restored you feel. Dreams and notes are optional places for details such as interruptions, exercise, illness, or anything you may want to compare later.",
        "compactBody": "Recovery rates how restored you feel. Dreams and notes are optional context for later review.",
        "route": "/v2/sleep",
        "target": "[data-guide=\"sleep-notes\"]",
        "anchor": { "label": "Context is optional; the time window and ratings are enough." }
      },
      {
        "id": "sleep-save",
        "title": "Know when a sleep entry is saved",
        "body": "The editor is only a draft until you choose Log sleep. Check the date and time window before saving, especially when sleep crosses midnight. You do not need to save during this tour.",
        "route": "/v2/sleep",
        "target": "[data-guide=\"sleep-save\"]",
        "anchor": { "label": "Log sleep is the save point." }
      },
      {
        "id": "mood-start",
        "title": "Add context with a quick mood check-in",
        "body": "Mood is a snapshot from 1 to 10, not a grade to maximize. A fast honest number is useful; notes and tags are optional when context would help later.",
        "route": "/v2/mood",
        "target": "[data-guide=\"mood-score\"]",
        "anchor": { "label": "Move the mood slider once." },
        "success": "You created the core of a mood check-in. A few honest entries give Review context for the rest of your daily data.",
        "event": "input"
      },
      {
        "id": "mood-context-open",
        "title": "Open context only when it adds meaning",
        "body": "Tags make repeated influences easy to compare, while the note captures what is unique about this moment. A score by itself is still a complete quick check-in.",
        "route": "/v2/mood",
        "target": "[data-guide=\"mood-context\"]",
        "interactionTarget": "[data-guide=\"mood-context\"]",
        "anchor": { "label": "Open Add context to reveal the optional fields." },
        "success": "You opened the optional context fields. Use them when a tag or short note will help your future self understand the number.",
        "event": "click"
      },
      {
        "id": "mood-context-fields",
        "title": "Keep context short and reusable",
        "body": "A custom tag is useful for a repeated factor such as travel, exercise, or illness. The note answers ‘what is shaping this mood?’ in your own words. Neither field is required.",
        "route": "/v2/mood",
        "target": "[data-guide=\"mood-context-fields\"]",
        "anchor": { "label": "Tags repeat; notes explain this particular check-in." }
      },
      {
        "id": "mood-save",
        "title": "Save only when the check-in is ready",
        "body": "Log mood is the save point. Add context can attach a note or reusable tags, but the score alone is enough when you want a fast check-in. You do not need to save during this tour.",
        "route": "/v2/mood",
        "target": "[data-guide=\"mood-save\"]",
        "anchor": { "label": "Log mood saves the check-in." }
      },
      {
        "id": "review-day-summary",
        "title": "Begin with the facts of the day",
        "body": "The daily summary counts planned tasks, habits, mood, and sleep for the selected date. Missing data stays missing instead of being treated as failure, so the overview remains honest.",
        "compactBody": "The cards summarize the selected day. Missing entries stay missing instead of counting against you.",
        "route": "/v2/review",
        "target": "[data-guide=\"daily-summary\"]",
        "anchor": { "label": "These cards answer what was actually logged." }
      },
      {
        "id": "review-day-insights",
        "title": "Turn the facts into a useful prompt",
        "body": "Daily insights call out completion, missing signals, and a practical next move. Treat them as prompts for reflection rather than judgments about whether the day was good or bad.",
        "compactBody": "Insights suggest what deserves attention; they do not grade the day.",
        "route": "/v2/review",
        "target": "[data-guide=\"daily-insights\"], [data-guide=\"review-insights\"]",
        "anchor": { "label": "Insights translate the logged facts into questions." }
      },
      {
        "id": "review-expectation",
        "title": "Compare the plan with what actually happened",
        "body": "Start by answering whether the day mostly matched what you expected. If it did not, an optional reason helps name the constraint without turning the review into self-criticism.",
        "compactBody": "Say whether the day matched expectations. If it did not, the optional reason names the constraint.",
        "route": "/v2/review",
        "target": "[data-guide=\"review-expectation\"]",
        "anchor": { "label": "Begin with an honest Yes, mostly or Not quite." }
      },
      {
        "id": "review-tomorrow",
        "title": "Carry one small lesson into tomorrow",
        "body": "The tomorrow note should be a useful adjustment such as protecting a focus block or starting earlier. Keep it smaller than a task list so it can guide tomorrow instead of overwhelming it.",
        "compactBody": "Carry forward one small adjustment, not another full task list.",
        "route": "/v2/review",
        "target": "[data-guide=\"review-tomorrow\"]",
        "anchor": { "label": "Write the smallest change that could help tomorrow." }
      },
      {
        "id": "review-save",
        "title": "Save the reflection without changing the logs",
        "body": "Save daily review stores your answer and tomorrow note. It does not rewrite tasks, habits, mood, or sleep; those logs remain their own source of truth.",
        "compactBody": "Save daily review stores the reflection. Your existing daily logs stay unchanged.",
        "route": "/v2/review",
        "target": "[data-guide=\"review-save\"]",
        "anchor": { "label": "This button saves only the reflection." }
      },
      {
        "id": "review-start",
        "title": "Look for patterns only after repetition",
        "body": "Weekly summaries compare sleep, mood, task completion, Must Wins, and review history. A relationship can suggest a question, but it does not prove that one factor caused another. More consistent check-ins make the view more useful.",
        "compactBody": "Weekly patterns become useful after repeated check-ins. Use relationships as questions, not proof of cause.",
        "route": "/v2/review",
        "target": "[data-guide=\"review-summary\"], [data-guide=\"review-insights\"]",
        "anchor": { "label": "Repeated daily entries build the longer-term view.", "placement": "top" }
      }
    ]
  },
  {
    "id": "full-tour",
    "title": "Explore the whole app",
    "description": "A short introduction to every page. Pause and resume whenever you like.",
    "category": "Start here",
    "minutes": 6,
    "steps": [
      {
        "id": "home-intro",
        "title": "Your everyday shortcuts",
        "body": "Home is your starting point. Use the sidebar to open Plan, Assistant, and the daily check-ins. The guide stays with you as you move between pages.",
        "route": "/v2",
        "target": ".jarvis-desktop-sidebar, .jarvis-mobile-nav",
        "compactBody": "The bottom bar keeps Home, Plan, Assistant, and Finance close. More opens every other page. You can return to this guide at any time."
      },
      {
        "id": "plan-intro",
        "title": "Capture before scheduling",
        "body": "Mind Sweep holds tasks that do not have a time yet. Add a short action, then use Schedule when you are ready to give it a slot. On desktop, use New to create either an unscheduled task or a time block.",
        "route": "/v2/daily?mode=backlog",
        "target": "[data-guide=\"plan-capture\"], [data-guide=\"plan-add\"]",
        "practice": "Try typing one small task, or open New.",
        "event": "input"
      },
      {
        "id": "must-win-intro",
        "title": "Choose one outcome",
        "body": "A Must Win is one result that would make today count. Make it specific: “Send the proposal by 3 PM” is easier to finish than “Work on sales.” Edits save when you leave the form or lock the win. Use demo mode if you want to practice.",
        "route": "/v2/must-win",
        "target": "[data-guide=\"must-win-input\"]",
        "practice": "Try writing a clear finish line.",
        "event": "input"
      },
      {
        "id": "mood-intro",
        "title": "Start with how you feel",
        "body": "Move the slider from 1 to 10 to match right now. It is a personal check-in, not a score you need to maximize. Nothing is saved until you choose Log mood.",
        "route": "/v2/mood",
        "target": "[data-guide=\"mood-score\"]",
        "practice": "Move the slider to try a different score.",
        "event": "input"
      },
      {
        "id": "habits-intro",
        "title": "Make the habit small enough to repeat",
        "body": "A chain is a habit tracked over time. Add one clear behavior, choose its schedule, and start with something you can do consistently.",
        "route": "/v2/habits",
        "target": "button[aria-label=\"Add habit\"]",
        "practice": "Open Add habit, then close the editor after looking.",
        "event": "click"
      },
      {
        "id": "journal-intro",
        "title": "Write for the right day",
        "body": "Choose a day on the calendar, then use the entry form. The calendar markers show days with saved entries. Today is a useful default, but you can return to a previous day.",
        "route": "/v2/journal",
        "target": "[data-guide=\"journal-calendar\"]"
      },
      {
        "id": "sleep-intro",
        "title": "Start with the sleep window",
        "body": "Set bedtime and wake time in the night editor. Check the date and displayed duration, especially when the window crosses midnight. You can load a previous day to correct it.",
        "route": "/v2/sleep",
        "target": "[data-guide=\"sleep-editor\"]"
      },
      {
        "id": "review-intro",
        "title": "Review before making a bigger plan",
        "body": "Use the daily reflection to record whether the day went as expected and what tomorrow needs. Start here even if you have only a little data.",
        "route": "/v2/review",
        "target": "[data-guide=\"review-form\"]"
      },
      {
        "id": "assistant-intro",
        "title": "Start with a concrete request",
        "body": "Try “Add a task to prepare tomorrow’s meeting” or “Log my mood as 7.” You can also ask for help planning. Type a request first; Send is a separate action.",
        "route": "/v2/assistant",
        "target": "[data-guide=\"assistant-input\"]",
        "practice": "Draft a request in the message box.",
        "event": "input"
      },
      {
        "id": "finance-intro",
        "title": "Start with the snapshot",
        "body": "The summary shows balances and recent activity from available finance data. Demo mode uses generated finance data. In your own workspace, Accounts is where setup and account management live.",
        "route": "/v2/finance",
        "target": "[data-guide=\"section-navigation\"], [data-guide=\"finance-overview\"]",
        "compactBody": "Snapshot is the quick overview. Spending, Accounts, Activity, and Invest each open one focused view. Swipe the section bar sideways if a tab is out of view."
      },
      {
        "id": "real-estate-intro",
        "title": "Start with the lead list",
        "body": "Leads ranks the available properties. Open a property’s analysis to see the assumptions behind its score. The page identifies whether its listings are demo or live.",
        "route": "/v2/real-estate",
        "target": "[data-guide=\"section-navigation\"], [data-guide=\"property-leads\"]",
        "compactBody": "Leads, Filters, Analysis, and Map are separate views on this screen. The section bar changes the view; it does not run a new search."
      },
      {
        "id": "objectives-intro",
        "title": "Start with the outcome",
        "body": "An objective holds an outcome, an area, and a next action. Its projects break the work into smaller pieces. Keep today’s scheduled tasks in Plan and the bigger direction here.",
        "route": "/v2/objectives",
        "target": "[data-guide=\"section-navigation\"], [data-guide=\"objective-form\"]"
      },
      {
        "id": "homelab-intro",
        "title": "Read the overview first",
        "body": "The overview summarizes available system health. Check freshness and connection status before relying on a reading. Demo mode shows generated system data.",
        "route": "/v2/homelab",
        "target": "[data-guide=\"section-navigation\"], [data-guide=\"homelab-overview\"]"
      },
      {
        "id": "documentation-intro",
        "title": "Search by the thing you need",
        "body": "Search the available homelab documents by a service, system, or topic. If no documents are available, the server documentation source may need configuring.",
        "route": "/v2/documentation",
        "target": "[data-guide=\"docs-search\"]",
        "practice": "Try a topic in Search docs. Submit when ready.",
        "event": "input"
      },
      {
        "id": "settings-intro",
        "title": "Choose a workspace deliberately",
        "body": "Demo uses sample planning, finance, and monitoring data. Return to real data restores your personal workspace. Account settings and external services still apply to your actual account.",
        "route": "/v2/settings",
        "target": "[data-guide=\"demo-controls\"]"
      },
      {
        "id": "account-intro",
        "title": "Keep account actions intentional",
        "body": "Profile shows the signed-in account and its available account actions. These controls affect your actual account, including while demo data is showing.",
        "route": "/v2/account",
        "target": "[data-guide=\"section-navigation\"], [data-guide=\"account-profile\"]"
      }
    ]
  },
  {
    "id": "home",
    "title": "Find your way",
    "description": "Know where to go, and how to come back.",
    "category": "Start here",
    "minutes": 1,
    "steps": [
      {
        "id": "navigation",
        "title": "Your everyday shortcuts",
        "body": "Home is your starting point. Use the sidebar to open Plan, Assistant, and the daily check-ins. The guide stays with you as you move between pages.",
        "route": "/v2",
        "target": ".jarvis-desktop-sidebar, .jarvis-mobile-nav",
        "compactBody": "The bottom bar keeps Home, Plan, Assistant, and Finance close. More opens every other page. You can return to this guide at any time."
      },
      {
        "id": "next",
        "title": "Start with one useful action",
        "body": "Open a recommendation or choose a page for what you need right now. You do not need to fill out every part of Jarvis each day.",
        "route": "/v2",
        "target": ".jarvis-page-viewport"
      }
    ]
  },
  {
    "id": "plan",
    "title": "Capture and schedule",
    "description": "Turn a loose task into a realistic plan.",
    "category": "Daily routine",
    "minutes": 2,
    "steps": [
      {
        "id": "capture",
        "title": "Capture before scheduling",
        "body": "Mind Sweep holds tasks that do not have a time yet. Add a short action, then use Schedule when you are ready to give it a slot. On desktop, use New to create either an unscheduled task or a time block.",
        "route": "/v2/daily?mode=backlog",
        "target": "[data-guide=\"plan-capture\"], [data-guide=\"plan-add\"]",
        "practice": "Try typing one small task, or open New.",
        "event": "input"
      },
      {
        "id": "add",
        "title": "Open the task editor",
        "body": "The plus button opens the same editor as New. Choose a name, day, start time, and duration. Leaving the time clear keeps the task unscheduled.",
        "route": "/v2/daily",
        "target": "[data-guide=\"plan-add\"]",
        "practice": "Open the editor to see the choices.",
        "event": "click"
      },
      {
        "id": "editor-close",
        "title": "You stay in control of what gets saved",
        "body": "The editor lets you name the task, schedule it, set priority, and choose its style. Close it now without saving; use Add task when you want to keep a real entry.",
        "route": "/v2/daily",
        "target": "button[aria-label=\"Close task editor\"]",
        "interactionTarget": "button[aria-label=\"Close task editor\"]",
        "practice": "Choose Close. Nothing will be saved.",
        "event": "click"
      },
      {
        "id": "day",
        "title": "Plan a day you can finish",
        "body": "Check the selected date before adding work. Open an existing task to edit it, mark it done after finishing, and leave room between time blocks. Desktop also supports dragging and resizing scheduled blocks.",
        "route": "/v2/daily",
        "target": "[data-guide=\"plan-days\"]"
      }
    ]
  },
  {
    "id": "must-win",
    "title": "Choose your Must Win",
    "description": "Give the day one clear finish line.",
    "category": "Daily routine",
    "minutes": 1,
    "steps": [
      {
        "id": "define",
        "title": "Choose one outcome",
        "body": "A Must Win is one result that would make today count. Make it specific: “Send the proposal by 3 PM” is easier to finish than “Work on sales.” Edits save when you leave the form or lock the win. Use demo mode if you want to practice.",
        "route": "/v2/must-win",
        "target": "[data-guide=\"must-win-input\"]",
        "practice": "Try writing a clear finish line.",
        "event": "input"
      },
      {
        "id": "finish",
        "title": "Close the loop",
        "body": "Your current win appears on this page and in the planner. Mark it won when the result is achieved. The open-task list can help you choose a next action that supports it.",
        "route": "/v2/must-win",
        "target": "[data-guide=\"must-win-current\"]"
      }
    ]
  },
  {
    "id": "mood",
    "title": "Log a mood check-in",
    "description": "Record a signal without overthinking it.",
    "category": "Daily routine",
    "minutes": 1,
    "steps": [
      {
        "id": "score",
        "title": "Start with how you feel",
        "body": "Move the slider from 1 to 10 to match right now. It is a personal check-in, not a score you need to maximize. Nothing is saved until you choose Log mood.",
        "route": "/v2/mood",
        "target": "[data-guide=\"mood-score\"]",
        "practice": "Move the slider to try a different score.",
        "event": "input"
      },
      {
        "id": "context",
        "title": "Add only the context you need",
        "body": "Manage tags creates your own reusable labels. Add context holds an optional note and custom tag. A score alone is enough when you are in a hurry.",
        "route": "/v2/mood",
        "target": "[data-guide=\"mood-context\"]",
        "practice": "Open Add context to see the optional fields.",
        "event": "click"
      },
      {
        "id": "history",
        "title": "Keep your record accurate",
        "body": "Log mood saves the check-in. The mood log below lets you review, edit, or delete a saved entry. You can log more than once in a day.",
        "route": "/v2/mood",
        "target": "[data-guide=\"mood-history\"]"
      }
    ]
  },
  {
    "id": "habits",
    "title": "Build a habit chain",
    "description": "Track repetition without losing the day.",
    "category": "Daily routine",
    "minutes": 1,
    "steps": [
      {
        "id": "chain",
        "title": "Make the habit small enough to repeat",
        "body": "A chain is a habit tracked over time. Add one clear behavior and start with something you can do consistently.",
        "route": "/v2/habits",
        "target": "button[aria-label=\"Add habit\"]",
        "practice": "Open Add habit to see the simple setup.",
        "event": "click"
      },
      {
        "id": "editor-close",
        "title": "Name the behavior, then choose its direction",
        "body": "Give the habit a short name, icon, and group. Build tracks something you want to repeat; Quit tracks something you are avoiding. Close this practice editor without saving.",
        "route": "/v2/habits",
        "target": "button[aria-label=\"Close habit editor\"]",
        "interactionTarget": "button[aria-label=\"Close habit editor\"]",
        "practice": "Choose Close. Nothing will be saved.",
        "event": "click"
      },
      {
        "id": "mark",
        "title": "Check the day before marking it",
        "body": "Select the day you mean to update, then choose Yes, No, or Skip. Skip stays neutral; an empty day stays open instead of counting as missed.",
        "route": "/v2/habits",
        "target": "[data-guide=\"habit-actions\"] button",
        "interactionTarget": "[data-guide=\"habit-actions\"] button",
        "practice": "Use one status button to see the check-in update.",
        "event": "click"
      }
    ]
  },
  {
    "id": "journal",
    "title": "Write a quick journal entry",
    "description": "Keep useful context for your future self.",
    "category": "Daily routine",
    "minutes": 1,
    "steps": [
      {
        "id": "date",
        "title": "Write for the right day",
        "body": "Choose a day on the calendar, then use the entry form. The calendar markers show days with saved entries. Today is a useful default, but you can return to a previous day.",
        "route": "/v2/journal",
        "target": "[data-guide=\"journal-calendar\"]"
      },
      {
        "id": "write",
        "title": "A few sentences are enough",
        "body": "Choose a prompt and write what happened, what matters, or what you want to remember. Save the entry when you are ready; existing entries can be edited from the list.",
        "route": "/v2/journal",
        "target": "[data-guide=\"journal-input\"]",
        "practice": "Try a short note. Save only if you want to keep it.",
        "event": "input"
      }
    ]
  },
  {
    "id": "sleep",
    "title": "Record a night of sleep",
    "description": "Track the window and how it felt.",
    "category": "Daily routine",
    "minutes": 1,
    "steps": [
      {
        "id": "window",
        "title": "Start with the sleep window",
        "body": "Set bedtime and wake time in the night editor. Check the date and displayed duration, especially when the window crosses midnight. You can load a previous day to correct it.",
        "route": "/v2/sleep",
        "target": "[data-guide=\"sleep-editor\"]"
      },
      {
        "id": "quality",
        "title": "Add quality, then save",
        "body": "Choose how the night felt and add notes if useful. Save the night to update recent nights and rest metrics. These summaries reflect what you log.",
        "route": "/v2/sleep",
        "target": "[data-guide=\"sleep-save\"]"
      }
    ]
  },
  {
    "id": "review",
    "title": "Close the day and reset",
    "description": "Turn your logs into one useful adjustment.",
    "category": "Daily routine",
    "minutes": 2,
    "steps": [
      {
        "id": "reflect",
        "title": "Review before making a bigger plan",
        "body": "Use the daily reflection to record whether the day went as expected and what tomorrow needs. Start here even if you have only a little data.",
        "route": "/v2/review",
        "target": "[data-guide=\"review-form\"]"
      },
      {
        "id": "reset",
        "title": "Choose one change for next week",
        "body": "Write one thing to stop, one thing to double down on, and one experiment. Save the review to keep that decision. A small change is easier to carry into the planner.",
        "route": "/v2/review",
        "target": "textarea[placeholder=\"One experiment for next week.\"]",
        "practice": "Draft a small experiment you can actually try.",
        "event": "input"
      },
      {
        "id": "patterns",
        "title": "Read patterns after you have a history",
        "body": "Insights summarize your logged mood, sleep, tasks, and reviews. Empty charts mean more entries are needed. Use patterns as prompts for reflection, not proof that one thing caused another.",
        "route": "/v2/review",
        "target": "[data-guide=\"review-insights\"], [data-guide=\"review-summary\"]",
        "practice": "On a small screen, open View insights.",
        "event": "click"
      }
    ]
  },
  {
    "id": "assistant",
    "title": "Ask Jarvis and review actions",
    "description": "Use plain language, then check the details.",
    "category": "Start here",
    "minutes": 2,
    "steps": [
      {
        "id": "ask",
        "title": "Start with a concrete request",
        "body": "Try “Add a task to prepare tomorrow’s meeting” or “Log my mood as 7.” You can also ask for help planning. Type a request first; Send is a separate action.",
        "route": "/v2/assistant",
        "target": "[data-guide=\"assistant-input\"]",
        "practice": "Draft a request in the message box.",
        "event": "input"
      },
      {
        "id": "confirm",
        "title": "Review before saving an action",
        "body": "When Jarvis prepares a change, the confirmation form lets you check the date, wording, and other fields. Confirm only the action you want, or cancel and rephrase.",
        "route": "/v2/assistant",
        "target": ".assistant-composer-shell, [data-guide=\"assistant-input\"]"
      },
      {
        "id": "conversations",
        "title": "Keep different topics organized",
        "body": "Use conversations and project topics to keep context together. Voice capture is optional and asks for microphone access when you choose it. Your typed message works without it.",
        "route": "/v2/assistant",
        "target": "[data-guide=\"assistant-conversations\"], .assistant-conversation-rail"
      }
    ]
  },
  {
    "id": "finance",
    "title": "Read your financial picture",
    "description": "Move from summary to the details that matter.",
    "category": "Tools and projects",
    "minutes": 2,
    "steps": [
      {
        "id": "snapshot",
        "title": "Start with the snapshot",
        "body": "The summary shows balances and recent activity from available finance data. Demo mode uses generated finance data. In your own workspace, Accounts is where setup and account management live.",
        "route": "/v2/finance",
        "target": "[data-guide=\"section-navigation\"], [data-guide=\"finance-overview\"]",
        "compactBody": "Snapshot is the quick overview. Spending, Accounts, Activity, and Invest each open one focused view. Swipe the section bar sideways if a tab is out of view."
      },
      {
        "id": "spending",
        "title": "Follow the money into a detail view",
        "body": "Spending breaks down outflows. Activity lists recent transactions and review items. Check the time range and pending setting before comparing totals. On desktop, these panels are visible together.",
        "route": "/v2/finance",
        "target": "[data-guide-section=\"spending\"], [data-guide=\"finance-spending\"]",
        "practice": "On a small screen, open Spending.",
        "event": "click"
      },
      {
        "id": "accounts",
        "title": "Connect only when you are ready",
        "body": "Accounts contains connection and sync controls. Invest shows holdings when that data is available. You can learn the screens in demo mode without connecting a bank.",
        "route": "/v2/finance",
        "target": "[data-guide-section=\"accounts\"], [data-guide=\"finance-accounts\"]",
        "practice": "On a small screen, open Accounts.",
        "event": "click"
      }
    ]
  },
  {
    "id": "real-estate",
    "title": "Explore a property deal",
    "description": "Compare leads before trusting the headline price.",
    "category": "Tools and projects",
    "minutes": 2,
    "steps": [
      {
        "id": "leads",
        "title": "Start with the lead list",
        "body": "Leads ranks the available properties. Open a property’s analysis to see the assumptions behind its score. The page identifies whether its listings are demo or live.",
        "route": "/v2/real-estate",
        "target": "[data-guide=\"section-navigation\"], [data-guide=\"property-leads\"]",
        "compactBody": "Leads, Filters, Analysis, and Map are separate views on this screen. The section bar changes the view; it does not run a new search."
      },
      {
        "id": "filters",
        "title": "Narrow the search deliberately",
        "body": "Filters adjusts the search criteria. Review location, price, units, and buying power before running a scan. Live scans depend on the configured provider and its available quota.",
        "route": "/v2/real-estate",
        "target": "[data-guide-section=\"filters\"], [data-guide=\"property-filters\"]",
        "practice": "On a small screen, open Filters.",
        "event": "click"
      },
      {
        "id": "analysis",
        "title": "Check the assumptions",
        "body": "Analysis estimates financing, cash needed, and cash flow for the selected property. Edit assumptions to compare scenarios. Map is useful for location context; these estimates are not a verified property valuation.",
        "route": "/v2/real-estate",
        "target": "[data-guide-section=\"analysis\"], [data-guide=\"property-analysis\"]",
        "practice": "On a small screen, open Analysis.",
        "event": "click"
      }
    ]
  },
  {
    "id": "objectives",
    "title": "Connect projects to an objective",
    "description": "Give longer work a next action.",
    "category": "Tools and projects",
    "minutes": 1,
    "steps": [
      {
        "id": "overview",
        "title": "Start with the outcome",
        "body": "An objective holds an outcome, an area, and a next action. Its projects break the work into smaller pieces. Keep today’s scheduled tasks in Plan and the bigger direction here.",
        "route": "/v2/objectives",
        "target": "[data-guide=\"section-navigation\"], [data-guide=\"objective-form\"]"
      },
      {
        "id": "create",
        "title": "Add an objective you can act on",
        "body": "Use New to enter a title, area, target, and next action. After creating it, add projects or milestones. Start with one objective you want to move forward this week.",
        "route": "/v2/objectives",
        "target": "[data-guide-section=\"new\"], [data-guide=\"objective-form\"]",
        "practice": "On a small screen, open New.",
        "event": "click"
      }
    ]
  },
  {
    "id": "homelab",
    "title": "Understand system status",
    "description": "Find a service and check its current state.",
    "category": "Tools and projects",
    "minutes": 1,
    "steps": [
      {
        "id": "health",
        "title": "Read the overview first",
        "body": "The overview summarizes available system health. Check freshness and connection status before relying on a reading. Demo mode shows generated system data.",
        "route": "/v2/homelab",
        "target": "[data-guide=\"section-navigation\"], [data-guide=\"homelab-overview\"]"
      },
      {
        "id": "services",
        "title": "Find the service you need",
        "body": "Services lists managed services and their status. Live metrics shows monitoring detail where configured. Opening an external service takes you to that service’s own interface.",
        "route": "/v2/homelab",
        "target": "[data-guide-section=\"services\"], [data-guide=\"homelab-services\"]",
        "practice": "On a small screen, open Services.",
        "event": "click"
      }
    ]
  },
  {
    "id": "documentation",
    "title": "Find a procedure",
    "description": "Search the docs before guessing a system change.",
    "category": "Tools and projects",
    "minutes": 1,
    "steps": [
      {
        "id": "search",
        "title": "Search by the thing you need",
        "body": "Search the available homelab documents by a service, system, or topic. If no documents are available, the server documentation source may need configuring.",
        "route": "/v2/documentation",
        "target": "[data-guide=\"docs-search\"]",
        "practice": "Try a topic in Search docs. Submit when ready.",
        "event": "input"
      },
      {
        "id": "read",
        "title": "Open the matching document",
        "body": "Choose a result in the document list to read it. On narrow screens, the list and document stack vertically, so scroll below the list for the open document.",
        "route": "/v2/documentation",
        "target": "[data-guide=\"docs-list\"], .jarvis-page-viewport"
      }
    ]
  },
  {
    "id": "settings",
    "title": "Demo, guides, and workspace controls",
    "description": "Practice and replay without losing your place.",
    "category": "Your workspace",
    "minutes": 1,
    "steps": [
      {
        "id": "demo",
        "title": "Choose a workspace deliberately",
        "body": "Demo uses sample planning, finance, and monitoring data. Return to real data restores your personal workspace. Account settings and external services still apply to your actual account.",
        "route": "/v2/settings",
        "target": "[data-guide=\"demo-controls\"]"
      },
      {
        "id": "guides",
        "title": "Restart a demo or resume learning",
        "body": "Start a fresh demo walkthrough in User guide resets the sample workspace and demo guide progress. The user guide lets you resume or replay any walkthrough. Tips stay closed until you choose to run a guide.",
        "route": "/v2/settings",
        "target": "[data-guide=\"guide-controls\"]"
      }
    ]
  },
  {
    "id": "account",
    "title": "Personalize and manage your account",
    "description": "Find appearance and account controls.",
    "category": "Your workspace",
    "minutes": 1,
    "steps": [
      {
        "id": "profile",
        "title": "Keep account actions intentional",
        "body": "Profile shows the signed-in account and its available account actions. These controls affect your actual account, including while demo data is showing.",
        "route": "/v2/account",
        "target": "[data-guide=\"section-navigation\"], [data-guide=\"account-profile\"]"
      },
      {
        "id": "appearance",
        "title": "Make the app comfortable to read",
        "body": "Appearance controls the theme and color choices. Pick a combination that is clear on your screen. On desktop, appearance sits beside the other account sections.",
        "route": "/v2/account",
        "target": "[data-guide-section=\"appearance\"], [data-guide=\"account-appearance\"]",
        "practice": "On a small screen, open Appearance.",
        "event": "click"
      },
      {
        "id": "security",
        "title": "Know where security lives",
        "body": "Security contains password and account lifecycle controls. You do not need to change anything to complete this guide. Read each form’s requirements when you actually need it.",
        "route": "/v2/account",
        "target": "[data-guide-section=\"security\"], [data-guide=\"account-security\"]",
        "practice": "On a small screen, open Security.",
        "event": "click"
      }
    ]
  }
];

const guideSuccessMessages: Record<string, string> = {
  "full-tour:plan-intro": "You captured a task in the place meant for loose work. Scheduling can wait until the timing is useful.",
  "full-tour:must-win-intro": "You turned a broad intention into one visible finish line for the day.",
  "full-tour:mood-intro": "You used mood as an honest signal. The number is context for reflection, not a performance score.",
  "full-tour:habits-intro": "You found the habit setup. A small observable behavior is the strongest place to begin.",
  "full-tour:assistant-intro": "You gave Jarvis a concrete request. Specific language makes proposed actions easier to review.",
  "full-tour:documentation-intro": "You searched by a system or task. This is the fastest route from a question to the relevant procedure.",
  "plan:capture": "The task is captured before it needs a time. Mind Sweep keeps loose work from disappearing.",
  "plan:add": "You opened the full editor, where a task can stay loose or become a scheduled block.",
  "plan:editor-close": "You closed the editor without saving. Add task is the deliberate point where a draft becomes part of the plan.",
  "must-win:define": "You gave the day one testable outcome. That finish line can now guide the rest of the plan.",
  "mood:score": "You recorded the core signal. Notes and tags are optional context, and Log mood is still the save point.",
  "mood:context": "You revealed the optional context fields. Use them when they will explain the number later.",
  "habits:chain": "You opened habit setup. Start with a behavior small enough to mark honestly every day.",
  "habits:editor-close": "You inspected the setup without saving. Add creates the chain only when the behavior is ready.",
  "habits:mark": "You updated the selected day. Yes, No, and Skip carry different meaning in the habit history.",
  "journal:write": "You drafted useful context for your future self. Nothing is kept until you choose the form’s save action.",
  "review:reset": "You turned reflection into one small experiment. A specific adjustment is easier to carry into next week.",
  "review:patterns": "You opened the longer-term view. Use patterns to form questions, then compare them with your own experience.",
  "assistant:ask": "Jarvis recognized the request. Review any proposed change before confirming it, especially dates and wording.",
  "finance:spending": "You moved from the headline snapshot to spending detail. Check range and pending status before comparing totals.",
  "finance:accounts": "You found connection controls. Demo mode lets you learn this area without linking a financial account.",
  "real-estate:filters": "You opened the assumptions that shape the lead list. A useful scan begins with deliberate criteria.",
  "real-estate:analysis": "You opened the deal model. Financing and cash-flow results are only as useful as the assumptions underneath them.",
  "objectives:create": "You found the creation flow. A strong objective pairs an outcome with the next action that can move it.",
  "homelab:services": "You moved from overall health to the service list. Check status and freshness before acting on a reading.",
  "documentation:search": "You narrowed the documentation by topic. Open the closest result and verify the procedure before changing a system.",
  "account:appearance": "You found the account-wide appearance controls. Choose the combination that stays clear and comfortable.",
  "account:security": "You found the sensitive account controls. Read the whole form before changing a password or account state."
};

export function guideStepSuccess(guideId: string, step: GuideStep): string {
  return step.success
    ?? guideSuccessMessages[guideId + ":" + step.id]
    ?? (step.event === "input"
      ? "Jarvis recognized your input. Take a moment to notice what the field controls before continuing."
      : "You used the highlighted control. Take a moment to notice what changed before continuing.");
}

export function findGuide(id: string): UserGuide | undefined {
  return userGuides.find((guide) => guide.id === id);
}

export function guideForPath(path: string): UserGuide | undefined {
  const canonical = path === "/v2/todos" ? "/v2/daily" : path;
  return userGuides.find((guide) => !["essentials", "full-tour"].includes(guide.id) && guide.steps[0].route.split("?")[0] === canonical);
}

export function matchesGuideRoute(path: string, route: string): boolean {
  return (path === "/v2/todos" ? "/v2/daily" : path) === route.split("?")[0];
}
