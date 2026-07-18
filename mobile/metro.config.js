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
// Keep hierarchical lookup ON (default) so packages resolve their own transitive deps
// (e.g. react-native-reanimated -> semver/functions/satisfies). A SINGLE react instance
// — required or RN 0.81's Fabric renderer crashes ("ReactSharedInternals.S") — is instead
// guaranteed by the root package.json `overrides.react` pin + a hoisted single copy.
config.resolver.disableHierarchicalLookup = false

// WEB-ONLY: force zustand to its CJS build. On web, Metro's package-exports resolution
// picks zustand's ESM (esm/*.mjs), which uses bare `import.meta` — Metro can't bundle
// that ("Cannot use 'import.meta' outside a module"). Native resolves the CJS build
// already, so this override is scoped to platform === 'web'.
const defaultResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && (moduleName === 'zustand' || moduleName.startsWith('zustand/'))) {
    const sub = moduleName === 'zustand' ? 'index' : moduleName.slice('zustand/'.length)
    return {
      type: 'sourceFile',
      filePath: path.resolve(workspaceRoot, 'node_modules/zustand', `${sub}.js`),
    }
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform)
}

module.exports = withNativeWind(config, { input: './global.css' })
