"""Append-only multi-discipline workflow snapshots in SQLite; IDs never become filesystem paths."""

import json
import sqlite3
import time
from contextlib import contextmanager
from uuid import uuid4


class WorkflowStore:
    def __init__(self, db_path: str, default_discipline: str = "offroad"):
        self.db_path = db_path
        self.default_discipline = default_discipline
        with self.connect() as connection:
            connection.execute("""CREATE TABLE IF NOT EXISTS workflow_documents (
                id TEXT PRIMARY KEY,
                discipline TEXT NOT NULL,
                workflow_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                created_at REAL NOT NULL,
                document TEXT NOT NULL
            )""")
            connection.execute(
                "CREATE INDEX IF NOT EXISTS workflow_docs_idx ON workflow_documents(discipline, workflow_id, created_at)"
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

    def document(
        self,
        kind: str,
        workflow_id: str,
        payload: dict,
        *,
        document_id: str | None = None,
        discipline: str | None = None,
    ) -> dict:
        """Build linked snapshots before committing the whole operation atomically."""
        disc = discipline or self.default_discipline
        schema = f"{disc}-workflow/v1"
        return {
            **payload,
            "id": document_id or uuid4().hex,
            "discipline": disc,
            "workflowId": workflow_id,
            "kind": kind,
            "schema": schema,
            "createdAt": time.time(),
        }

    def append_documents(
        self, documents: list[dict], discipline: str | None = None
    ) -> list[dict]:
        rows = [
            (
                d["id"],
                d.get("discipline") or discipline or self.default_discipline,
                d["workflowId"],
                d["kind"],
                d["createdAt"],
                json.dumps(d, allow_nan=False, separators=(",", ":")),
            )
            for d in documents
        ]
        with self.connect() as connection:
            connection.executemany(
                "INSERT INTO workflow_documents (id, discipline, workflow_id, kind, created_at, document) VALUES (?, ?, ?, ?, ?, ?)",
                rows,
            )
        return documents

    def append(
        self,
        kind: str,
        workflow_id: str,
        payload: dict,
        *,
        document_id: str | None = None,
        discipline: str | None = None,
    ) -> dict:
        doc = self.document(
            kind,
            workflow_id,
            payload,
            document_id=document_id,
            discipline=discipline,
        )
        self.append_documents([doc], discipline=discipline)
        return doc

    def get(
        self,
        document_id: str,
        kind: str | None = None,
        workflow_id: str | None = None,
        discipline: str | None = None,
    ) -> dict:
        disc = discipline or self.default_discipline
        with self.connect() as connection:
            row = connection.execute(
                "SELECT document FROM workflow_documents WHERE id = ?", (document_id,)
            ).fetchone()
        if row is None:
            raise ValueError("Saved workflow item was not found")
        document = json.loads(row["document"])
        if (
            kind is not None
            and document["kind"] != kind
            or workflow_id is not None
            and document["workflowId"] != workflow_id
            or disc is not None
            and document.get("discipline") != disc
        ):
            raise ValueError(
                "Saved item belongs to a different workflow, item type, or discipline"
            )
        return document

    def list(
        self,
        workflow_id: str | None = None,
        kind: str | None = None,
        discipline: str | None = None,
    ) -> list[dict]:
        disc = discipline if discipline is not None else self.default_discipline
        clauses, args = [], []
        if disc != "*":
            clauses.append("discipline = ?")
            args.append(disc)
        for column, value in (("workflow_id", workflow_id), ("kind", kind)):
            if value is not None:
                clauses.append(column + " = ?")
                args.append(value)
        query = "SELECT document FROM workflow_documents" + (
            " WHERE " + " AND ".join(clauses) if clauses else ""
        )
        with self.connect() as connection:
            rows = connection.execute(
                query + " ORDER BY created_at, rowid", args
            ).fetchall()
        return [json.loads(row["document"]) for row in rows]
