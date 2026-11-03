import type { ViewStyle } from 'react-native'

// One and two of three equal columns in a row with a 20px (gap-5) gap. Unpadded wrappers: a
// card's own padding and border set a floor under its flex basis, which would skew the split.
// Growing 1:2 from bases 0 and one gap, the narrow side comes out exactly one column wide, so
// it lines up with the three stat tiles above.
export const ONE_THIRD: ViewStyle = { flexGrow: 1, flexShrink: 1, flexBasis: 0 }
export const TWO_THIRDS: ViewStyle = { flexGrow: 2, flexShrink: 1, flexBasis: 20 }
