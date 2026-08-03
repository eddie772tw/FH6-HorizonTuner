import os
import sys
import pytest
from fastapi.testclient import TestClient

# Add backend directory to sys.path
sys.path.insert(
    0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
)

from main import LANG_DIR, app

client = TestClient(app)

def test_get_language_path_traversal():
    # Attempt a path traversal attack
    # Using normal traversal payload to avoid router rejecting it
    response = client.get("/api/languages/..\\..\\..\\..\\etc\\passwd")

    # It shouldn't crash or expose arbitrary files.
    # With the fix, it will look for 'passwd.json' in LANG_DIR and return Language not found.
    assert response.status_code == 200
    assert response.json() == {"error": "Language not found"}
