# Locale catalogs

One JSON catalog per language, shared by web and mobile. `en.json` is the source and the
fallback; every other file must carry exactly its keys (enforced by `../catalog.test.ts`).
The languages the app ships are listed here.

| Code | Language | Source |
|------|----------|--------|
| `en` | English  | written by hand |
| `es` | Español  | `en.json` |

`../catalog.test.ts` fails when a supported language has no row here, or a row's name differs
from `LANGUAGE_NAMES`.

How to add a language, and the key-naming rules: see the "Translations" section of
[CONTRIBUTING.md](../../../../../CONTRIBUTING.md).

## Spanish: voice and glossary

`es.json` is machine-translated from `en.json` and has not been reviewed by a native
speaker. It is neutral Latin-American Spanish in the informal *tú* voice (`Registra tu
primer peso`, never *usted*). Keep `{{placeholders}}` verbatim, and keep short labels short:
they have to fit a 390px phone.

Use the same word for the same thing everywhere, so the app reads as one voice:

| English | Spanish |
|---------|---------|
| Settings | Ajustes |
| Workout (the activity, a heading) | entrenamiento |
| Workouts (the tab label only) | Entrenos |
| set, sets | serie, series |
| reps (a column or tile) | Reps |
| reps (running text) | repeticiones |
| Rest | descanso |
| Rest day | día de descanso |
| Gym Mode | Modo gimnasio |
| countdown | cuenta regresiva |
| Program | programa |
| Exercise | ejercicio |
| Food, a meal | comida (a food item: alimento) |
| log, to log | registro, registrar |
| Body weight | peso corporal |
| Volume | volumen |

Never translated: the unit symbols `kg`, `lb`, `lbs`, `g`, `kcal`; the brands Lyftr, SQLite
and Open Food Facts; exercise and food names; anything a user typed.
