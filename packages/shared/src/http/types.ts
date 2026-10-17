/**
 * Answer shapes BOTH apps declared for themselves — one definition now.
 *
 * Each was copied from apps/web-app/src/lib/api.ts and apps/mobile/src/lib/api
 * and merged: a field both copies declare keeps its type; a field only one copy
 * declares is optional here (the server sends it; one screen happened to read
 * it). Types that already lived in this package (Task, TimeEntry, Comment,
 * JoinRequest, MemberDocument…) are reused by the endpoint table, never
 * redefined here.
 */
export type {
  PersonRef,
  JobTimeSplit,
  CrewView,
  JobTimeView,
  TaskHandover,
  OpenRoleTask,
  PresignedUpload,
  WorkLogAttachment,
  WorkLogNote,
} from './types/tasks';
export type {
  ShiftIssueStatus,
  ShiftIssueSeverity,
  ShiftIssueEvent,
  ShiftIssue,
  OvertimeRequest,
  OrgMember,
  Colleague,
  LocationAssignment,
  ContractFields,
} from './types/people';
export type {
  CalendarRange,
  CalendarAttendee,
  CalendarEventDetail,
  CalendarEventInput,
  CalendarPerson,
  SupportConfig,
} from './types/calendar';
