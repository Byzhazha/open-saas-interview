import { page, query, route, type Spec } from "@wasp.sh/spec";

import { AnalyticsDashboardPage } from "./dashboards/analytics/AnalyticsDashboardPage" with { type: "ref" };
import { AiUsageDashboardPage } from "./dashboards/ai-usage/AiUsageDashboardPage" with { type: "ref" };
import { MessagesPage } from "./dashboards/messages/MessagesPage" with { type: "ref" };
import { UsersDashboardPage } from "./dashboards/users/UsersDashboardPage" with { type: "ref" };
import { CalendarPage } from "./elements/calendar/CalendarPage" with { type: "ref" };
import { SettingsPage } from "./elements/settings/SettingsPage" with { type: "ref" };
import { ButtonsPage } from "./elements/ui-elements/ButtonsPage" with { type: "ref" };
import {
  getAiUsageLogs,
  getAiUsageStats,
} from "./dashboards/ai-usage/operations" with { type: "ref" };

export const adminSpec: Spec = [
  route(
    "AdminRoute",
    "/admin",
    page(AnalyticsDashboardPage, { authRequired: true }),
  ),
  route(
    "AdminUsersRoute",
    "/admin/users",
    page(UsersDashboardPage, { authRequired: true }),
  ),
  route(
    "AdminAiUsageRoute",
    "/admin/ai-usage",
    page(AiUsageDashboardPage, { authRequired: true }),
  ),
  route(
    "AdminSettingsRoute",
    "/admin/settings",
    page(SettingsPage, { authRequired: true }),
  ),
  route(
    "AdminCalendarRoute",
    "/admin/calendar",
    page(CalendarPage, { authRequired: true }),
  ),
  route(
    "AdminUIButtonsRoute",
    "/admin/ui/buttons",
    page(ButtonsPage, { authRequired: true }),
  ),
  route(
    "AdminMessagesRoute",
    "/admin/messages",
    page(MessagesPage, { authRequired: true }),
  ),
  query(getAiUsageStats, { entities: ["AiUsageLog"] }),
  query(getAiUsageLogs, { entities: ["AiUsageLog"] }),
];
