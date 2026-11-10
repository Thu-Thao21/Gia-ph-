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
            # 1. Inspect existing person_account_links
            rows = (
                await db.execute(
                    text("""
                SELECT clan_id, user_id, person_id, status FROM person_account_links
                WHERE clan_id = 'c0000000-0000-0000-0000-000000000002'
            """)
                )
            ).fetchall()
            print('Current links in Mai The Toc:')
            for r in rows:
                print(' ', r)

            # 2. Delete all links pointing to fake persons
            await db.execute(
                text("""
                DELETE FROM person_account_links
                WHERE person_id IN (
                    '51ed98b8-6069-4571-a340-7d72c40257f5',
                    '7c9ec322-05ea-47dd-b416-b361b748e142'
                )
            """)
            )

            # 3. Delete any link for person 7ea621a5-8f8f-4c42-a712-fa7dd8af0690 to avoid unique constraint conflict
            await db.execute(
                text("""
                DELETE FROM person_account_links
                WHERE person_id = '7ea621a5-8f8f-4c42-a712-fa7dd8af0690'
            """)
            )

            # 4. Delete mappings for fake persons
            await db.execute(
                text("""
                DELETE FROM inter_clan_person_mappings
                WHERE person_a_id IN (
                    '51ed98b8-6069-4571-a340-7d72c40257f5',
                    '7c9ec322-05ea-47dd-b416-b361b748e142'
                ) OR person_b_id IN (
                    '51ed98b8-6069-4571-a340-7d72c40257f5',
                    '7c9ec322-05ea-47dd-b416-b361b748e142'
                )
            """)
            )

            # 5. Delete fake persons from persons table
            await db.execute(
                text("""
                DELETE FROM persons
                WHERE person_id IN (
                    '51ed98b8-6069-4571-a340-7d72c40257f5',
                    '7c9ec322-05ea-47dd-b416-b361b748e142'
                )
            """)
            )

            # 6. Now link Trưởng tộc account mai.phongdien@giapha.com (a0000000-0000-0000-0000-000000000020)
            # to the real Mai Phúc Hậu (7ea621a5-8f8f-4c42-a712-fa7dd8af0690)
            real_hau = '7ea621a5-8f8f-4c42-a712-fa7dd8af0690'
            clan_mai = 'c0000000-0000-0000-0000-000000000002'
            u_owner = 'a0000000-0000-0000-0000-000000000020'

            # Also delete any existing link of u_owner in clan_mai
            await db.execute(
                text(f"""
                DELETE FROM person_account_links
                WHERE clan_id = '{clan_mai}' AND user_id = '{u_owner}'
            """)
            )

            await db.execute(
                text(f"""
                INSERT INTO person_account_links (clan_id, user_id, person_id, status)
                VALUES ('{clan_mai}', '{u_owner}', '{real_hau}', 'ACTIVE')
            """)
            )

            # Update display_name of u_owner to Mai Phúc Hậu
            await db.execute(
                text(f"""
                UPDATE users SET display_name = 'Mai Phúc Hậu'
                WHERE user_id = '{u_owner}'
            """)
            )

            print('CLEANUP & RE-LINK SUCCESSFUL!')


if __name__ == '__main__':
    asyncio.run(main())
