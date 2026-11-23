// The two native photo modules, imported on demand so the web bundle's entry chunk does not carry
// them. On its own so tests can stand in for it (jest cannot run a dynamic import).
export const loadImagePicker = () => import('expo-image-picker')
export const loadImageManipulator = () => import('expo-image-manipulator')
