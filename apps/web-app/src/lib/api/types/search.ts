

// ===========================================================================
// Global search (command palette) — unified across tasks, people, spaces, customers
// ===========================================================================
export interface GlobalSearchResults {
  tasks: { id: string; title: string; status: string }[];
  members: { id: string; firstName: string; lastName: string; email: string | null; avatarUrl: string | null }[];
  spaces: { id: string; name: string; address: string | null }[];
  customers: { id: string; name: string; contactName: string | null }[];
}
