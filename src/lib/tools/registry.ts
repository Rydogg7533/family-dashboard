import "server-only";
import type { Tool } from "@/lib/tools/types";
import { taskTools } from "@/lib/tools/tasks";
import { deviceTools } from "@/lib/tools/devices";
import { calendarTools } from "@/lib/tools/calendar";
import { householdTools } from "@/lib/tools/household";
import { inboxTools } from "@/lib/tools/inbox";
import { documentTools } from "@/lib/tools/documents";
import { moneyTools } from "@/lib/tools/money";
import { registerTools } from "@/lib/tools/registers";
import { peopleTools } from "@/lib/tools/people";
import { recordTools } from "@/lib/tools/records";
import { systemTools } from "@/lib/tools/system";
import { commsTools } from "@/lib/tools/comms";
import { vaultTools } from "@/lib/tools/vault";
import { historyTools } from "@/lib/tools/history";
import { sitterTools } from "@/lib/tools/sitter";
import { moreTools } from "@/lib/tools/more";

// Everything the app can be asked to do. A new feature adds its tool here and the Ask box has it; nothing
// else needs changing. Keep the names domain.verb, and keep the descriptions written for a reader who
// knows nothing about the tables underneath.
export const TOOLS: Tool[] = [...taskTools, ...deviceTools, ...calendarTools, ...householdTools, ...inboxTools, ...documentTools, ...moneyTools, ...registerTools, ...peopleTools, ...recordTools, ...systemTools, ...commsTools, ...vaultTools, ...historyTools, ...sitterTools, ...moreTools];
