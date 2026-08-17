"""Unit tests for backend path security utilities and traversal defense."""

import os
import tempfile

import pytest
from fastapi.testclient import TestClient
from main import app, load_car_params, save_car_params
from path_security import safe_join_under_dir, safe_resolve_path


class TestPathSecurityUtilities:
    """Test suite for path sanitization and boundary containment functions."""

    def test_safe_resolve_path_within_boundary(self, tmp_path):
        sub_file = tmp_path / "valid_file.json"
        sub_file.write_text('{"key": "value"}', encoding="utf-8")

        resolved = safe_resolve_path(str(tmp_path), "valid_file.json")
        assert resolved is not None
        assert os.path.samefile(resolved, str(sub_file))

    def test_safe_resolve_path_allows_create_when_flagged(self, tmp_path):
        target_name = "new_target.json"
        resolved = safe_resolve_path(str(tmp_path), target_name, allow_create=True)
        assert resolved is not None
        assert resolved.endswith(target_name)

    def test_safe_resolve_path_rejects_non_existent_by_default(self, tmp_path):
        resolved = safe_resolve_path(str(tmp_path), "non_existent.json")
        assert resolved is None

    def test_safe_resolve_path_blocks_directory_traversal(self, tmp_path):
        outside_file = tmp_path.parent / "secret.txt"
        outside_file.write_text("secret", encoding="utf-8")

        # Attempt to escape tmp_path with parent directories
        traversal_attempts = [
            "../secret.txt",
            "..\\secret.txt",
            "foo/../../secret.txt",
            ".../secret.txt",
            "/secret.txt",
            "\\secret.txt",
        ]
        for attempt in traversal_attempts:
            resolved = safe_resolve_path(str(tmp_path), attempt)
            assert resolved is None, f"Failed to block traversal: {attempt}"

    def test_safe_resolve_path_rejects_null_bytes(self, tmp_path):
        resolved = safe_resolve_path(str(tmp_path), "valid\0.json")
        assert resolved is None

    def test_safe_join_under_dir_success(self, tmp_path):
        valid_path = safe_join_under_dir(str(tmp_path), "car_preset_1.json")
        assert valid_path.startswith(str(tmp_path))

    def test_safe_join_under_dir_strips_traversal(self, tmp_path):
        # safe_join_under_dir uses os.path.basename, stripping path prefixes
        result = safe_join_under_dir(str(tmp_path), "../../../car.json")
        assert os.path.basename(result) == "car.json"
        assert result.startswith(str(tmp_path))

    def test_safe_join_under_dir_raises_on_invalid_component(self, tmp_path):
        with pytest.raises(ValueError):
            safe_join_under_dir(str(tmp_path), "..")
        with pytest.raises(ValueError):
            safe_join_under_dir(str(tmp_path), "")
        with pytest.raises(ValueError):
            safe_join_under_dir(str(tmp_path), "foo\0bar")


class TestEndpointPathTraversalDefense:
    """Test suite for FastAPI endpoints under path traversal payload attacks."""

    @pytest.fixture
    def client(self):
        return TestClient(app)

    def test_get_language_traversal_blocked(self, client):
        # Path parameter has pattern validation ^[a-zA-Z0-9-]+$
        response = client.get("/api/languages/..%2f..%2fetc%2fpasswd")
        assert response.status_code in (404, 422)

        response = client.get("/api/languages/non-existent-lang")
        assert response.status_code == 200
        assert response.json() == {"error": "Language not found"}

    def test_get_tuning_traversal_blocked(self, client):
        response = client.get("/api/tunings/..%2f..%2f/secret")
        assert response.status_code in (404, 200)
        if response.status_code == 200:
            assert response.json() == {"error": "Tuning not found"}

    def test_get_drag_session_traversal_blocked(self, client):
        response = client.get("/api/drag/sessions/..%2f..%2fsecret.json")
        assert response.status_code in (404, 200)
        if response.status_code == 200:
            assert response.json() == {"error": "Drag session file not found"}

    def test_load_car_params_traversal_safe(self):
        result = load_car_params("../../windows/system32/cmd")
        assert result is None
