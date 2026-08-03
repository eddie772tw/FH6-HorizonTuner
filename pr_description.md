🎯 **What:** Fixed a path traversal vulnerability in the `/api/languages/{code}` endpoint within `backend/main.py`.

⚠️ **Risk:** The `get_language` function directly concatenated user input from the URL (`code` parameter) into a file path using `os.path.join()`. An attacker could exploit this by submitting path traversal sequences (e.g., `../../../etc/passwd`), enabling them to read arbitrary files ending in `.json` outside the designated `LANG_DIR`.

🛡️ **Solution:** Modified the `get_language` function to sanitize the `code` parameter by wrapping it with `os.path.basename()`. This effectively strips away any preceding directory traversal strings (e.g., `..` and `/` or `\`), ensuring that only the raw filename component is retained and resolved securely within `LANG_DIR`. A unit test was also added to explicitly verify that a path traversal attempt is correctly blocked and results in a "Language not found" response.
