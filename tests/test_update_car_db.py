import json
import os
import sys
from unittest.mock import MagicMock, mock_open, patch

import pytest

sys.path.insert(
    0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
)

import update_car_db


def test_fetch_error():
    with (
        patch("update_car_db.urllib.request.urlopen") as mock_urlopen,
        patch("builtins.print") as mock_print,
    ):
        mock_urlopen.side_effect = Exception("Network error")
        update_car_db.main()
        mock_print.assert_called_with("Error fetching data: Network error")


def test_file_not_found():
    with (
        patch("update_car_db.urllib.request.urlopen") as mock_urlopen,
        patch("builtins.open", new_callable=mock_open) as mock_file,
        patch("update_car_db.json.dump") as mock_json_dump,
    ):
        mock_response = MagicMock()
        mock_response.read.return_value.decode.return_value = (
            '{"1999 Ford Mustang": "1"}'
        )
        mock_urlopen.return_value.__enter__.return_value = mock_response

        def open_side_effect(path, *args, **kwargs):
            if "car_database.json" in path and "r" in args:
                raise FileNotFoundError()
            return mock_file.return_value

        mock_file.side_effect = open_side_effect

        update_car_db.main()

        # Verify dump was called with new dict
        args, kwargs = mock_json_dump.call_args
        assert args[0] == {
            "1": {
                "display_name": "1999 Ford Mustang",
                "year": 1999,
                "make": "Ford",
                "model": "Mustang",
                "car_id": 1,
                "source": "Forza Horizon 6 Car Ordinals JSON Gist",
            }
        }


def test_invalid_ordinal():
    with (
        patch("update_car_db.urllib.request.urlopen") as mock_urlopen,
        patch("builtins.open", new_callable=mock_open, read_data="{}"),
        patch("update_car_db.json.dump") as mock_json_dump,
        patch("builtins.print") as mock_print,
    ):
        mock_response = MagicMock()
        mock_response.read.return_value.decode.return_value = (
            '{"1999 Ford Mustang": "invalid"}'
        )
        mock_urlopen.return_value.__enter__.return_value = mock_response

        update_car_db.main()

        mock_print.assert_any_call(
            "Skipping invalid ordinal for 1999 Ford Mustang: invalid"
        )
        args, kwargs = mock_json_dump.call_args
        assert args[0] == {}


def test_existing_entry_and_various_name_formats():
    existing_db = {
        "1": {
            "display_name": "Old Mustang",
            "year": 1998,
            "make": "Ford",
            "model": "Mustang Old",
            "car_id": 1,
            "source": "Old Source",
        }
    }
    new_data = {
        "1999 Ford Mustang": "1",  # Existing, should update display_name and source
        "Ford Falcon": "2",  # No year
        "WeirdCarName": "3",  # Unparsable
    }

    with (
        patch("update_car_db.urllib.request.urlopen") as mock_urlopen,
        patch(
            "builtins.open", new_callable=mock_open, read_data=json.dumps(existing_db)
        ),
        patch("update_car_db.json.dump") as mock_json_dump,
        patch("builtins.print") as mock_print,
    ):
        mock_response = MagicMock()
        mock_response.read.return_value.decode.return_value = json.dumps(new_data)
        mock_urlopen.return_value.__enter__.return_value = mock_response

        update_car_db.main()

        mock_print.assert_any_call("Failed to parse name: WeirdCarName")

        args, kwargs = mock_json_dump.call_args
        updated_db = args[0]

        assert updated_db["1"]["display_name"] == "1999 Ford Mustang"
        assert updated_db["1"]["year"] == 1998
        assert updated_db["1"]["make"] == "Ford"
        assert updated_db["1"]["model"] == "Mustang Old"
        assert updated_db["1"]["source"] == "Forza Horizon 6 Car Ordinals JSON Gist"

        assert updated_db["2"]["year"] == 0
        assert updated_db["2"]["make"] == "Ford"
        assert updated_db["2"]["model"] == "Falcon"

        assert updated_db["3"]["year"] == 0
        assert updated_db["3"]["make"] == "Unknown"
        assert updated_db["3"]["model"] == "WeirdCarName"
