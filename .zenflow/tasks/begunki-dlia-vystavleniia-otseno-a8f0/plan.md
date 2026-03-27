# Auto

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

---

## Agent Instructions

Ask the user questions when anything is unclear or needs their input. This includes:
- Ambiguous or incomplete requirements
- Technical decisions that affect architecture or user experience
- Trade-offs that require business context

Do not make assumptions on important decisions — get clarification first.

---

## Workflow Steps

### [x] Step: Implementation
<!-- chat-id: 8fef1f6b-69df-46b4-8773-f45bcea78a6f -->

Заменён числовой ввод оценок на слайдеры (бегунки) с шагом 0.1.

**Что сделано:**

1. **Prisma-схема:** `Score.value` изменён с `Int` на `Float`, создана миграция `score_value_float`
2. **Zod-валидация:** `.int()` → `.multipleOf(0.1)` — принимает дробные с шагом 0.1, отклоняет `3.55` и т.п.
3. **ScoreForm:** `<input type="number">` заменён на `<input type="range">` (слайдер) с шагом 0.1, значение отображается рядом с точностью до 1 знака после запятой
4. **handleScoreChange:** `parseInt` → `parseFloat`, округление до 1 знака (`Math.round(x * 10) / 10`)
5. **Total:** сумма округляется до 1 знака, отображается через `.toFixed(1)`
6. **CSS:** стили `.score-slider` + `.score-slider--unset` для кроссбраузерного оформления и визуального отличия неустановленных оценок
7. **UX неустановленной оценки:** серый ползунок + `—` вместо числа; `onPointerDown` фиксирует 0.0 при первом касании (решает проблему, когда палец на нуле и `onChange` не вызывается)
8. **ResultsTable:** индивидуальные оценки жюри отображаются с 1 знаком, если дробные
9. **Тесты:** 3 новых теста на валидацию precision (valid `3.5`, `7.1`; invalid `3.55`, `3.14159`)

Все 280 тестов проходят.
