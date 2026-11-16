import { View } from 'react-native'

// A colour dot beside a name, so a label reads as a key to a drawing (the body map's muscles).
export const Swatch = ({ color }: { color: string }) => <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
