// The i18n guard's rule data, plain so web/eslint.config.mjs (ESM) and
// mobile/eslint.config.js (CJS) import the one copy and cannot drift apart.
//
// eslint-plugin-i18next replaces a default list wholesale when an option is given,
// so every list below restates the defaults it still wants.
//
// A hit means one of: the string is copy and belongs in the catalog (CLAUDE.md,
// "UI Strings"); it is not copy and the prop / word / callee belongs in a list here,
// with the reason; or, last resort, it is baselined with `eslint --suppress-rule`.

const MESSAGE = 'UI copy goes through t() — CLAUDE.md, UI Strings'

// Props whose value is never shown to a person. Anything not listed is checked, so a
// newly invented copy prop (`emptyText`, `hint`) is caught by default.
const NON_COPY_PROPS = [
  // eslint-plugin-i18next defaults
  'className', 'styleName', 'style', 'type', 'key', 'id', 'width', 'height',
  // test hooks and routing
  'testID', 'data-testid', 'path', 'to', 'href', 'src', 'source', 'target', 'rel',
  'htmlFor', 'name', 'accept', 'capture', 'pattern',
  // values, not labels
  'value', 'defaultValue', 'min', 'max', 'step', 'tabIndex',
  // enums and tokens the component switches on
  'variant', 'size', 'tone', 'icon', 'kind', 'mode', 'layout', 'edges', 'behavior',
  'haptic', 'descriptionTone', 'descriptionId', 'animationType', 'presentation',
  'resizeMode', 'contentFit', 'pointerEvents', 'role', 'accessibilityRole',
  // keyboard, scrolling, camera and live-region behaviour
  'keyboardShouldPersistTaps', 'keyboardDismissMode', 'submitBehavior',
  'accessibilityLiveRegion', 'facing', 'barcodeScannerSettings', 'display',
  'themeVariant', 'align', 'side', 'tint',
  'keyboardType', 'autoCapitalize', 'autoComplete', 'autoCorrect', 'textContentType',
  'inputMode', 'enterKeyHint', 'returnKeyType',
  // colours and geometry
  'color', 'colors', 'defaultFill', 'thumbColor', 'fill', 'fillOpacity', 'stroke',
  'strokeOpacity', 'strokeLinecap', 'strokeLinejoin', 'textAnchor', 'bg', 'border',
  'background', 'xmlns', 'viewBox', 'd',
  // chart wiring
  'dataKey', 'stackId', 'domain', 'interval',
  // the aria-* props that are state or ids, not text (aria-label, aria-description
  // and aria-placeholder are copy and stay checked)
  'aria-live', 'aria-hidden', 'aria-expanded', 'aria-pressed', 'aria-checked',
  'aria-selected', 'aria-current', 'aria-modal', 'aria-haspopup', 'aria-busy',
  'aria-disabled', 'aria-invalid', 'aria-controls', 'aria-describedby',
  'aria-labelledby', 'aria-orientation', 'aria-atomic', 'aria-relevant',
  'aria-valuemin', 'aria-valuemax', 'aria-valuenow',
]

// Object keys inside JSX (`style={{ ... }}`, `tick={{ ... }}`, data rows) whose value is
// styling or an identifier. `label`, `title` and friends are deliberately absent.
const NON_COPY_OBJECT_KEYS = [
  '[A-Z_-]+',
  'id', 'key', 'value', 'icon', 'color', 'bg', 'background', 'border', 'borderRadius',
  'fontSize', 'fill', 'stroke', 'strokeWidth', 'radius', 'r', 'cursor', 'letterSpacing',
  'plate', 'plateEdge', 'collar', 'kind', 'source',
  'alignItems', 'alignSelf', 'justifyContent', 'flexDirection', 'textAlign', 'position',
  'overflow',
]

// Strings that are never words. Each entry is anchored by the plugin (^...$).
const NON_COPY_WORDS = [
  // eslint-plugin-i18next defaults
  '[0-9!-/:-@[-`{-~]+',
  '[A-Z_-]+',
  /^\p{Emoji}+$/u,
  // digits and glyphs outside ASCII: a Unicode minus, arrows, a separator dot, (c)
  '[0-9\\s·×—–…•%°−→←↑↓©!-/:-@[-`{-~]+',
  // unit symbols, alone or after a number, and brands (CLAUDE.md, "Numbers & Locale");
  // the wordmark is lowercase
  '[0-9.,\\s]*(kg|lbs?|g|kcal)',
  '(©\\s*)?(Lyftr|lyftr|SQLite|Open Food Facts)',
  'https?://\\S+',
  // a catalog key held as data and translated at render: 'auth.hero.features.food'
  '[a-z][a-zA-Z]*(\\.[a-zA-Z0-9_]+){2,}',
  // a field name: 'actual_weight'
  '[a-z]+(_[a-z0-9]+)+',
  // CSS values: currentColor, transparent, #3b82f6, rgba(...), var(--x), calc(...)
  'currentColor|transparent|#[0-9a-fA-F]{3,8}|(rgba?|hsla?|var|calc)\\(.*\\)',
  // direction and theme tokens passed to local helpers: pick('system'), tick('left', 28)
  '(left|right|top|bottom|system|dark|light)',
  // A Tailwind class list. Every token carries a hyphen, colon, slash or bracket, so a
  // plain English phrase never matches.
  '[a-z0-9:/.%#!*_()\\[\\]-]*[-:/\\[][a-z0-9:/.%#!*_()\\[\\]-]*(\\s+[a-z0-9:/.%#!*_()\\[\\]-]*[-:/\\[][a-z0-9:/.%#!*_()\\[\\]-]*)*',
]

const noLiteralString = {
  framework: 'react',
  mode: 'jsx-only',
  message: MESSAGE,
  'jsx-components': { include: [], exclude: ['Trans'] },
  'jsx-attributes': { include: [], exclude: NON_COPY_PROPS },
  'object-properties': { include: [], exclude: NON_COPY_OBJECT_KEYS },
  words: { exclude: NON_COPY_WORDS },
  callees: {
    include: [],
    exclude: [
      // eslint-plugin-i18next defaults
      'i18n(ext)?', 't', 'require', 'addEventListener', 'removeEventListener',
      'postMessage', 'getElementById', 'dispatch', 'commit', 'includes', 'indexOf',
      'endsWith', 'startsWith',
      // translation and formatting entry points
      'i18n\\.t', 'translate', 'format', 'formatDay', 'formatDate', 'languageChoiceLabel',
      // setters and updaters whose string argument names a state or a field
      'setPhase', 'setGymState', 'setTab', 'updateSet', 'onUpdateSet',
      'sanitizeNumericInput',
      // navigation, class names and logging are not copy
      'router\\..*', 'navigate', 'cn', 'clsx', 'console\\..*',
    ],
  },
}

// Copy that never reaches JSX in the same expression, so the rule above cannot see it.
const restrictedSyntax = [
  {
    selector:
      'CallExpression[callee.name=/^(apiErrorMessage|useAsyncAction|useServerList)$/] > :matches(Literal[value=/\\s/], TemplateLiteral)',
    message: MESSAGE,
  },
  {
    selector:
      'CallExpression[callee.name=/^set\\w*(Error|Msg|Message)$/] > :matches(Literal[value=/./], TemplateLiteral)',
    message: MESSAGE,
  },
  {
    // A default of '0.0' is a format hint, not copy, so only a value with a letter counts.
    selector:
      'AssignmentPattern[left.name=/^(\\w*Label|label|placeholder|title|message|sublabel)$/] > Literal[value=/\\p{L}/u]',
    message: MESSAGE,
  },
]

module.exports = { MESSAGE, noLiteralString, restrictedSyntax }
