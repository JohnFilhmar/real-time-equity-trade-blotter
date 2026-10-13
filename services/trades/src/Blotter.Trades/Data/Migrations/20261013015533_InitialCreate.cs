using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Blotter.Trades.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateSequence(
                name: "trade_id_seq",
                startValue: 100001L);

            migrationBuilder.CreateTable(
                name: "outbox_message",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    payload = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "datetimeoffset(3)", precision: 3, nullable: false),
                    published_at = table.Column<DateTimeOffset>(type: "datetimeoffset(3)", precision: 3, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("outbox_message_pkey", x => x.id);
                    table.CheckConstraint("outbox_message_payload_check", "ISJSON([payload]) = 1");
                });

            migrationBuilder.CreateTable(
                name: "trade",
                columns: table => new
                {
                    id = table.Column<string>(type: "char(36)", unicode: false, fixedLength: true, maxLength: 36, nullable: false, collation: "Latin1_General_100_BIN2"),
                    trade_id = table.Column<string>(type: "varchar(24)", unicode: false, maxLength: 24, nullable: false),
                    symbol = table.Column<string>(type: "varchar(12)", unicode: false, maxLength: 12, nullable: false, collation: "Latin1_General_100_CI_AS"),
                    side = table.Column<string>(type: "varchar(4)", unicode: false, maxLength: 4, nullable: false),
                    quantity = table.Column<int>(type: "int", nullable: false),
                    price = table.Column<decimal>(type: "decimal(18,6)", precision: 18, scale: 6, nullable: false),
                    currency = table.Column<string>(type: "varchar(3)", unicode: false, maxLength: 3, nullable: false),
                    trader = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false, collation: "Latin1_General_100_CI_AS"),
                    book = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false, collation: "Latin1_General_100_CI_AS"),
                    counterparty = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false, collation: "Latin1_General_100_CI_AS"),
                    trade_timestamp = table.Column<DateTimeOffset>(type: "datetimeoffset(3)", precision: 3, nullable: false),
                    status = table.Column<string>(type: "varchar(9)", unicode: false, maxLength: 9, nullable: false),
                    version = table.Column<int>(type: "int", nullable: false, defaultValue: 1),
                    created_at = table.Column<DateTimeOffset>(type: "datetimeoffset(3)", precision: 3, nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "datetimeoffset(3)", precision: 3, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("trade_pkey", x => x.id);
                    table.CheckConstraint("trade_currency_check", "[currency] IN ('USD', 'GBX')");
                    table.CheckConstraint("trade_price_check", "[price] > 0");
                    table.CheckConstraint("trade_quantity_check", "[quantity] > 0");
                    table.CheckConstraint("trade_side_check", "[side] IN ('BUY', 'SELL')");
                    table.CheckConstraint("trade_status_check", "[status] IN ('ACTIVE', 'CANCELLED')");
                    table.CheckConstraint("trade_version_check", "[version] >= 1");
                });

            migrationBuilder.CreateTable(
                name: "trade_event",
                columns: table => new
                {
                    id = table.Column<string>(type: "char(36)", unicode: false, fixedLength: true, maxLength: 36, nullable: false, collation: "Latin1_General_100_BIN2"),
                    trade_uuid = table.Column<string>(type: "char(36)", unicode: false, fixedLength: true, maxLength: 36, nullable: false, collation: "Latin1_General_100_BIN2"),
                    version = table.Column<int>(type: "int", nullable: false),
                    action = table.Column<string>(type: "varchar(9)", unicode: false, maxLength: 9, nullable: false),
                    source = table.Column<string>(type: "varchar(9)", unicode: false, maxLength: 9, nullable: false),
                    changes = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    actor = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    occurred_at = table.Column<DateTimeOffset>(type: "datetimeoffset(3)", precision: 3, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("trade_event_pkey", x => x.id);
                    table.CheckConstraint("trade_event_action_check", "[action] IN ('AMENDED', 'CANCELLED')");
                    table.CheckConstraint("trade_event_changes_check", "ISJSON([changes]) = 1");
                    table.CheckConstraint("trade_event_source_check", "[source] IN ('API', 'LIVE_FEED')");
                    table.ForeignKey(
                        name: "trade_event_trade_uuid_fkey",
                        column: x => x.trade_uuid,
                        principalTable: "trade",
                        principalColumn: "id");
                });

            migrationBuilder.CreateIndex(
                name: "outbox_message_pending_idx",
                table: "outbox_message",
                column: "id",
                filter: "[published_at] IS NULL");

            migrationBuilder.CreateIndex(
                name: "trade_book_idx",
                table: "trade",
                column: "book");

            migrationBuilder.CreateIndex(
                name: "trade_status_timestamp_idx",
                table: "trade",
                columns: new[] { "status", "trade_timestamp" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "trade_symbol_timestamp_idx",
                table: "trade",
                columns: new[] { "symbol", "trade_timestamp" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "trade_trade_id_key",
                table: "trade",
                column: "trade_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "trade_trader_idx",
                table: "trade",
                column: "trader");

            migrationBuilder.CreateIndex(
                name: "trade_event_occurred_idx",
                table: "trade_event",
                columns: new[] { "occurred_at", "id" },
                descending: new bool[0]);

            migrationBuilder.CreateIndex(
                name: "trade_event_trade_version_idx",
                table: "trade_event",
                columns: new[] { "trade_uuid", "version" });

            // Append-only, enforced rather than documented. The trigger holds for whichever login
            // connects, including the owner that runs migrations, and its error rolls the statement
            // back, so an accidental UPDATE fails loudly instead of rewriting history. Because the
            // foreign key does not cascade, a trade with history cannot be deleted either.
            migrationBuilder.Sql(
                """
                CREATE TRIGGER [trade_event_append_only] ON [trade_event]
                AFTER UPDATE, DELETE
                AS
                BEGIN
                    SET NOCOUNT ON;
                    DECLARE @operation nvarchar(6) = CASE WHEN EXISTS (SELECT 1 FROM inserted) THEN N'UPDATE' ELSE N'DELETE' END;
                    DECLARE @message nvarchar(200) = CONCAT(N'trade_event is append-only, ', @operation, N' is not permitted');
                    THROW 50001, @message, 1;
                END
                """);

            // The runtime login is a member of this role and nothing else. It can read and write what
            // the service writes, but holds no DELETE on trades or events and no ALTER on anything, so
            // it can neither delete history, truncate it, nor switch the trigger off. The role is
            // created here when the init job has not already made it, which is the case in tests.
            migrationBuilder.Sql(
                """
                IF DATABASE_PRINCIPAL_ID(N'trades_writer') IS NULL CREATE ROLE [trades_writer];
                GRANT SELECT, INSERT, UPDATE ON [trade] TO [trades_writer];
                GRANT SELECT, INSERT ON [trade_event] TO [trades_writer];
                GRANT SELECT, INSERT, UPDATE, DELETE ON [outbox_message] TO [trades_writer];
                GRANT UPDATE ON [trade_id_seq] TO [trades_writer];
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The trades_writer role stays: the init job owns its membership.
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS [trade_event_append_only];");

            migrationBuilder.DropTable(
                name: "outbox_message");

            migrationBuilder.DropTable(
                name: "trade_event");

            migrationBuilder.DropTable(
                name: "trade");

            migrationBuilder.DropSequence(
                name: "trade_id_seq");
        }
    }
}
