// Metro config for a monorepo: watch the workspace root so Metro transpiles the
// @lyftr/shared TypeScript source, and resolve modules from both the app's and the
// root's node_modules. Wrapped with NativeWind's metro transform.
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
// Resolve ALL modules (incl. react from @lyftr/shared and from react-native itself)
// only through the paths above, never a package's own nested node_modules. This
// forces a SINGLE react instance across the app + shared + react-native — without it,
// duplicate react copies crash RN 0.81's Fabric renderer ("ReactSharedInternals.S").
config.resolver.disableHierarchicalLookup = true

module.exports = withNativeWind(config, { input: './global.css' })
