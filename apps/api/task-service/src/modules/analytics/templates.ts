import { ReportDefinition } from './query-engine';

export interface ReportTemplate {
  key: string;
  name: string;
  description: string;
  def: ReportDefinition;
}

/** Built-in reports (Phase 1). Granularity/date range are adjustable in the UI. */
export const TEMPLATES: ReportTemplate[] = [
  {
    key: 'timesheet',
    name: 'Timesheet',
    description: 'Hours worked, overtime and shifts per technician over time.',
    def: {
      dataset: 'attendance',
      measures: ['hours', 'overtimeHours', 'shifts'],
      dimensions: ['technician'],
      granularity: 'week',
      dateRange: { preset: 'last_30d' },
      sort: { key: 'hours', dir: 'desc' },
    },
  },
  {
    key: 'customer_report',
    name: 'Customer report',
    description: 'Jobs completed, work hours and average job time per customer.',
    def: {
      dataset: 'service_reports',
      measures: ['jobs', 'workHours', 'avgJobMinutes'],
      dimensions: ['customer'],
      granularity: 'none',
      dateRange: { preset: 'this_month' },
      sort: { key: 'jobs', dir: 'desc' },
    },
  },
  {
    key: 'technician_performance',
    name: 'Technician performance',
    description: 'Jobs completed and work hours per technician.',
    def: {
      dataset: 'service_reports',
      measures: ['jobs', 'workHours', 'avgJobMinutes'],
      dimensions: ['technician'],
      granularity: 'none',
      dateRange: { preset: 'last_30d' },
      sort: { key: 'jobs', dir: 'desc' },
    },
  },
  {
    key: 'task_summary',
    name: 'Task summary',
    description: 'Task counts and completions by status.',
    def: {
      dataset: 'tasks',
      measures: ['count', 'completed'],
      dimensions: ['status'],
      granularity: 'none',
      dateRange: { preset: 'last_30d' },
      sort: { key: 'count', dir: 'desc' },
    },
  },
];
