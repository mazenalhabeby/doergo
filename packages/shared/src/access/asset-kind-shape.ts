/** An asset kind's shape and the rules that read it — the parts live in ./asset-kind/; this file is the entry. */

export {
  KIND_SHAPE_LIMITS,
  type KindHolder,
  type KindField,
  type KindColumnType,
  type KindColumn,
  type MoneyDirection,
  type KindMoneyCategory,
  type KindList,
  FAULT_COLUMNS,
  type KindMoney,
  type LogFieldType,
  LOG_FIELD_TYPES,
  LOG_COLORS,
  type LogColor,
  type KindLogField,
  type KindLogDue,
  type KindLogType,
  COST_LOG_KEY,
  type KindShape,
} from './asset-kind/types';
export { normalizeKindShape, normalizeLogTypes } from './asset-kind/normalize';
export { logKeyFrom } from './asset-kind/primitives';
export {
  costLogType,
  logTypesForKind,
  findLogType,
  kindNameLabel,
  maxHolders,
  kindHolderLabel,
} from './asset-kind/log-types';
export {
  type DetailRow,
  normalizeDetailRows,
  detailRowsForKind,
  findMoneyCategory,
  signedCents,
  findKindList,
  normalizeListRow,
  listRowIsEmpty,
  keyColumn,
  linkColumns,
  listByLabel,
  linkTargets,
  keepFieldsForKind,
  fieldsDroppedByMove,
} from './asset-kind/details-lists';
