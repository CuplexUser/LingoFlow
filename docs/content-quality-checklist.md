# Content Quality Checklist

Use this checklist before merging content-heavy updates.

## Baseline metrics

- Confirm `/api/content/metrics` returns the target language(s).
- Check per-category `levelCounts` and flag `underTargetByLevel` buckets.
- Check `exerciseTypeCounts` to avoid one-type dominance in a category.

## Review rubric

- Prompt clarity: prompt is unambiguous and context-specific.
- CEFR fit: phrase complexity matches the tagged level.
- Distractor quality: alternatives are plausible but clearly wrong.
- Hint usefulness: hint supports process, not direct answer leakage.
- Cultural/usage accuracy: phrasing sounds natural for the target language.

## Session behavior spot-check

- Generate at least 3 sessions in the updated category.
- Confirm no obvious repeated-question-type streaks.
- Confirm at least one easier and one stretch question appears in daily sessions when available.
