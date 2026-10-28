"""
Script to backfill and synchronize the person_closure table from existing persons and relationships in PostgreSQL.
"""
import sys
from pathlib import Path

import psycopg

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings


def _conn_str() -> str:
    # settings.DATABASE_URL (BE/.env) is normalized to the SQLAlchemy form; psycopg wants plain postgresql://.
    return settings.DATABASE_URL.replace("postgresql+psycopg://", "postgresql://", 1)


def backfill():
    print("=== SYNCHRONIZING PERSON_CLOSURE TABLE ===")
    conn = psycopg.connect(_conn_str())
    cur = conn.cursor()
    
    # 1. Clean up any invalid or orphaned closure records
    print("1. Cleaning up orphaned records...")
    cur.execute("""
        DELETE FROM person_closure 
        WHERE ancestor_id NOT IN (SELECT person_id FROM persons)
           OR descendant_id NOT IN (SELECT person_id FROM persons);
    """)
    print(f"   Deleted {cur.rowcount} orphaned records.")
    
    # 2. Insert all depths using Recursive CTE
    print("2. Recomputing all hierarchical paths (depth 0 to 50)...")
    cur.execute("""
        WITH RECURSIVE closure_paths AS (
            -- Base case: depth 0 (self)
            SELECT person_id AS ancestor_id, person_id AS descendant_id, 0 AS depth
            FROM persons
            
            UNION ALL
            
            -- Recursive case: traverse parent-child relationships
            SELECT cp.ancestor_id, r.to_person_id AS descendant_id, cp.depth + 1 AS depth
            FROM closure_paths cp
            JOIN relationships r ON r.from_person_id = cp.descendant_id
            WHERE r.relationship_type = 'PARENT_CHILD'
              AND (r.status IS NULL OR r.status = 'ACTIVE')
              AND cp.depth < 50
        ),
        min_paths AS (
            SELECT ancestor_id, descendant_id, MIN(depth) AS depth
            FROM closure_paths
            GROUP BY ancestor_id, descendant_id
        )
        INSERT INTO person_closure (ancestor_id, descendant_id, depth)
        SELECT ancestor_id, descendant_id, depth
        FROM min_paths
        ON CONFLICT (ancestor_id, descendant_id)
        DO UPDATE SET depth = EXCLUDED.depth;
    """)
    conn.commit()
    print(f"   Upserted records into person_closure.")
    
    # 3. Check summary
    cur.execute("SELECT depth, count(*) FROM person_closure GROUP BY depth ORDER BY depth;")
    rows = cur.fetchall()
    print("3. Verification - Person Closure Depth Distribution:")
    total = 0
    for depth, count in rows:
        print(f"   Depth {depth:2d}: {count:5d} pairs")
        total += count
    print(f"   Total valid closure pairs: {total}")
    
    # 4. Update generation_no in persons table based on max depth from root ancestors
    print("4. Updating generation numbers in persons table...")
    cur.execute("""
        UPDATE persons p
        SET generation_no = COALESCE(gen.calculated_gen, 1)
        FROM (
            SELECT descendant_id, MAX(depth) + 1 AS calculated_gen
            FROM person_closure
            GROUP BY descendant_id
        ) gen
        WHERE p.person_id = gen.descendant_id;
    """)
    conn.commit()
    print(f"   Updated generations for {cur.rowcount} persons.")
    
    conn.close()
    print("=== BACKFILL COMPLETED SUCCESSFULLY ===")

if __name__ == '__main__':
    backfill()
