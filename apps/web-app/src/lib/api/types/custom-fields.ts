

// ============================================================================
// CUSTOM FIELDS TYPES & API
// ============================================================================

export type CustomFieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'DROPDOWN' | 'CHECKBOX' | 'URL' | 'EMAIL';


export interface CustomFieldDefinition {
  id: string;
  organizationId: string;
  /** Task Type this field belongs to; null = global (all tasks). */
  workflowId: string | null;
  name: string;
  key: string;
  type: CustomFieldType;
  options: string[] | null;
  isRequired: boolean;
  position: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}


export interface CustomFieldValue {
  id: string;
  definitionId: string;
  taskId: string;
  value: string;
  definition?: CustomFieldDefinition;
}
