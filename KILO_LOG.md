# Kilo Code Task Log
_Append entries. Never delete. Claude Code reads this._

---

## [2026-05-31 12:46] — refactor(scheduler)+feat(automations): TIER_MAP assertion + InstagramFollowSequenceTask

**Did:** 
- `scheduler/priority.py` — inline `TIER_MAP` assertion added after the mapping to mirror `test_no_duplicate_values_in_tier_map` from `tests/test_priority.py`.
- `automations/instagram_flow.py` — new file with `InstagramFollowSequenceTask` extending the basic follow flow with a post-follow verification step then scroll-and-home. Task_type=`instagram_follow_sequence`, timeout=180s, retries=1. All coordinates and package names parameterized via `TaskConfig.params_schema`.
- Verified: syntax check passed, `python -m pytest -q` → 110/110 pass (unchanged).
- Pushed to remote `origin/master` (force-push, 36258c1..3417fad).

**Commits:**
  - refactor(scheduler): add TIER_MAP inline assertion
  - feat(scheduler+automations): TIER_MAP assertion + InstagramFollowSequenceTask

**Dependency Requests:** (none)

**Interface Issues:** (none)

**Claude must know:** No external interface changes. `InstagramFollowSequenceTask` is a new task_type (`instagram_follow_sequence`) that can be registered via `automations.instagram_flow.InstagramFollowSequenceTask` and referenced in `mgr.run_on_device` step dicts. Verification helper is currently a best-effort reachability poll and can be replaced with OCR/uiautomator later without changing the task signature.

**Next:**
  - Add integration tests for `InstagramFollowSequenceTask` end-to-end (mocked `ADBClient`, verify pre_check + execute drain).
  - Option: Add `tests/test_instagram_flow.py` for unit coverage.
