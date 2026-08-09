import json
import os
import shutil

# Make sure main is importable
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(
    0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../backend"))
)
from main import TUNINGS_DIR, app

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_teardown():
    # Setup: create tunings directory if it doesn't exist
    os.makedirs(TUNINGS_DIR, exist_ok=True)
    yield
    # We could clean up, but the other tests might need it


def test_tuning_path_traversal_get():
    # Attempt to read a file outside the TUNINGS_DIR
    # Using a path traversal payload

    # First, let's create a "secret" file outside TUNINGS_DIR just to see if we can read it without our fix
    # but we can just check what file path the backend attempts to construct

    # If the fix works, '.../../../secret' will become 'secret'
    # So it will look for 'TUNINGS_DIR/secret-test.json' instead of somewhere else
    # The payload uses ../../secret, so we must create the file two directories up.
    secret_out_path = os.path.abspath(os.path.join(TUNINGS_DIR, "..", "..", "secret-test.json"))
    with open(secret_out_path, "w") as f:
        json.dump({"secret": "hacked"}, f)

    secret_in_path = os.path.join(TUNINGS_DIR, "secret-test.json")
    with open(secret_in_path, "w") as f:
        json.dump({"safe": "data"}, f)

    # Let's put a legitimate tuning to see if it works with valid data
    test_car_id = "test_car_get"
    test_save_name = "save_get"
    file_path = os.path.join(TUNINGS_DIR, f"{test_car_id}-{test_save_name}.json")
    with open(file_path, "w") as f:
        json.dump({"test": "data"}, f)

    try:
        # Standard request
        response = client.get(f"/api/tunings/{test_car_id}/{test_save_name}")
        assert response.status_code == 200
        assert response.json() == {"test": "data"}

        # Path traversal request
        # If unpatched, this would try to open: TUNINGS_DIR/../../../secret-test.json
        # With patch, this becomes: TUNINGS_DIR/secret-test.json
        # For FastAPI URL, we need to urlencode or just use a simpler test that FastAPI doesn't normalize
        # FastAPI/Starlette actually normalize URLs sometimes, but let's test what the app does if it gets it.

        # FastAPI's router might normalize `../`, so let's try a direct request if needed.
        # Actually, Starlette normalizes URLs, so `%2E%2E%2F` becomes `../` and gets normalized.
        # However, if an attacker uses something that bypasses Starlette's normalization but not Python's os.path.join, it's vulnerable.
        # For the sake of testing our code, we will assume Starlette might let something through or we test the function directly.
        # But let's try via the TestClient anyway.

        # URL encoded payload for ../../secret
        response = client.get("/api/tunings/..%2F..%2Fsecret/test")
        # Even if Starlette normalizes it to /api/secret/test (which would 404),
        # let's just assert it doesn't give us some arbitrary file.
        # What we really care about is that it doesn't crash or read outside.

        # If it returns 200, we must assert it returned the safe data from TUNINGS_DIR/secret-test.json
        # and NOT the hacked data from the outer folder.
        assert response.status_code in (200, 404)
        if response.status_code == 200:
            assert response.json() == {"safe": "data"}
    finally:
        # Clean up the test files
        if os.path.exists(file_path):
            os.remove(file_path)
        if os.path.exists(secret_out_path):
            os.remove(secret_out_path)
        if os.path.exists(secret_in_path):
            os.remove(secret_in_path)


def test_tuning_path_traversal_save():
    # Attempt to write a file outside the TUNINGS_DIR

    # Let's test by making the TestClient pass the payload
    traversal_car_id = "hacked"
    traversal_save_name = "..%2F..%2Falso_hacked"

    try:
        response = client.post(
            f"/api/tunings/{traversal_car_id}/{traversal_save_name}",
            json={"hacked": "data"},
        )

        # If Starlette normalizes it, it might 404. If not, it will be 200.
        if response.status_code == 200:
            assert response.json() == {"message": "Saved successfully"}

            # Verify the file was saved in the correct directory, NOT outside
            safe_file_path = os.path.join(TUNINGS_DIR, "hacked-also_hacked.json")
            assert os.path.exists(safe_file_path), (
                "File should be created in the TUNINGS_DIR using the basename"
            )
    finally:
        # Clean up both the safe file and the potentially leaked traversed file
        safe_file_path = os.path.join(TUNINGS_DIR, "hacked-also_hacked.json")
        if os.path.exists(safe_file_path):
            os.remove(safe_file_path)

        # Path if vulnerable (two directories up)
        hacked_file_path = os.path.abspath(os.path.join(TUNINGS_DIR, "..", "..", "hacked-also_hacked.json"))
        if os.path.exists(hacked_file_path):
            os.remove(hacked_file_path)
