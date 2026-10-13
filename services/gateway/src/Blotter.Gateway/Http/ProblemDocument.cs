using System.Text.Json.Serialization;

namespace Blotter.Gateway.Http;

/// <summary>One field-level validation failure, matching <c>problem_field_error_schema</c>.</summary>
/// <param name="Field">The wire name of the field, or empty for the body as a whole.</param>
/// <param name="Message">The sentence a person reads under that field.</param>
internal sealed record ProblemFieldError(
    [property: JsonPropertyName("field")] string Field,
    [property: JsonPropertyName("message")] string Message);

/// <summary>
/// An RFC 9457 problem document, matching <c>problem_schema</c>. The optional members are left out
/// when empty rather than sent as null, because the frontend's schema refuses a null there and would
/// fall back to a generic error, losing the field messages.
/// </summary>
/// <param name="Type">The relative problem type, such as <c>/problems/validation-failed</c>.</param>
/// <param name="Title">The fixed title for the code.</param>
/// <param name="Status">The HTTP status, repeated in the body.</param>
/// <param name="Detail">What went wrong, in terms the client can act on.</param>
/// <param name="Instance">The path and query that produced it.</param>
/// <param name="Code">The machine-readable code.</param>
/// <param name="Errors">Field-level detail for a validation failure.</param>
/// <param name="RequestId">The correlation id, also on the <c>x-request-id</c> header.</param>
internal sealed record ProblemDocument(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("status")] int Status,
    [property: JsonPropertyName("detail"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Detail,
    [property: JsonPropertyName("instance"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Instance,
    [property: JsonPropertyName("code")] string Code,
    [property: JsonPropertyName("errors"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] IReadOnlyList<ProblemFieldError>? Errors,
    [property: JsonPropertyName("request_id"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? RequestId);
