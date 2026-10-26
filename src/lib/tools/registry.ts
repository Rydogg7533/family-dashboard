import "server-only";
import type { Tool } from "@/lib/tools/types";
import { taskTools } from "@/lib/tools/tasks";
import { deviceTools } from "@/lib/tools/devices";
import { calendarTools } from "@/lib/tools/calendar";
import { householdTools } from "@/lib/tools/household";
import { inboxTools } from "@/lib/tools/inbox";
import { documentTools } from "@/lib/tools/documents";
import { moneyTools } from "@/lib/tools/money";

// Everything the app can be asked to do. A new feature adds its tool here and the Ask box has it; nothing
// else needs changing. Keep the names domain.verb, and keep the descriptions written for a reader who
// knows nothing about the tables underneath.
export const TOOLS: Tool[] = [...taskTools, ...deviceTools, ...calendarTools, ...householdTools, ...inboxTools, ...documentTools, ...moneyTools];
