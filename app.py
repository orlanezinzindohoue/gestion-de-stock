from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from flask import Flask, jsonify, render_template, request, session
from flask_wtf.csrf import CSRFProtect, generate_csrf
from werkzeug.exceptions import BadRequest

BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = BASE_DIR / "stock.db"

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.environ.get("FLASK_SECRET_KEY", "dev-only-change-this-secret"),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    # For local development over HTTP. Set True when deployed behind HTTPS.
    SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE", "0") == "1",
)
csrf = CSRFProtect(app)


def connect_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db() -> None:
    with connect_db() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sku TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'Autre',
                quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
                min_quantity INTEGER NOT NULL DEFAULT 5 CHECK (min_quantity >= 0),
                unit_price INTEGER NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS stock_movements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                movement_type TEXT NOT NULL CHECK (movement_type IN ('entry', 'exit')),
                quantity INTEGER NOT NULL CHECK (quantity > 0),
                note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
            );
            CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
            CREATE INDEX IF NOT EXISTS idx_movements_created_at ON stock_movements(created_at);
        """)


def error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def read_json() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise BadRequest("Le corps de la requête doit être un objet JSON.")
    return data


def clean_text(value, label: str, max_length: int = 120) -> str:
    if not isinstance(value, str):
        raise ValueError(f"Le champ « {label} » est obligatoire.")
    value = value.strip()
    if not value:
        raise ValueError(f"Le champ « {label} » est obligatoire.")
    if len(value) > max_length:
        raise ValueError(f"Le champ « {label} » ne doit pas dépasser {max_length} caractères.")
    return value


def integer_value(value, label: str, minimum: int = 0) -> int:
    if isinstance(value, bool):
        raise ValueError(f"Le champ « {label} » doit être un nombre entier.")
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"Le champ « {label} » doit être un nombre entier.")
    if str(value).strip() not in (str(number), f"{number}.0"):
        raise ValueError(f"Le champ « {label} » doit être un nombre entier.")
    if number < minimum:
        raise ValueError(f"Le champ « {label} » doit être supérieur ou égal à {minimum}.")
    return number


def product_to_dict(row: sqlite3.Row) -> dict:
    return {key: row[key] for key in (
        "id", "sku", "name", "category", "quantity",
        "min_quantity", "unit_price", "created_at", "updated_at"
    )}


@app.after_request
def security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    return response


@app.get("/")
def index():
    return render_template("index.html", csrf_token=generate_csrf())


@app.get("/api/dashboard")
def dashboard():
    with connect_db() as db:
        totals = db.execute("""
            SELECT
                COUNT(*) AS product_count,
                COALESCE(SUM(quantity), 0) AS unit_count,
                COALESCE(SUM(quantity * unit_price), 0) AS stock_value,
                COALESCE(SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END), 0) AS out_of_stock,
                COALESCE(SUM(CASE WHEN quantity > 0 AND quantity <= min_quantity THEN 1 ELSE 0 END), 0) AS low_stock
            FROM products
        """).fetchone()
        recent = db.execute("""
            SELECT m.id, m.movement_type, m.quantity, m.note, m.created_at,
                   p.name AS product_name, p.sku
            FROM stock_movements m
            JOIN products p ON p.id = m.product_id
            ORDER BY m.id DESC LIMIT 6
        """).fetchall()
    return jsonify({
        "totals": dict(totals),
        "recent_movements": [dict(row) for row in recent]
    })


@app.get("/api/products")
def list_products():
    query = request.args.get("q", "").strip()
    category = request.args.get("category", "").strip()
    sql = "SELECT * FROM products WHERE 1=1"
    params = []
    if query:
        sql += " AND (name LIKE ? OR sku LIKE ? OR category LIKE ?)"
        like = f"%{query}%"
        params.extend([like, like, like])
    if category:
        sql += " AND category = ?"
        params.append(category)
    sql += " ORDER BY name COLLATE NOCASE ASC"
    with connect_db() as db:
        rows = db.execute(sql, params).fetchall()
        categories = db.execute(
            "SELECT DISTINCT category FROM products ORDER BY category COLLATE NOCASE"
        ).fetchall()
    return jsonify({
        "products": [product_to_dict(row) for row in rows],
        "categories": [row["category"] for row in categories]
    })


@app.post("/api/products")
def create_product():
    try:
        data = read_json()
        sku = clean_text(data.get("sku"), "Référence", 40)
        name = clean_text(data.get("name"), "Nom du produit", 120)
        category = clean_text(data.get("category", "Autre"), "Catégorie", 80)
        quantity = integer_value(data.get("quantity", 0), "Quantité")
        min_quantity = integer_value(data.get("min_quantity", 5), "Seuil d'alerte")
        unit_price = integer_value(data.get("unit_price", 0), "Prix unitaire")
        with connect_db() as db:
            cursor = db.execute("""
                INSERT INTO products (sku, name, category, quantity, min_quantity, unit_price)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (sku, name, category, quantity, min_quantity, unit_price))
            product_id = cursor.lastrowid
            if quantity > 0:
                db.execute("""
                    INSERT INTO stock_movements (product_id, movement_type, quantity, note)
                    VALUES (?, 'entry', ?, 'Stock initial')
                """, (product_id, quantity))
            row = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
        return jsonify({"product": product_to_dict(row)}), 201
    except ValueError as exc:
        return error(str(exc))
    except sqlite3.IntegrityError:
        return error("Cette référence existe déjà. Choisis une référence unique.", 409)
    except BadRequest as exc:
        return error(exc.description)


@app.put("/api/products/<int:product_id>")
def update_product(product_id: int):
    try:
        data = read_json()
        sku = clean_text(data.get("sku"), "Référence", 40)
        name = clean_text(data.get("name"), "Nom du produit", 120)
        category = clean_text(data.get("category", "Autre"), "Catégorie", 80)
        min_quantity = integer_value(data.get("min_quantity", 5), "Seuil d'alerte")
        unit_price = integer_value(data.get("unit_price", 0), "Prix unitaire")
        with connect_db() as db:
            existing = db.execute("SELECT id FROM products WHERE id = ?", (product_id,)).fetchone()
            if not existing:
                return error("Produit introuvable.", 404)
            db.execute("""
                UPDATE products
                SET sku = ?, name = ?, category = ?, min_quantity = ?, unit_price = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (sku, name, category, min_quantity, unit_price, product_id))
            row = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
        return jsonify({"product": product_to_dict(row)})
    except ValueError as exc:
        return error(str(exc))
    except sqlite3.IntegrityError:
        return error("Cette référence est déjà utilisée par un autre produit.", 409)
    except BadRequest as exc:
        return error(exc.description)


@app.delete("/api/products/<int:product_id>")
def delete_product(product_id: int):
    try:
        with connect_db() as db:
            existing = db.execute("SELECT id FROM products WHERE id = ?", (product_id,)).fetchone()
            if not existing:
                return error("Produit introuvable.", 404)
            movement = db.execute(
                "SELECT 1 FROM stock_movements WHERE product_id = ? LIMIT 1", (product_id,)
            ).fetchone()
            if movement:
                return error(
                    "Ce produit possède un historique de mouvements. Pour préserver la traçabilité, "
                    "il ne peut pas être supprimé. Tu peux le conserver ou prévoir une fonction d'archivage.",
                    409
                )
            db.execute("DELETE FROM products WHERE id = ?", (product_id,))
        return jsonify({"message": "Produit supprimé."})
    except sqlite3.IntegrityError:
        return error("Impossible de supprimer ce produit car il est lié à des données.", 409)


@app.post("/api/movements")
def create_movement():
    try:
        data = read_json()
        product_id = integer_value(data.get("product_id"), "Produit", 1)
        movement_type = data.get("movement_type")
        if movement_type not in ("entry", "exit"):
            raise ValueError("Le type de mouvement doit être une entrée ou une sortie.")
        quantity = integer_value(data.get("quantity"), "Quantité", 1)
        note = data.get("note", "")
        if not isinstance(note, str):
            raise ValueError("La note doit être du texte.")
        note = note.strip()[:240]

        with connect_db() as db:
            db.execute("BEGIN IMMEDIATE")
            product = db.execute(
                "SELECT id, name, quantity FROM products WHERE id = ?", (product_id,)
            ).fetchone()
            if not product:
                return error("Produit introuvable.", 404)
            if movement_type == "exit" and quantity > product["quantity"]:
                return error(
                    f"Stock insuffisant : il reste {product['quantity']} unité(s) de ce produit.",
                    409
                )
            delta = quantity if movement_type == "entry" else -quantity
            db.execute(
                "UPDATE products SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (delta, product_id)
            )
            db.execute("""
                INSERT INTO stock_movements (product_id, movement_type, quantity, note)
                VALUES (?, ?, ?, ?)
            """, (product_id, movement_type, quantity, note))
            updated = db.execute(
                "SELECT quantity FROM products WHERE id = ?", (product_id,)
            ).fetchone()
        return jsonify({"message": "Mouvement enregistré.", "new_quantity": updated["quantity"]}), 201
    except ValueError as exc:
        return error(str(exc))
    except BadRequest as exc:
        return error(exc.description)


@app.get("/api/movements")
def list_movements():
    with connect_db() as db:
        rows = db.execute("""
            SELECT m.id, m.movement_type, m.quantity, m.note, m.created_at,
                   p.name AS product_name, p.sku
            FROM stock_movements m
            JOIN products p ON p.id = m.product_id
            ORDER BY m.id DESC LIMIT 100
        """).fetchall()
    return jsonify({"movements": [dict(row) for row in rows]})


@app.errorhandler(400)
def bad_request(_exc):
    return jsonify({"error": "Requête incorrecte. Vérifie les données envoyées."}), 400


if __name__ == "__main__":
    init_db()
    app.run(debug=os.environ.get("FLASK_DEBUG", "0") == "1")
