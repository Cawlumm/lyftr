import { Edit2, Trash2 } from 'lucide-react-native'
import type { SheetAction } from './ActionSheet'
import type { ConfirmSheetProps } from './ConfirmSheet'

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

// The static half of a delete ConfirmSheet — red trash badge, "Delete" / "Deleting…"
// labels, and the standard "<subject> will be permanently deleted." message. Spread it
// and add the stateful props (open / busy / onConfirm / onCancel):
//   <ConfirmSheet {...deleteConfirmProps({ title: 'Delete Workout?', subject: `"${name}"` })}
//     open={confirming} busy={deleting} onConfirm={handleDelete} onCancel={close} />
export function deleteConfirmProps(
  { title, subject }: { title: string; subject: string },
): Pick<ConfirmSheetProps, 'title' | 'message' | 'confirmLabel' | 'busyLabel' | 'destructive' | 'icon'> {
  return {
    title,
    message: `${subject} will be permanently deleted.`,
    confirmLabel: 'Delete',
    busyLabel: 'Deleting…',
    destructive: true,
    icon: Trash2,
  }
}
