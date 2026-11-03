// lucide-react-native ships types only for its barrel. Each per-icon module (see
// src/components/ui/icons.ts) default-exports one icon of the same type.
declare module 'lucide-react-native/dist/esm/icons/*' {
  const Icon: import('lucide-react-native').LucideIcon
  export default Icon
}
