-- Prepares the one SQL Server for its two tenants and nothing more: the identity database the
-- gateway owns and the trades database the trades service owns. The schemas are not here. Each
-- service's migration job applies its own, as its migrator login.
--
-- Two logins per database. The migrator is db_owner and is only ever used by the one-shot migrate
-- job. The app login is a member of the writer role the migration grants, and of nothing else, so
-- the running service can read and write its rows but cannot delete audit history, change the
-- schema or switch the append-only trigger off.
--
-- Safe to run on every start: everything is created only when missing, and passwords are reset to
-- the configured values, so rotating one is an edit to .env and a restart.
--
-- sqlcmd reads the four passwords from environment variables of the same name. A password must not
-- contain a single quote, which would end the string it is substituted into, and SQL Server's
-- policy refuses one that contains its own login name.

SET NOCOUNT ON;
GO

IF DB_ID(N'identity') IS NULL CREATE DATABASE [identity];
IF DB_ID(N'trades') IS NULL CREATE DATABASE [trades];
GO

IF SUSER_ID(N'identity_migrator') IS NULL
    CREATE LOGIN [identity_migrator] WITH PASSWORD = N'$(IDENTITY_MIGRATOR_PASSWORD)', DEFAULT_DATABASE = [identity];
ELSE
    ALTER LOGIN [identity_migrator] WITH PASSWORD = N'$(IDENTITY_MIGRATOR_PASSWORD)';

IF SUSER_ID(N'identity_app') IS NULL
    CREATE LOGIN [identity_app] WITH PASSWORD = N'$(IDENTITY_APP_PASSWORD)', DEFAULT_DATABASE = [identity];
ELSE
    ALTER LOGIN [identity_app] WITH PASSWORD = N'$(IDENTITY_APP_PASSWORD)';

IF SUSER_ID(N'trades_migrator') IS NULL
    CREATE LOGIN [trades_migrator] WITH PASSWORD = N'$(TRADES_MIGRATOR_PASSWORD)', DEFAULT_DATABASE = [trades];
ELSE
    ALTER LOGIN [trades_migrator] WITH PASSWORD = N'$(TRADES_MIGRATOR_PASSWORD)';

IF SUSER_ID(N'trades_app') IS NULL
    CREATE LOGIN [trades_app] WITH PASSWORD = N'$(TRADES_APP_PASSWORD)', DEFAULT_DATABASE = [trades];
ELSE
    ALTER LOGIN [trades_app] WITH PASSWORD = N'$(TRADES_APP_PASSWORD)';
GO

USE [identity];
IF USER_ID(N'identity_migrator') IS NULL CREATE USER [identity_migrator] FOR LOGIN [identity_migrator];
ALTER ROLE [db_owner] ADD MEMBER [identity_migrator];
IF USER_ID(N'identity_app') IS NULL CREATE USER [identity_app] FOR LOGIN [identity_app];
-- The migration grants this role its permissions; it is created here first so the app login can
-- join it before the schema exists.
IF DATABASE_PRINCIPAL_ID(N'identity_writer') IS NULL CREATE ROLE [identity_writer];
ALTER ROLE [identity_writer] ADD MEMBER [identity_app];
GO

USE [trades];
IF USER_ID(N'trades_migrator') IS NULL CREATE USER [trades_migrator] FOR LOGIN [trades_migrator];
ALTER ROLE [db_owner] ADD MEMBER [trades_migrator];
IF USER_ID(N'trades_app') IS NULL CREATE USER [trades_app] FOR LOGIN [trades_app];
IF DATABASE_PRINCIPAL_ID(N'trades_writer') IS NULL CREATE ROLE [trades_writer];
ALTER ROLE [trades_writer] ADD MEMBER [trades_app];
GO
