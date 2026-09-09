"""Banco dedicado de versoes usadas para reconstruir folhas Excel de obras."""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

class ObraHistoryRepository:
    def __init__(self, project_root):
        self.project_root = Path(project_root)
        self.database_path = self.project_root / "database" / "obra_history.db"
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_schema()

    def _connect(self):
        connection = sqlite3.connect(str(self.database_path))
        connection.row_factory = sqlite3.Row
        return connection

    def _ensure_schema(self):
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS obra_versions (
                    id TEXT PRIMARY KEY,
                    obra_id TEXT NOT NULL,
                    obra_nome TEXT NOT NULL DEFAULT '',
                    empresa_codigo TEXT NOT NULL DEFAULT '',
                    empresa_nome TEXT NOT NULL DEFAULT '',
                    machine_name TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_obra_versions_company
                    ON obra_versions (empresa_codigo, empresa_nome);
                CREATE INDEX IF NOT EXISTS idx_obra_versions_obra
                    ON obra_versions (obra_id, created_at DESC);
                """
            )
            columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(obra_versions)").fetchall()
            }
            if "obra_tag" not in columns:
                connection.execute(
                    "ALTER TABLE obra_versions ADD COLUMN obra_tag TEXT NOT NULL DEFAULT ''"
                )

    def get_all(self, empresa=None):
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM obra_versions ORDER BY empresa_nome, obra_nome, created_at DESC"
            ).fetchall()
        items = [self._serialize(row) for row in rows]
        return self._enrich_with_saved_obras(items)

    def get_by_id(self, history_id):
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM obra_versions WHERE id = ?", (str(history_id),)
            ).fetchone()
        return self._enrich_with_saved_obras([self._serialize(row)])[0] if row else None

    def _enrich_with_saved_obras(self, items):
        try:
            from servidor_modules.database.repositories.obra_repository import ObraRepository

            obras = {
                str(obra.get("id")): obra
                for obra in ObraRepository(self.project_root).get_all()
                if obra.get("id")
            }
        except Exception:
            obras = {}

        for item in items:
            obra = obras.get(str(item.get("obra_id")))
            if not obra:
                continue
            item["empresa_codigo"] = item.get("empresa_codigo") or obra.get("empresaSigla") or obra.get("empresaCodigo") or ""
            item["empresa_nome"] = item.get("empresa_nome") or obra.get("empresaNome") or ""
            item["obra_nome"] = item.get("obra_nome") or obra.get("nome") or ""
            item["obra_tag"] = item.get("obra_tag") or obra.get("identificadorObra") or ""
        return items

    def create_version(self, payload):
        version_id = uuid.uuid4().hex
        created_at = datetime.now(timezone.utc).isoformat()
        obra_tag = str(payload.get("obra_tag") or "").strip()
        if not obra_tag:
            empresa_codigo = str(payload.get("empresa_codigo") or "").strip()
            numero_obra = str(payload.get("numero_cliente_final") or "").strip()
            obra_tag = f"{empresa_codigo}-{numero_obra}" if empresa_codigo and numero_obra else ""
        empresa_codigo = str(payload.get("empresa_codigo") or "").strip()
        if "-" in obra_tag:
            empresa_codigo = obra_tag.split("-", 1)[0].strip()
        else:
            empresa_codigo = empresa_codigo.rsplit("-", 1)[0] if empresa_codigo.rsplit("-", 1)[-1].isdigit() else empresa_codigo
        with self._connect() as connection:
            connection.execute(
                """INSERT INTO obra_versions
                (id, obra_id, obra_nome, obra_tag, empresa_codigo, empresa_nome,
                 machine_name, created_at, payload_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    version_id,
                    str(payload.get("obra_id") or ""),
                    str(payload.get("obra_name") or ""),
                    obra_tag,
                    empresa_codigo,
                    str(payload.get("empresa_nome") or ""),
                    str(payload.get("name") or ""),
                    created_at,
                    json.dumps(payload, ensure_ascii=False),
                ),
            )
        return {"id": version_id, "created_at": created_at}

    def delete(self, history_id):
        with self._connect() as connection:
            cursor = connection.execute("DELETE FROM obra_versions WHERE id = ?", (str(history_id),))
            return cursor.rowcount > 0

    def _serialize(self, row):
        item = dict(row)
        item["payload"] = json.loads(item.pop("payload_json") or "{}")
        return item
