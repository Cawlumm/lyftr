import { ActivityIndicator, Pressable, type TextInputProps } from 'react-native'
import { Search, X } from 'lucide-react-native'
import { useTheme } from '../../theme/useTheme'
import { Field } from './Field'

interface Props extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  value: string
  onChangeText: (text: string) => void
  /** Show a trailing spinner (e.g. while a debounced query is fetching). When set, it
      takes the trailing slot; otherwise a clear (×) button shows once there's text. */
  loading?: boolean
  placeholder?: string
}

// The app's standard search input: a Field with a leading search icon and a trailing
// slot that is a spinner while `loading`, a clear (×) button when there's text, or
// empty. Reusable across every searchable list (Workouts, Exercises, Food, …) so the
// search affordance — icon, clear, loading — is identical everywhere.
export function SearchField({ value, onChangeText, loading = false, placeholder = 'Search…', ...rest }: Props) {
  const { accent, colors } = useTheme()
  return (
    <Field
      leftIcon={Search}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
      rightSlot={
        loading ? (
          <ActivityIndicator size="small" color={accent} />
        ) : value.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={10}
            onPress={() => onChangeText('')}
            className="active:opacity-60"
          >
            <X size={18} color={colors.txMuted} />
          </Pressable>
        ) : null
      }
      {...rest}
    />
  )
}
