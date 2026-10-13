using System.Text.RegularExpressions;

namespace Blotter.Contracts.Reference;

/// <summary>
/// The limits and the sentences a trader reads, copied from <c>shared/src/schemas/trade.ts</c>.
/// The gateway answers a 422 with these exact strings because the frontend shows them under the
/// field, and the trades service checks the same limits again at its own boundary.
/// </summary>
public static partial class TradeRules
{
    /// <summary>The largest quantity a ticket may carry.</summary>
    public const int MaxQuantity = 10_000_000;

    /// <summary>The largest price a ticket may carry, in the quote currency.</summary>
    public const decimal MaxPrice = 10_000_000m;

    /// <summary>Decimal places a price is stored to, matching the <c>decimal(18,6)</c> column.</summary>
    public const int PriceScale = 6;

    /// <summary>Longest desk code.</summary>
    public const int MaxTraderLength = 32;

    /// <summary>Longest book name.</summary>
    public const int MaxBookLength = 64;

    /// <summary>Longest counterparty name.</summary>
    public const int MaxCounterpartyLength = 128;

    /// <summary>How far ahead of the server clock a trade time may sit, to allow for a fast client clock.</summary>
    public static readonly TimeSpan FutureTolerance = TimeSpan.FromMinutes(1);

    /// <summary>Whether a string is a business trade id, <c>TRD-</c> followed by at least six digits.</summary>
    /// <param name="value">The candidate.</param>
    /// <returns>True for ids such as <c>TRD-100001</c>.</returns>
    public static bool IsTradeId(string? value) => value is not null && TradeIdPattern().IsMatch(value);

    [GeneratedRegex(@"^TRD-[0-9]{6,}$", RegexOptions.CultureInvariant)]
    private static partial Regex TradeIdPattern();

    /// <summary>The user-facing sentences, verbatim from the shared Zod schemas and the Node service.</summary>
    public static class Messages
    {
        /// <summary>Symbol missing or outside the universe.</summary>
        public const string ChooseSymbol = "Choose a symbol from the list";

        /// <summary>Side missing or not BUY or SELL.</summary>
        public const string ChooseSide = "Choose Buy or Sell";

        /// <summary>Quantity missing or not a number.</summary>
        public const string EnterQuantity = "Enter a quantity";

        /// <summary>Quantity zero, negative or fractional.</summary>
        public const string QuantityWhole = "Quantity must be a whole number above zero";

        /// <summary>Quantity over <see cref="MaxQuantity"/>.</summary>
        public const string QuantityTooLarge = "Quantity cannot be more than 10,000,000";

        /// <summary>Price missing or not a number.</summary>
        public const string EnterPrice = "Enter a price";

        /// <summary>Price zero or negative.</summary>
        public const string PricePositive = "Price must be above zero";

        /// <summary>Price over <see cref="MaxPrice"/>.</summary>
        public const string PriceTooLarge = "Price cannot be more than 10,000,000";

        /// <summary>Book missing or blank.</summary>
        public const string EnterBook = "Enter a book";

        /// <summary>Book over <see cref="MaxBookLength"/>.</summary>
        public const string BookTooLong = "Book cannot be longer than 64 characters";

        /// <summary>Counterparty missing or blank.</summary>
        public const string EnterCounterparty = "Enter a counterparty";

        /// <summary>Counterparty over <see cref="MaxCounterpartyLength"/>.</summary>
        public const string CounterpartyTooLong = "Counterparty cannot be longer than 128 characters";

        /// <summary>Counterparty sent on an amendment.</summary>
        public const string CounterpartyFixed = "Counterparty cannot be changed on an amendment. Cancel the trade and book it again.";

        /// <summary>Trade time missing or not an ISO 8601 UTC timestamp.</summary>
        public const string EnterTradeTime = "Enter the trade time as a valid date and time";

        /// <summary>Trade time more than <see cref="FutureTolerance"/> ahead.</summary>
        public const string TradeTimeInFuture = "Trade time cannot be in the future";

        /// <summary>Version missing, fractional or below one.</summary>
        public const string ReloadTrade = "Reload the trade and try again";

        /// <summary>An amendment that names no field to change.</summary>
        public const string AmendmentEmpty = "An amendment must change at least one field";

        /// <summary>A path segment that is not a business trade id.</summary>
        public const string TradeIdShape = "trade id must look like TRD-100001";

        /// <summary>Field message on <c>quantity</c> when the notional breaches the desk limit.</summary>
        public const string OverDeskLimit = "This trade is over the desk limit. Lower the quantity or price.";

        /// <summary>The detail of a validation failure whose field errors say everything, from <c>validation_failed_detail</c>.</summary>
        public const string FieldsFailed = "One or more fields failed validation.";
    }
}
