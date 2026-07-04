import { Edit2, Trash2 } from 'lucide-react-native'
import type { SheetAction } from './ActionSheet'

// Presets for the common menu actions, so every "edit" / "delete" is defined once
// (icon + intent + default label) instead of re-specified at each call site. These
// are generic UI-level semantics — a pencil edit, a red trash delete — that keep the
// SheetButton/ActionSheet primitives free of any app concepts. Add a preset here when
// an action recurs across screens (duplicate, share, …); pass a label to override.

export function editAction(onPress: () => void, label = 'Edit'): SheetAction {
  return { label, icon: Edit2, onPress }
}

export function deleteAction(onPress: () => void, label = 'Delete'): SheetAction {
  return { label, icon: Trash2, destructive: true, onPress }
}
