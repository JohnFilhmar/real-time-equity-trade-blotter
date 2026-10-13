namespace Blotter.Gateway.Validation.JavaScript;

/// <summary>
/// JavaScript's <c>String.prototype.trim</c>, which Zod's <c>.trim()</c> calls. .NET's own
/// <see cref="string.Trim()"/> differs on two characters: it keeps U+FEFF and strips U+0085, where
/// JavaScript does the opposite, so a ticket typed with either would validate differently.
/// </summary>
internal static class JsText
{
    /// <summary>
    /// ECMAScript WhiteSpace and LineTerminator code points, written as numbers because a raw U+2028
    /// in a character literal is a line break to the C# compiler.
    /// </summary>
    private static readonly char[] Whitespace =
    [
        '\t', '\n', '\v', '\f', '\r', ' ', (char)0x00A0, (char)0x1680,
        (char)0x2000, (char)0x2001, (char)0x2002, (char)0x2003, (char)0x2004, (char)0x2005,
        (char)0x2006, (char)0x2007, (char)0x2008, (char)0x2009, (char)0x200A,
        (char)0x2028, (char)0x2029, (char)0x202F, (char)0x205F, (char)0x3000, (char)0xFEFF,
    ];

    /// <summary>Removes leading and trailing whitespace exactly as JavaScript does.</summary>
    /// <param name="value">The text.</param>
    /// <returns>The trimmed text.</returns>
    public static string Trim(string value) => value.Trim(Whitespace);
}
