using FluentValidation;

namespace Blotter.Gateway.Validation;

/// <summary>A validator for a JSON request body, which must first of all be an object.</summary>
internal abstract class BodyValidator : ZodValidator<JsonBody>
{
    /// <summary>Declares the object check, which runs before every field rule.</summary>
    protected BodyValidator() =>
        RuleFor(body => body).Custom((body, context) =>
        {
            if (!body.IsObject)
            {
                context.AddFailure(string.Empty, $"Invalid input: expected object, received {body.TypeName}");
            }
        });

    /// <inheritdoc />
    protected override bool Applies(JsonBody input) => input.IsObject;
}
