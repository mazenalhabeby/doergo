/** Events about assets: logbook due, expenses, hand-overs, pages sent in. */
import { event } from '../event';
import type {
  AssetLogDueMessage,
  AssetProposalDecidedMessage,
  AssetProposalRaisedMessage,
  ExpenseDecidedEvent,
  ExpenseSubmittedEvent,
  HandedOverEvent,
} from './events-types';

export const assetLogDueEvent = event<AssetLogDueMessage>('asset_log_due');

export const assetExpenseSubmittedEvent = event<ExpenseSubmittedEvent>('asset_expense_submitted');

export const assetExpenseDecidedEvent = event<ExpenseDecidedEvent>('asset_expense_decided');

export const assetHandedOverEvent = event<HandedOverEvent>('asset_handed_over');

export const assetProposalRaisedEvent = event<AssetProposalRaisedMessage>('asset_proposal_raised');

export const assetProposalDecidedEvent = event<AssetProposalDecidedMessage>('asset_proposal_decided');
