// Metro config. The monorepo wiring that used to live here is gone: since SDK 52
// expo/metro-config detects a monorepo and sets watchFolders and nodeModulesPaths
// itself, and the docs say to delete the manual versions rather than keep them in step
// ("Expo configures Metro automatically for monorepos ... If you previously had manual
// configuration, delete these properties"). Ours were the pre-52 recipe, and pointing
// watchFolders at the workspace root by hand is what made metro-file-map crawl the
// session worktrees under .claude and die with "Failed to start watch mode".
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)


// WEB-ONLY: force zustand to its CJS build, and this is load-bearing - measured, not
// assumed. Exporting the web bundle four ways:
//
//   override + babel plugin   0 occurrences of import.meta
//   override alone            0
//   babel plugin alone        2   <- zustand's ESM build, would throw at runtime
//   neither                   2
//
// babel-plugin-transform-import-meta was carried alongside this for the same problem and
// never solved it (Babel does not reach that dependency's output the way this does), so
// it has been removed. If you are tempted to delete the block below because Metro's
// package-exports resolution looks like it should pick CJS on its own, export the web
// bundle and grep for import.meta first - it does not.
//
// WEB-ONLY detail: force zustand to its CJS build. On web, Metro's package-exports resolution
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
