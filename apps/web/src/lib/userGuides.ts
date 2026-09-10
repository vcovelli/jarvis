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
  shell?: "theme" | "theme-collapse";
  practice?: string;
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
    "title": "Quick start",
    "description": "Try your theme, clear some space, and see how small daily entries add up.",
    "category": "Start here",
    "minutes": 3,
    "steps": [
      {
        "id": "theme-start",
        "title": "First, make it feel like yours",
        "body": "Quick settings changes the whole app instantly. Try Light, Dark, or High Contrast here. Your choice saves automatically.",
        "compactBody": "This is Quick settings, inside More. Try Light, Dark, or High Contrast and watch the app change. Your choice saves automatically.",
        "route": "/v2",
        "target": "[data-guide=\"quick-theme-mode\"]",
        "interactionTarget": "[data-guide=\"quick-theme-mode\"] button",
        "anchor": {
          "label": "Choose your brightness. Try as many as you like.",
          "placement": "top"
        },
        "event": "click",
        "shell": "theme"
      },
      {
        "id": "theme-palette",
        "title": "Give it your color",
        "body": "Choose a color palette. It works with the mode you just picked, so you can make Jarvis comfortable to use every day.",
        "route": "/v2",
        "target": "[data-guide=\"quick-theme-palette\"]",
        "interactionTarget": "[data-guide=\"quick-theme-palette\"] button",
        "anchor": {
          "label": "Tap a color to preview it across Jarvis.",
          "placement": "top"
        },
        "event": "click",
        "shell": "theme"
      },
      {
        "id": "theme-collapse",
        "title": "Keep the look. Clear some space.",
        "body": "Choose Hide on Quick settings to tuck the color controls away. Your look stays saved. Use Show in the sidebar whenever you want to change it again.",
        "compactBody": "Choose Hide on Quick settings to tuck the colors away. Your look stays saved. Later, open More → Quick settings → Show to change it again.",
        "route": "/v2",
        "target": "[data-guide=\"quick-theme-toggle\"]",
        "anchor": {
          "label": "Hide folds these controls away. Show brings them back.",
          "placement": "top"
        },
        "event": "click",
        "shell": "theme-collapse"
      },
      {
        "id": "must-win-start",
        "title": "Start small: choose one win",
        "body": "You don’t need to fill every page. Must Win is the one outcome that would make today count. Write a clear finish line; it saves when you leave the form.",
        "route": "/v2/must-win",
        "target": "[data-guide=\"must-win-input\"]",
        "anchor": {
          "label": "What is the one thing you want to finish today?"
        },
        "event": "input"
      },
      {
        "id": "todos-start",
        "title": "Plan holds everything else",
        "body": "Use New to add a task or a time block. Leave a task unscheduled in Mind Sweep until you’re ready to plan it. Opening the editor does not save a task.",
        "compactBody": "Use + to add a task. Keep it in Mind Sweep for later, or give it a time in Schedule. Opening the editor does not save a task.",
        "route": "/v2/daily",
        "target": "[data-guide=\"plan-add\"]",
        "anchor": {
          "label": "Open the task editor. Save only when you’re ready.",
          "placement": "top"
        },
        "event": "click"
      },
      {
        "id": "habits-start",
        "title": "Build one repeatable habit",
        "body": "Add habit creates a routine and its schedule. Start with something small, then mark each day you do it. The history helps you see your consistency.",
        "route": "/v2/habits",
        "target": "button[aria-label=\"Add habit\"]",
        "anchor": {
          "label": "Add one small routine you want to repeat."
        },
        "event": "click"
      },
      {
        "id": "sleep-start",
        "title": "Check in with your sleep",
        "body": "Set bedtime and wake time, then rate how restful the night felt. Choose Log sleep to save. A few regular entries give you a recovery history to look back on.",
        "route": "/v2/sleep",
        "target": "[data-guide=\"sleep-quality\"] input",
        "anchor": {
          "label": "Rate the night, then use Log sleep to save."
        },
        "event": "input"
      },
      {
        "id": "mood-start",
        "title": "Give the day some context",
        "body": "Move the slider to capture how you feel right now, then choose Log mood to save. Your mood history adds context alongside your sleep and daily progress.",
        "route": "/v2/mood",
        "target": "[data-guide=\"mood-score\"]",
        "anchor": {
          "label": "Set your score. Log mood saves the check-in."
        },
        "event": "input"
      },
      {
        "id": "review-start",
        "title": "This is why the small entries matter",
        "body": "Review brings your sleep, mood, task completion, and Must Wins together. As you log more days, use the summaries to reflect on what’s working and decide what to adjust. Start with one win and one check-in; explore the other tools when you need them.",
        "compactBody": "Open View insights to see sleep, mood, task completion, and Must Wins together. Regular check-ins make these summaries useful. Start with one win and one check-in; explore the other tools later.",
        "route": "/v2/review",
        "target": "[data-guide=\"review-insights\"], [data-guide=\"review-summary\"]",
        "anchor": {
          "label": "Your daily entries build this overview.",
          "placement": "top"
        }
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
        "practice": "Open the editor. Close it when you are done looking; saving is optional.",
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
        "body": "A chain is a habit tracked over time. Add one clear behavior, choose its schedule, and start with something you can do consistently.",
        "route": "/v2/habits",
        "target": "button[aria-label=\"Add habit\"]",
        "practice": "Open Add habit, then close the editor after looking.",
        "event": "click"
      },
      {
        "id": "mark",
        "title": "Check the day before marking it",
        "body": "Select the day you mean to update. Habit cells cycle through their available states; use the status label to check your result. The detail view shows the selected habit’s history.",
        "route": "/v2/habits",
        "target": "[data-guide=\"habit-cells\"]"
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
