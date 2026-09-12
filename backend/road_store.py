"""Append-only Road snapshots in SQLite; IDs never become filesystem paths."""

import json
import sqlite3
import time
from contextlib import contextmanager
from uuid import uuid4

ROAD_SCHEMA = "road-workflow/v1"


class RoadStore:
    def __init__(self, db_path: str):
        self.db_path = db_path
        with self.connect() as connection:
            connection.execute("""CREATE TABLE IF NOT EXISTS road_documents (
                id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, kind TEXT NOT NULL,
                created_at REAL NOT NULL, document TEXT NOT NULL)""")
            connection.execute(
                "CREATE INDEX IF NOT EXISTS road_workflow_idx ON road_documents(workflow_id, created_at)"
            )

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.db_path, timeout=10)
        connection.row_factory = sqlite3.Row
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def append(
        self,
        kind: str,
        workflow_id: str,
        payload: dict,
        *,
        document_id: str | None = None,
    ) -> dict:
        document = self.document(kind, workflow_id, payload, document_id=document_id)
        self.append_documents([document])
        return document

    @staticmethod
    def document(
        kind: str, workflow_id: str, payload: dict, *, document_id: str | None = None
    ) -> dict:
        """Build linked snapshots before committing the whole operation atomically."""
        document = {
            **payload,
            "id": document_id or uuid4().hex,
            "workflowId": workflow_id,
            "kind": kind,
            "schema": ROAD_SCHEMA,
            "createdAt": time.time(),
        }
        return document

    def append_documents(self, documents: list[dict]) -> list[dict]:
        rows = [
            (
                d["id"],
                d["workflowId"],
                d["kind"],
                d["createdAt"],
                json.dumps(d, allow_nan=False, separators=(",", ":")),
            )
            for d in documents
        ]
        with self.connect() as connection:
            connection.executemany(
                "INSERT INTO road_documents VALUES (?, ?, ?, ?, ?)",
                rows,
            )
        return documents

    def save_engine(self, payload: dict) -> dict:
        """Retry-safe immutable writes, including concurrent requests for one ID."""
        observation = payload["observation"]
        document = self.document(
            "engine-observation",
            "engine-observations",
            payload,
            document_id=observation["id"],
        )
        encoded = json.dumps(document, allow_nan=False, separators=(",", ":"))
        with self.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT document FROM road_documents WHERE id = ?", (document["id"],)
            ).fetchone()
            if row:
                existing = json.loads(row[0])
                if (
                    existing.get("observation") != observation
                    or existing.get("capture") != payload["capture"]
                ):
                    raise ValueError("An immutable observation already uses this ID")
            else:
                connection.execute(
                    "INSERT INTO road_documents VALUES (?, ?, ?, ?, ?)",
                    (
                        document["id"],
                        document["workflowId"],
                        document["kind"],
                        document["createdAt"],
                        encoded,
                    ),
                )
        return observation

    def get(
        self, document_id: str, kind: str | None = None, workflow_id: str | None = None
    ) -> dict:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT document FROM road_documents WHERE id = ?", (document_id,)
            ).fetchone()
        if row is None:
            raise ValueError("Saved Road item was not found")
        document = json.loads(row["document"])
        if (
            kind is not None
            and document["kind"] != kind
            or workflow_id is not None
            and document["workflowId"] != workflow_id
        ):
            raise ValueError(
                "Saved item belongs to a different Road workflow or item type"
            )
        return document

    def list(
        self,
        workflow_id: str | None = None,
        kind: str | None = None,
        *,
        exclude_capture: bool = False,
    ) -> list[dict]:
        clauses, args = [], []
        for column, value in (("workflow_id", workflow_id), ("kind", kind)):
            if value is not None:
                clauses.append(column + " = ?")
                args.append(value)
        projection = (
            "json_remove(document, '$.capture') AS document"
            if exclude_capture
            else "document"
        )
        query = (
            "SELECT "
            + projection
            + " FROM road_documents"
            + (" WHERE " + " AND ".join(clauses) if clauses else "")
        )
        with self.connect() as connection:
            rows = connection.execute(
                query + " ORDER BY created_at, rowid", args
            ).fetchall()
        return [json.loads(row["document"]) for row in rows]
