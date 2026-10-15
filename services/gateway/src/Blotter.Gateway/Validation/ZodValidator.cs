using FluentValidation;

namespace Blotter.Gateway.Validation;

/// <summary>
/// A FluentValidation validator that reports the way the shared Zod schemas did: every field's
/// messages in schema order, under its wire name, then the object-level refines, which only run
/// when no field failed at the type level.
/// </summary>
/// <typeparam name="T">The raw input: a body, a query, or a route value.</typeparam>
internal abstract class ZodValidator<T> : AbstractValidator<T>
{
    private readonly List<Func<T, Check>> fields = [];

    /// <summary>Whether the field rules apply to this input at all. A body that is not an object skips them.</summary>
    /// <param name="input">The input.</param>
    /// <returns>True by default.</returns>
    protected virtual bool Applies(T input) => true;

    /// <summary>Declares one field's rules, in schema order.</summary>
    /// <param name="name">The wire name errors are reported under, such as <c>quantity</c>.</param>
    /// <param name="check">Evaluates the field.</param>
    protected void Field(string name, Func<T, Check> check)
    {
        fields.Add(check);
        RuleFor(input => input).Custom((input, context) =>
        {
            if (!Applies(input))
            {
                return;
            }

            foreach (var message in check(input).Messages)
            {
                context.AddFailure(name, message);
            }
        });
    }

    /// <summary>Declares an object-level rule, run after every field and only when none failed at the type level.</summary>
    /// <param name="name">The field the error is reported under.</param>
    /// <param name="message">The message.</param>
    /// <param name="broken">True when the rule is broken.</param>
    protected void Refine(string name, string message, Func<T, bool> broken) =>
        RuleFor(input => input).Custom((input, context) =>
        {
            if (Applies(input) && fields.TrueForAll(check => !check(input).Aborted) && broken(input))
            {
                context.AddFailure(name, message);
            }
        });
}
