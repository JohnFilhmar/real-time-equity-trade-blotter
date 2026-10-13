using Blotter.Gateway.Http;
using FluentValidation;

namespace Blotter.Gateway.Validation;

/// <summary>Runs a validator and turns its failures into the 422 the Node API sent.</summary>
internal static class ValidationExtensions
{
    /// <summary>Validates input, refusing it with every field error in schema order.</summary>
    /// <typeparam name="T">The input type.</typeparam>
    /// <param name="validator">The validator.</param>
    /// <param name="input">The input.</param>
    /// <exception cref="ApiProblem">A 422 listing the failures.</exception>
    public static void Ensure<T>(this IValidator<T> validator, T input)
    {
        ArgumentNullException.ThrowIfNull(validator);

        var result = validator.Validate(input);
        if (!result.IsValid)
        {
            throw ApiProblem.Validation([.. result.Errors.Select(error => new ProblemFieldError(error.PropertyName, error.ErrorMessage))]);
        }
    }
}
