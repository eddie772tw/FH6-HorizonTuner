from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_list_tunings():
    response = client.get("/api/tunings")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_save_and_delete_tuning():
    payload = {"name": "test_tuning_123", "data": {"spring_rate": 100}}
    # Save
    response = client.post("/api/tunings", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "filename" in data
    filename = data["filename"]

    # List to verify
    list_response = client.get("/api/tunings")
    tunings = list_response.json()
    assert any(t.get("filename") == filename for t in tunings)

    # Delete
    del_response = client.delete(f"/api/tunings/{filename}")
    assert del_response.status_code == 200

    # Delete again should fail
    del_response2 = client.delete(f"/api/tunings/{filename}")
    assert del_response2.status_code == 404


def test_save_tuning_missing_fields():
    response = client.post("/api/tunings", json={"name": "only_name"})
    assert response.status_code == 400


def test_get_cars():
    response = client.get("/api/cars")
    assert response.status_code == 200
    assert isinstance(response.json(), dict)


def test_get_car_by_ordinal():
    # Attempt to get a dummy car if empty, but 404 is fine to test
    response = client.get("/api/cars/9999999")
    assert response.status_code == 404


def test_save_and_get_car_params():
    car_id = "test_car_999"
    payload = {"weight": 1200, "f_weight_dist": 0.5}

    # Save
    response = client.post(f"/api/car_params/{car_id}", json=payload)
    assert response.status_code == 200
    assert response.json()["status"] == "success"

    # Get
    get_res = client.get(f"/api/car_params/{car_id}")
    assert get_res.status_code == 200
    assert get_res.json()["weight"] == 1200
