using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Blotter.Gateway.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "app_user",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    username = table.Column<string>(type: "varchar(64)", unicode: false, maxLength: 64, nullable: false, collation: "Latin1_General_100_CS_AS"),
                    password_hash = table.Column<string>(type: "varchar(255)", unicode: false, maxLength: 255, nullable: false),
                    display_name = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    trader_code = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    role = table.Column<string>(type: "varchar(6)", unicode: false, maxLength: 6, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "datetimeoffset(3)", precision: 3, nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "datetimeoffset(3)", precision: 3, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("app_user_pkey", x => x.id);
                    table.CheckConstraint("app_user_role_check", "[role] IN ('VIEWER', 'TRADER', 'ADMIN')");
                });

            migrationBuilder.CreateIndex(
                name: "app_user_trader_code_idx",
                table: "app_user",
                column: "trader_code");

            migrationBuilder.CreateIndex(
                name: "app_user_username_key",
                table: "app_user",
                column: "username",
                unique: true);

            // The runtime login is a member of this role and nothing else: it reads accounts, inserts
            // the demo seed and rehashes passwords, but cannot delete an account or change the schema.
            // The role is created here when the init job has not already made it, as in tests.
            migrationBuilder.Sql(
                """
                IF DATABASE_PRINCIPAL_ID(N'identity_writer') IS NULL CREATE ROLE [identity_writer];
                GRANT SELECT, INSERT, UPDATE ON [app_user] TO [identity_writer];
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The identity_writer role stays: the init job owns its membership.
            migrationBuilder.DropTable(
                name: "app_user");
        }
    }
}
