from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.core.config import settings

# Normalize PostgreSQL dialect to asyncpg for async SQLAlchemy
raw_db_url = settings.DATABASE_URL
if raw_db_url.startswith("postgresql://"):
    raw_db_url = raw_db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

# Configure SQLite vs PostgreSQL connect args
connect_args = {}
if raw_db_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_async_engine(
    raw_db_url,
    connect_args=connect_args,
    echo=False,
    future=True
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
