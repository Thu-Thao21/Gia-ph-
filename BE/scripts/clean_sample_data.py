import sys
import asyncio
import os
from dotenv import load_dotenv

load_dotenv('BE/.env')
sys.path.insert(0, 'BE')

from app.db.postgres import async_session_maker
from sqlalchemy import text


async def main():
    async with async_session_maker() as db:
        async with db.begin():
            print('=== STARTING DATABASE SAMPLE DATA CLEANUP ===')

            tables_to_clear = [
                'lineage_access_grants',
                'lineage_access_requests',
                'inter_clan_person_mappings',
                'inter_clan_shared_policies',
                'inter_clan_links',
                'inter_clan_requests',
                'person_account_links',
                'relationships',
                'persons',
                'branches',
                'donations',
                'fund_transactions',
                'funds',
            ]

            for tbl in tables_to_clear:
                res = await db.execute(text(f'DELETE FROM {tbl};'))
                print(f'Cleared {tbl}: {res.rowcount} rows deleted.')

            users_count = (await db.execute(text("SELECT count(*) FROM users;"))).scalar()
            clans_count = (await db.execute(text("SELECT count(*) FROM clans;"))).scalar()
            persons_count = (await db.execute(text("SELECT count(*) FROM persons;"))).scalar()
            rels_count = (await db.execute(text("SELECT count(*) FROM relationships;"))).scalar()

            print('\n=== VERIFICATION ===')
            print(f'Users count preserved: {users_count}')
            print(f'Clans count preserved: {clans_count}')
            print(f'Persons count: {persons_count}')
            print(f'Relationships count: {rels_count}')
            print('DATABASE CLEANUP COMPLETE & COMMITTED!')


if __name__ == '__main__':
    asyncio.run(main())
