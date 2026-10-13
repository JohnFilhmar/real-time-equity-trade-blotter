namespace Blotter.Gateway.Validation;

/// <summary><c>trade_event_query_schema</c>: a page size up to 500 and a cursor, with Zod's default messages.</summary>
internal sealed class EventQueryValidator : ZodValidator<QueryInput>
{
    /// <summary>Declares the rules.</summary>
    public EventQueryValidator()
    {
        Field("limit", query => QueryChecks.EventPageSize(query["limit"]));
        Field("cursor", query => QueryChecks.Text(query["cursor"]));
    }
}
