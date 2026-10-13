using Blotter.Contracts.Wire;

namespace Blotter.Contracts.Reference;

/// <summary>One tradable name and what the blotter needs to know about it.</summary>
/// <param name="Symbol">Ticker as it appears on the blotter.</param>
/// <param name="Currency">The currency the name is quoted in.</param>
/// <param name="Book">The desk book the name is normally traded on.</param>
/// <param name="BasePrice">Price level the generated data and the marks drift around, in the quote currency.</param>
public sealed record Instrument(string Symbol, Currency Currency, string Book, decimal BasePrice);
