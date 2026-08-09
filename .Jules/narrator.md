## 2023-10-27 - Automated Missing Key Injection
**Learning:** Automatically synchronizing missing i18n keys across multiple files (like `ja-jp.json` and `zh-tw.json`) can be done efficiently with string manipulation tools/scripts to retain formatting, but these ad-hoc script files must be strictly cleaned up before committing to avoid repo pollution.
**Action:** When creating one-off utility scripts for bulk i18n key synchronization, ensure an explicit deletion step (e.g. `rm *.py`) is executed before requesting code review and submitting the PR.
