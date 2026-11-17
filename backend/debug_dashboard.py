import asyncio
from httpx import AsyncClient
from app.main import app

TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3OTQwNTAwMDMsInN1YiI6IjBkYWYwOTRkLWQ0MzYtNGJiYy04NDA1LTFhMTI5YTRkODA2YiIsInJvbGUiOiJBRE1JTiIsInR5cGUiOiJhY2Nlc3MiLCJzZXNzaW9uX2lkIjoic2Vzcy0xYjIyMWU2NGUyZjAifQ.BHx_RyA3UzleodZ_eXy2t2x5pI1QCzr_X5FIYzD6WUE"

async def main():
    async with AsyncClient(app=app, base_url="http://test") as client:
        headers = {"Authorization": f"Bearer {TOKEN}"}
        resp = await client.get("/api/v1/analytics/dashboard?start_date=2026-01-01T00:00:00&end_date=2026-12-31T23:59:59", headers=headers)
        print('status', resp.status_code)
        print('json', resp.json())

if __name__ == "__main__":
    asyncio.run(main())

